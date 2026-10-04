import { Router } from "express";
import mongoose from "mongoose";
import Site from "../models/Site.js";
import Submission from "../models/Submission.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

const checklistKeys = [
  "ppe",
  "fallProtection",
  "laddersScaffolding",
  "toolsCords",
  "hazardsIdentified",
  "siteOrientation",
  "emergencyProcedures",
  "firstAid",
  "fireSafety",
  "accessRoutes",
  "housekeeping",
  "materialStorage",
  "overheadHazards",
  "openingsGuarded",
  "equipment",
  "vehicleTraffic",
  "weatherConditions",
  "taskCommunication",
];

router.use(requireAuth);

router.get("/sites", async (_req, res) => {
  const sites = await Site.find({ active: true })
    .select("name address")
    .sort({ name: 1 })
    .lean();

  res.json({ sites });
});

router.get("/submissions", async (req, res, next) => {
  try {
    const filter = req.user.role === "ADMIN" ? {} : { worker: req.user._id };

    const { siteId, workerId, from, to } = req.query;

    function validDate(value) {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
      }

      const date = new Date(`${value}T00:00:00.000Z`);

      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    }

    if (siteId !== undefined) {
      if (
        typeof siteId !== "string" ||
        !mongoose.isObjectIdOrHexString(siteId)
      ) {
        return res.status(400).json({ message: "Invalid site filter." });
      }

      filter.site = new mongoose.Types.ObjectId(siteId);
    }

    if (workerId !== undefined) {
      if (req.user.role !== "ADMIN") {
        return res.status(403).json({ message: "Access denied." });
      }

      if (
        typeof workerId !== "string" ||
        !mongoose.isObjectIdOrHexString(workerId)
      ) {
        return res.status(400).json({ message: "Invalid worker filter." });
      }

      filter.worker = new mongoose.Types.ObjectId(workerId);
    }

    if (
      (from !== undefined && !validDate(from)) ||
      (to !== undefined && !validDate(to)) ||
      (from && to && from > to)
    ) {
      return res.status(400).json({
        message: "Enter a valid date range.",
      });
    }

    if (from || to) {
      filter.workDate = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const [submissions, siteSummary] = await Promise.all([
      Submission.find(filter)
        .populate("worker", "name")
        .populate("site", "name")
        .populate("authorizedBy", "name")
        .populate("revokedBy", "name")
        .sort({ workDate: -1, createdAt: -1 })
        .limit(100)
        .lean(),

      Submission.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$site",
            total: { $sum: 1 },
            authorized: {
              $sum: {
                $cond: [{ $eq: ["$status", "AUTHORIZED"] }, 1, 0],
              },
            },
          },
        },
        {
          $lookup: {
            from: Site.collection.name,
            localField: "_id",
            foreignField: "_id",
            as: "site",
          },
        },
        {
          $project: {
            _id: 0,
            siteId: { $toString: "$_id" },
            name: {
              $ifNull: [
                { $arrayElemAt: ["$site.name", 0] },
                "Unavailable site",
              ],
            },
            total: 1,
            authorized: 1,
          },
        },
        { $sort: { name: 1 } },
      ]),
    ]);

    const total = siteSummary.reduce((sum, site) => sum + site.total, 0);
    const authorized = siteSummary.reduce(
      (sum, site) => sum + site.authorized,
      0,
    );

    res.json({
      submissions,
      summary: {
        total,
        authorized,
        awaitingAuthorization: total - authorized,
        sites: siteSummary,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/submissions", requireRole("FRAMER"), async (req, res) => {
  const { siteId, workDate, checklist, notes = "" } = req.body ?? {};

  if (typeof siteId !== "string" || !mongoose.isObjectIdOrHexString(siteId)) {
    return res.status(400).json({ message: "Select a valid site." });
  }

  if (typeof workDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return res.status(400).json({ message: "Select a valid work date." });
  }

  const parsedDate = new Date(`${workDate}T00:00:00.000Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== workDate
  ) {
    return res.status(400).json({ message: "Select a valid work date." });
  }

  if (
    !checklist ||
    !checklistKeys.every((key) => typeof checklist[key] === "boolean")
  ) {
    return res.status(400).json({
      message: "Answer every safety checklist item.",
    });
  }

  if (typeof notes !== "string" || notes.length > 5000) {
    return res.status(400).json({
      message: "Notes must be no more than 5,000 characters.",
    });
  }

  const site = await Site.findOne({ _id: siteId, active: true });

  if (!site) {
    return res.status(400).json({ message: "Site is unavailable." });
  }

  const safeChecklist = Object.fromEntries(
    checklistKeys.map((key) => [key, checklist[key]]),
  );

  const submission = await Submission.create({
    worker: req.user._id,
    site: site._id,
    workDate,
    checklist: safeChecklist,
    notes: notes.trim(),
  });

  res.status(201).json({ submission });
});

router.get("/submissions/:id", async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ message: "Invalid submission ID." });
  }

  const filter = { _id: req.params.id };

  // Workers can only open their own records.
  if (req.user.role !== "ADMIN") {
    filter.worker = req.user._id;
  }

  const submission = await Submission.findOne(filter)
    .populate("worker", "name")
    .populate("site", "name")
    .lean();

  if (!submission) {
    return res.status(404).json({ message: "Submission not found." });
  }

  res.json({ submission });
});

router.post("/sites", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { name, address = "" } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 120 ||
      typeof address !== "string" ||
      address.trim().length > 300
    ) {
      return res.status(400).json({
        message:
          "Enter a site name (maximum 120 characters) and an optional address (maximum 300 characters).",
      });
    }

    const site = await Site.create({
      name: name.trim(),
      address: address.trim(),
      active: true,
    });

    res.status(201).json({
      site: {
        _id: String(site._id),
        name: site.name,
        address: site.address,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A site with that name already exists.",
      });
    }

    next(error);
  }
});

router.patch(
  "/submissions/:id/authorize",
  requireRole("ADMIN"),
  async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({
        message: "Invalid submission ID.",
      });
    }

    // Update only once, preserving the original authorizer and time.
    let submission = await Submission.findOneAndUpdate(
      {
        _id: req.params.id,
        status: { $in: ["SUBMITTED", "REVIEWED"] },
      },
      {
        $set: {
          status: "AUTHORIZED",
          authorizedBy: req.user._id,
          authorizedAt: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true },
    )
      .populate("worker", "name")
      .populate("site", "name")
      .populate("authorizedBy", "name")
      .lean();

    if (!submission) {
      submission = await Submission.findById(req.params.id)
        .populate("worker", "name")
        .populate("site", "name")
        .populate("authorizedBy", "name")
        .lean();
    }

    if (!submission) {
      return res.status(404).json({
        message: "Submission not found.",
      });
    }

    res.json({ submission });
  },
);

router.patch(
  "/submissions/:id/revoke",
  requireRole("ADMIN"),
  async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({
        message: "Invalid submission ID.",
      });
    }

    let submission = await Submission.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "AUTHORIZED",
      },
      {
        $set: {
          status: "SUBMITTED",
          revokedBy: req.user._id,
          revokedAt: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true },
    )
      .populate("worker", "name")
      .populate("site", "name")
      .populate("authorizedBy", "name")
      .populate("revokedBy", "name")
      .populate("revokedBy", "name")
      .lean();

    if (!submission) {
      return res.status(409).json({
        message: "Form is unavailable or is no longer authorized. Reopen it.",
      });
    }

    res.json({ submission });
  },
);

// Update the existing site without changing submission references.
router.patch("/sites/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({ message: "Invalid site ID." });
    }

    const { name, address = "" } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 120 ||
      typeof address !== "string" ||
      address.trim().length > 300
    ) {
      return res.status(400).json({
        message:
          "Enter a site name (maximum 120 characters) and an optional address (maximum 300 characters).",
      });
    }

    const site = await Site.findOneAndUpdate(
      { _id: req.params.id, active: true },
      {
        $set: {
          name: name.trim(),
          address: address.trim(),
        },
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!site) {
      return res.status(404).json({
        message: "Site not found or unavailable.",
      });
    }

    res.json({
      site: {
        _id: String(site._id),
        name: site.name,
        address: site.address,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A site with that name already exists.",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Enter valid site details.",
      });
    }

    next(error);
  }
});

export default router;
