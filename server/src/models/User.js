import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["FRAMER", "ADMIN"],
      required: true,
    },
    trade: {
      type: String,
      trim: true,
      default: "Framer",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sessionVersion: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);