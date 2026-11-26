
import { Router } from "express";
import mongoose from "mongoose";
import Submission from "../models/Submission.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
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

function accessibleFilter(req) {
  const filter = { _id: req.params.id };

  if (req.user.role !== "ADMIN") {
    filter.worker = req.user._id;
  }

  return filter;
}

router.use("/submissions/:id/photos", (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ message: "Invalid submission ID." });
  }

  next();
});

router.get("/submissions/:id/photos", async (req, res) => {
  const submission = await Submission.findOne(accessibleFilter(req));

  if (!submission) {
    return res.status(404).json({ message: "Submission not found." });
  }

  const photos = await signedPhotos(submission.photos);

  res.set("Cache-Control", "no-store");
  res.json({ photos });
});

router.post(
  "/submissions/:id/photos",
  requireRole("FRAMER"),
  async (req, res, next) => {
    const submission = await Submission.findOne({
      _id: req.params.id,
      worker: req.user._id,
      status: "SUBMITTED",
    });

    if (!submission) {
      return res.status(409).json({
        message: "Photos can only be added to your Submitted forms.",
      });
    }

    next();
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
      prepared = await preparePhotos(req.files, `submissions/${req.params.id}`);
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
      updated = await Submission.findOneAndUpdate(
        {
          _id: req.params.id,
          worker: req.user._id,
          status: "SUBMITTED",
          $expr: {
            $lte: [
              { $size: { $ifNull: ["$photos", []] } },
              MAX_PHOTOS - prepared.length,
            ],
          },
        },
        {
          $push: {
            photos: {
              $each: photoMetadata(prepared),
            },
          },
        },
        { returnDocument: "after", runValidators: true }
      );
    } catch {
      // The write may have committed before a connection failure.
      // Retain objects rather than risk deleting referenced photos.
      console.error("Photo metadata save uncertain; reconciliation needed.");

      return res.status(503).json({
        message:
          "Could not confirm the save. Refresh the photo panel before retrying.",
      });
    }

    if (!updated) {
      await deletePhotoObjects(uploadedKeys);

      return res.status(409).json({
        message:
          "Form status changed or the five-photo limit was exceeded.",
      });
    }

    res.status(201).json({ message: "Photos saved." });
  }
);

export default router;