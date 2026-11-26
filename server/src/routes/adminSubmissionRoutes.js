import { Router } from "express";
import mongoose from "mongoose";
import Submission from "../models/Submission.js";
import User from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { businessDate, parseAdminFilters, csvHeader, csvSubmission } from "../utils/adminSubmissionHelpers.js";
import HazardReport from "../models/HazardReport.js";
import { buildLeaderboard } from "../utils/leaderboard.js";
import { buildBadges, monthRange, monthWinners, previousMonth } from "../utils/badges.js";

const router = Router();

function matches(filters) {
  const base = {};
  if (filters.siteId) base.site = new mongoose.Types.ObjectId(filters.siteId);
  if (filters.workerId) base.worker = new mongoose.Types.ObjectId(filters.workerId);
  if (filters.from || filters.to) {
    base.workDate = {};
    if (filters.from) base.workDate.$gte = filters.from;
    if (filters.to) base.workDate.$lte = filters.to;
  }
  const list = { ...base };
  if (filters.status === "AUTHORIZED") list.status = "AUTHORIZED";
  if (filters.status === "AWAITING") list.status = { $in: ["SUBMITTED", "REVIEWED"] };
  return { base, list };
}

function populateNames(query) {
  return query.populate("worker", "name").populate("site", "name")
    .populate("authorizedBy", "name").populate("revokedBy", "name");
}

router.get("/admin-dashboard", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { base, list } = matches(parseAdminFilters(req.query));
    const today = businessDate();
    const authorizedCount = { $sum: { $cond: [{ $eq: ["$status", "AUTHORIZED"] }, 1, 0] } };
    const [submissions, aggregates, matchingTotal, workers, submittedWorkerIds] = await Promise.all([
      populateNames(Submission.find(list).sort({ createdAt: -1, _id: -1 }).limit(100)).lean(),
      Submission.aggregate([
        { $match: base },
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 }, authorized: authorizedCount } }],
          sites: [
            { $group: { _id: "$site", total: { $sum: 1 }, authorized: authorizedCount } },
            { $sort: { total: -1, _id: 1 } },
            { $addFields: { site: "$_id" } },
          ],
        } },
      ]),
      Submission.countDocuments(list),
      User.find({ role: "FRAMER", isActive: { $ne: false } }).sort({ name: 1 }).select("name trade").lean(),
      Submission.distinct("worker", { workDate: today }),
    ]);
    // Populate grouped sites through the already-registered Site model.
    const siteGroups = await Submission.populate(aggregates[0]?.sites ?? [], {
      path: "site", model: "Site", select: "name",
    });
    const totals = aggregates[0]?.totals[0] ?? { total: 0, authorized: 0 };
    const submitted = new Set(submittedWorkerIds.map(String));
    const missingWorkers = workers.filter((worker) => !submitted.has(String(worker._id)))
      .map((worker) => ({ id: String(worker._id), name: worker.name, trade: worker.trade ?? "Framer" }));
    res.set("Cache-Control", "no-store");
    res.json({
      submissions,
      matchingTotal,
      summary: {
        total: totals.total,
        authorized: totals.authorized,
        awaitingAuthorization: totals.total - totals.authorized,
        sites: siteGroups.map((group) => ({
          siteId: String(group._id), name: group.site?.name ?? "Unavailable site",
          total: group.total, authorized: group.authorized,
        })),
      },
      today: {
        date: today,
        activeWorkerCount: workers.length,
        submittedWorkerCount: workers.length - missingWorkers.length,
        missingWorkers,
      },
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    next(error);
  }
});

function leaderboardSubmissions(filter) {
  return Submission.find(filter).select("worker workDate createdAt").populate("worker", "name").lean();
}

// Last month's champion across all sites, regardless of the board's filters.
async function lastMonthChampion() {
  const month = previousMonth(businessDate());
  const { from, to } = monthRange(month);
  const winners = monthWinners(await leaderboardSubmissions({ workDate: { $gte: from, $lte: to } }));
  return winners.length ? { month, winners } : null;
}

// Response leaderboard: available to every signed-in user so crews can see
// who responded first. Only names and submission times are returned.
router.get("/leaderboard", requireAuth, async (req, res, next) => {
  try {
    const { siteId, from, to } = parseAdminFilters(req.query);
    const { base } = matches({ siteId, from, to });
    const [submissions, monthlyChampion] = await Promise.all([
      leaderboardSubmissions(base),
      lastMonthChampion(),
    ]);
    res.set("Cache-Control", "no-store");
    res.json({ from, to, ...buildLeaderboard(submissions), monthlyChampion });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    next(error);
  }
});

// Admins see every active worker's badges; framers see only their own.
router.get("/badges", requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === "ADMIN";
    const [workers, submissions, hazardTotals] = await Promise.all([
      isAdmin
        ? User.find({ role: "FRAMER", isActive: { $ne: false } }).select("name").lean()
        : Promise.resolve([{ _id: req.user._id, name: req.user.name }]),
      leaderboardSubmissions({}),
      HazardReport.aggregate([{ $group: { _id: "$reporter", count: { $sum: 1 } } }]),
    ]);
    const hazardCounts = new Map(hazardTotals.map(({ _id, count }) => [String(_id), count]));
    res.set("Cache-Control", "no-store");
    res.json(buildBadges({ workers, submissions, hazardCounts, today: businessDate() }));
  } catch (error) {
    next(error);
  }
});

router.get("/admin-export", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const filters = parseAdminFilters(req.query);
    const { list } = matches(filters);
    const lines = [csvHeader()];
    let total = 0;
    // No limit(100): export every match. Cursor avoids retaining full documents.
    const cursor = populateNames(Submission.find(list).sort({ createdAt: -1, _id: -1 })).lean().cursor();
    try {
      for await (const submission of cursor) {
        lines.push(csvSubmission(submission));
        total += 1;
      }
    } finally {
      await cursor.close();
    }
    res.set("Cache-Control", "no-store");
    // JSON works with the app's existing authenticated api() helper.
    res.json({
      filename: `RAS-submissions-${filters.from || "all"}-to-${filters.to || "all"}-${filters.status.toLowerCase()}.csv`,
      csv: "\uFEFF" + lines.join("\r\n") + "\r\n",
      total,
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    next(error);
  }
});

export default router;
