import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";
import Site from "./models/Site.js";

async function seed() {
  const password = process.env.SEED_PASSWORD;

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing.");
  }

  if (!password || password.length < 12) {
    throw new Error("Set SEED_PASSWORD to at least 12 characters.");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  await Promise.all([User.init(), Site.init()]);

  const passwordHash = await bcrypt.hash(password, 12);

  const accounts = [
    {
      name: "Demo Admin",
      email: "admin@example.com",
      role: "ADMIN",
    },
    {
      name: "Demo Framer",
      email: "framer@example.com",
      role: "FRAMER",
    },
    {
      name: "Second Framer",
      email: "framer2@example.com",
      role: "FRAMER",
    },
  ];

  for (const account of accounts) {
    await User.updateOne(
      { email: account.email },
      {
        $setOnInsert: {
          ...account,
          passwordHash,
        },
      },
      { upsert: true, runValidators: true }
    );
  }

  for (const name of ["Cedar Heights", "Harbour View", "Westshore"]) {
    await Site.updateOne(
      { name },
      { $setOnInsert: { name, active: true } },
      { upsert: true, runValidators: true }
    );
  }

  console.log("Seed complete: demo accounts and sites are available.");
  console.log("Existing accounts and passwords were left unchanged.");
}

try {
  await seed();
} catch (error) {
  console.error(
    error.name === "Error"
      ? error.message
      : `Seed failed (${error.name}).`
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}