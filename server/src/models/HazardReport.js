import mongoose from "mongoose";
import { photoSchema } from "./Submission.js";

export const HAZARD_TYPES = ["HAZARD", "NEAR_MISS"];
export const HAZARD_SEVERITIES = ["LOW", "MEDIUM", "HIGH"];
export const HAZARD_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"];

const hazardReportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
      required: true,
    },
    type: { type: String, enum: HAZARD_TYPES, required: true },
    severity: { type: String, enum: HAZARD_SEVERITIES, required: true },
    location: { type: String, trim: true, maxlength: 200, default: "" },
    description: { type: String, trim: true, required: true, maxlength: 2000 },
    status: { type: String, enum: HAZARD_STATUSES, default: "OPEN" },
    adminNote: { type: String, trim: true, maxlength: 1000, default: "" },
    statusUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    statusUpdatedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    photos: { type: [photoSchema], default: [] },
  },
  { timestamps: true },
);

hazardReportSchema.index({ status: 1, createdAt: -1 });
hazardReportSchema.index({ reporter: 1, createdAt: -1 });

export default mongoose.model("HazardReport", hazardReportSchema);
