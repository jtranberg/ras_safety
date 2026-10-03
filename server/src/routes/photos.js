
import "dotenv/config";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import multer from "multer";
import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Submission from "../models/Submission.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

const storage = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.R2_BUCKET;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
    fields: 0,
    parts: 5,
  },
}).array("photos", 5);

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

  const photos = await Promise.all(
    submission.photos.map(async (photo) => ({
      id: String(photo._id),
      name: photo.originalName,
      url: await getSignedUrl(
        storage,
        new GetObjectCommand({
          Bucket: bucket,
          Key: photo.objectKey,
        }),
        { expiresIn: 300 }
      ),
    }))
  );

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
    upload(req, res, (error) => {
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

    // Decode actual image content rather than trusting its extension.
    const prepared = [];

    try {
      for (const file of req.files) {
        const image = sharp(file.buffer, {
          limitInputPixels: 40000000,
        });

        const metadata = await image.metadata();

        if (
          !["jpeg", "png", "webp"].includes(metadata.format) ||
          (metadata.pages ?? 1) > 1
        ) {
          throw new Error("Unsupported image");
        }

        const buffer = await image
          .rotate()
          .resize({
            width: 2000,
            height: 2000,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer();

        prepared.push({
          buffer,
          objectKey: `submissions/${req.params.id}/${randomUUID()}.webp`,
          originalName: file.originalname.slice(0, 200),
          contentType: "image/webp",
          size: buffer.length,
        });
      }
    } catch {
      return res.status(400).json({
        message: "Use valid, non-animated JPEG, PNG or WebP photos.",
      });
    }

    const uploadedKeys = [];

    async function cleanup() {
      const results = await Promise.allSettled(
        uploadedKeys.map((key) =>
          storage.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: key })
          )
        )
      );

      if (results.some((result) => result.status === "rejected")) {
        console.error("Photo cleanup incomplete; inspect R2 objects.");
      }
    }

       try {
      for (const photo of prepared) {
        // Include the key before upload so cleanup covers a lost response.
        uploadedKeys.push(photo.objectKey);

        await storage.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: photo.objectKey,
            Body: photo.buffer,
            ContentType: photo.contentType,
          })
        );
      }
    } catch (err) {
      console.error("R2 upload failed:", {
        name: err.name,
        code: err.code,
        message: err.message,
        status: err.$metadata?.httpStatusCode,
      });

      await cleanup();

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
              5 - prepared.length,
            ],
          },
        },
        {
          $push: {
            photos: {
              $each: prepared.map(({ buffer, ...metadata }) => metadata),
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
      await cleanup();

      return res.status(409).json({
        message:
          "Form status changed or the five-photo limit was exceeded.",
      });
    }

    res.status(201).json({ message: "Photos saved." });
  }
);

export default router;