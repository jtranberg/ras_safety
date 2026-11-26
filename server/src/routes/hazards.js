import { Router } from "express";
import mongoose from "mongoose";
import HazardReport, { HAZARD_STATUSES } from "../models/HazardReport.js";
import Site from "../models/Site.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  parseHazardReport,
  parseHazardStatus,
  parseHazardFilters,
  publicHazardReport,
} from "../utils/hazardReports.js";
import {
  MAX_PHOTOS,
  receivePhotos,
  signedPhotos,
  preparePhotos,
  uploadPhotos,
  deletePhotoObjects,
  photoMetadata,
} from "../utils/photoStorage.js";

const router = Router();

router.use(requireAuth);

router.param("id", (req, res, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id)) {
    return res.status(400).json({ message: "Invalid hazard report ID." });
  }
  next();
});

function withNames(query) {
  return query
    .populate("reporter", "name")
    .populate("site", "name")
    .populate("statusUpdatedBy", "name");
}

// Workers only see their own reports; admins see everyone's.
function visibleTo(user) {
  return user.role === "ADMIN" ? {} : { reporter: user._id };
}

router.get("/", async (req, res, next) => {
  try {
    const parsed = parseHazardFilters(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const { status, ...scope } = parsed.value;
    const base = { ...visibleTo(req.user), ...scope };

    const [reports, statusCounts] = await Promise.all([
      withNames(HazardReport.find(status ? { ...base, status } : base))
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      HazardReport.aggregate([
        { $match: base },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const counts = Object.fromEntries(HAZARD_STATUSES.map((value) => [value, 0]));
    for (const { _id, count } of statusCounts) {
      if (_id in counts) counts[_id] = count;
    }

    res.set("Cache-Control", "no-store");
    res.json({ reports: reports.map(publicHazardReport), counts });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = parseHazardReport(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const { siteId, ...details } = parsed.value;
    const site = await Site.findOne({ _id: siteId, active: true });
    if (!site) return res.status(400).json({ message: "Site is unavailable." });

    const created = await HazardReport.create({
      ...details,
      reporter: req.user._id,
      site: site._id,
    });
    const report = await withNames(HazardReport.findById(created._id)).lean();

    res.status(201).json({ report: publicHazardReport(report) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const parsed = parseHazardStatus(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const { status, previousStatus, note } = parsed.value;
    const now = new Date();
    const update = {
      status,
      adminNote: note,
      statusUpdatedBy: req.user._id,
      statusUpdatedAt: now,
    };
    // Keep the original resolution time when only the note changes.
    if (status !== previousStatus) update.resolvedAt = status === "RESOLVED" ? now : null;

    const report = await withNames(
      HazardReport.findOneAndUpdate(
        { _id: req.params.id, status: previousStatus },
        { $set: update },
        { returnDocument: "after", runValidators: true },
      ),
    ).lean();

    if (!report) {
      const exists = await HazardReport.exists({ _id: req.params.id });
      return exists
        ? res.status(409).json({ message: "This report was updated by someone else. Refresh to see the latest status." })
        : res.status(404).json({ message: "Hazard report not found." });
    }

    res.json({ report: publicHazardReport(report) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/photos", async (req, res, next) => {
  try {
    const report = await HazardReport.findOne({
      _id: req.params.id,
      ...visibleTo(req.user),
    });

    if (!report) return res.status(404).json({ message: "Hazard report not found." });

    const photos = await signedPhotos(report.photos);

    res.set("Cache-Control", "no-store");
    res.json({ photos });
  } catch (error) {
    next(error);
  }
});

// Only the reporter can attach photos, and only until the report is resolved.
const editableBy = (req) => ({
  _id: req.params.id,
  reporter: req.user._id,
  status: { $ne: "RESOLVED" },
});

router.post(
  "/:id/photos",
  async (req, res, next) => {
    try {
      if (!(await HazardReport.exists(editableBy(req)))) {
        return res.status(409).json({
          message: "Photos can only be added to your own unresolved reports.",
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  },
  (req, res, next) => {
    receivePhotos(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          message: "Upload up to five photos, no more than 5 MB each.",
        });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.files?.length) {
      return res.status(400).json({ message: "Select at least one photo." });
    }

    let prepared;
    try {
      prepared = await preparePhotos(req.files, `hazards/${req.params.id}`);
    } catch {
      return res.status(400).json({
        message: "Use valid, non-animated JPEG, PNG or WebP photos.",
      });
    }

    let uploadedKeys;
    try {
      uploadedKeys = await uploadPhotos(prepared);
    } catch {
      return res.status(502).json({
        message: "Photo storage failed. Please try again.",
      });
    }

    let updated;
    try {
      updated = await HazardReport.findOneAndUpdate(
        {
          ...editableBy(req),
          $expr: {
            $lte: [
              { $size: { $ifNull: ["$photos", []] } },
              MAX_PHOTOS - prepared.length,
            ],
          },
        },
        { $push: { photos: { $each: photoMetadata(prepared) } } },
        { returnDocument: "after", runValidators: true },
      );
    } catch {
      // The write may have committed before a connection failure.
      // Retain objects rather than risk deleting referenced photos.
      console.error("Hazard photo metadata save uncertain; reconciliation needed.");
      return res.status(503).json({
        message: "Could not confirm the save. Refresh the photo panel before retrying.",
      });
    }

    if (!updated) {
      await deletePhotoObjects(uploadedKeys);
      return res.status(409).json({
        message: "The report was resolved or the five-photo limit was exceeded.",
      });
    }

    res.status(201).json({ message: "Photos saved." });
  },
);

export default router;
