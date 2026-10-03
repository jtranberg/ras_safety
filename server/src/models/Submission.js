import mongoose from "mongoose";

const checklistSchema = new mongoose.Schema(
  {
    ppe: { type: Boolean, required: true },
    fallProtection: { type: Boolean, required: true },
    laddersScaffolding: { type: Boolean, required: true },
    toolsCords: { type: Boolean, required: true },
    hazardsIdentified: { type: Boolean, required: true },
  },
  { _id: false }
);

const photoSchema = new mongoose.Schema(
  {
    // Identifies the photo in object storage.
    objectKey: { type: String, required: true },
    originalName: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

const submissionSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
      required: true,
    },
    // Local work date, stored independently of UTC submission time.
    workDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    checklist: {
      type: checklistSchema,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    status: {
  type: String,
  enum: ["SUBMITTED", "REVIEWED", "AUTHORIZED"],
  default: "SUBMITTED",
},
authorizedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},
authorizedAt: {
  type: Date,
  default: null,
},
revokedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},
revokedAt: {
  type: Date,
  default: null,
},
    photos: {
      type: [photoSchema],
      default: [],
    },
  },
  { timestamps: true }
);

submissionSchema.index({ worker: 1, workDate: -1 });
submissionSchema.index({ site: 1, workDate: -1 });

export default mongoose.model("Submission", submissionSchema);