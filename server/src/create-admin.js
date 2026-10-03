import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";

async function createAdmin() {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } =
    process.env;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is required.");
  }

  if (
    !ADMIN_NAME?.trim() ||
    ADMIN_NAME.trim().length > 100 ||
    !ADMIN_EMAIL ||
    ADMIN_EMAIL.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL.trim()) ||
    !ADMIN_PASSWORD ||
    ADMIN_PASSWORD.trim().length < 8 ||
    Buffer.byteLength(ADMIN_PASSWORD, "utf8") > 72
  ) {
    throw new Error(
      "Set ADMIN_NAME, a valid ADMIN_EMAIL, and ADMIN_PASSWORD " +
      "(at least 8 characters, maximum 72 UTF-8 bytes)."
    );
  }

  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    console.log("An account with that email already exists. No changes made.");
    return;
  }

  await User.create({
    name: ADMIN_NAME.trim(),
    email,
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
    role: "ADMIN",
    isActive: true,
    sessionVersion: 0,
  });

  console.log("Admin account created.");
}

try {
  await createAdmin();
} catch (error) {
  if (error.code === 11000) {
    console.error("An account with that email already exists.");
  } else if (
    error.name === "MongoServerSelectionError" ||
    error.name === "MongoParseError"
  ) {
    console.error("Database connection failed. Check your configuration.");
  } else {
    console.error(
      error.name === "Error"
        ? error.message
        : `Admin creation failed (${error.name}).`
    );
  }

  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}