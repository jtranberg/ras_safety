import "dotenv/config";
import mongoose from "mongoose";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import User from "./models/User.js";
import Submission from "./models/Submission.js";

const apply = process.argv.includes("--apply");
const keepEmails = ["admin@example.com", "framer@example.com"];

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing.");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const users = await User.find({})
    .select("_id email role")
    .lean();

  const kept = keepEmails.map((email) => {
    const matches = users.filter((user) => user.email === email);

    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one account for ${email}; nothing deleted.`
      );
    }

    return matches[0];
  });

  if (kept[0].role !== "ADMIN" || kept[1].role !== "FRAMER") {
    throw new Error("Demo account roles do not match; nothing deleted.");
  }

  const keptIds = new Set(kept.map((user) => String(user._id)));

  const removeIds = users
    .filter((user) => !keptIds.has(String(user._id)))
    .map((user) => user._id);

  const submissions = await Submission.find({})
    .select("_id photos")
    .lean();

  let photoCount = 0;

  for (const submission of submissions) {
    if (
      submission.photos != null &&
      !Array.isArray(submission.photos)
    ) {
      throw new Error("Unexpected photo metadata; nothing deleted.");
    }

    for (const photo of submission.photos ?? []) {
      if (
        typeof photo.objectKey !== "string" ||
        !photo.objectKey.startsWith(
          `submissions/${submission._id}/`
        )
      ) {
        throw new Error("Unexpected photo object key; nothing deleted.");
      }

      photoCount += 1;
    }
  }

  console.log(`Database: ${mongoose.connection.name}`);
  console.log(`Keep: ${keepEmails.join(", ")}; passwords unchanged.`);
  console.log(
    `Remove: ${removeIds.length} accounts, ` +
    `${submissions.length} forms, ${photoCount} referenced photos.`
  );
  console.log("Keep all job sites. Clear login sessions after cleanup.");

  if (!apply) {
    console.log(
      "Preview only. Run again with --apply to perform this cleanup."
    );
    return;
  }

  let storage;

  if (photoCount > 0) {
    for (const name of [
      "R2_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
    ]) {
      if (!process.env[name]) {
        throw new Error(`${name} is missing; nothing deleted.`);
      }
    }

    storage = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  try {
    for (const submission of submissions) {
      for (const photo of submission.photos ?? []) {
        await storage.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: photo.objectKey,
          })
        );
      }

      await Submission.deleteOne({ _id: submission._id });
    }

    if (removeIds.length > 0) {
      await User.deleteMany({ _id: { $in: removeIds } });
    }

    await mongoose.connection.db
      .collection("sessions")
      .deleteMany({});

    console.log(
      "Fresh demo ready. Sign in again with the existing demo credentials."
    );
  } finally {
    storage?.destroy();
  }
}

try {
  await main();
} catch (error) {
  if (
    error instanceof Error &&
    /missing|nothing deleted/.test(error.message)
  ) {
    console.error(error.message);
  } else {
    console.error(
      `Cleanup stopped (${error?.name ?? "Error"}). ` +
      "It may be partly complete; rerun after resolving " +
      "the connection or storage issue."
    );
  }

  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}