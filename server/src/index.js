import "dotenv/config";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import { createApp } from "./app.js";

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing.");
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 64) {
    throw new Error("Set SESSION_SECRET to the generated 64-character value.");
  }
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const app = createApp({
    sessionSecret: process.env.SESSION_SECRET,
    sessionStore: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "sessions",
    }),
    clientOrigin: process.env.CLIENT_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
  });
  const port = Number(process.env.PORT || 3000);
  console.log("MongoDB connected.");
  app.listen(port, () => {
    console.log(`RAS Safety API running on port ${port}`);
  });
}

start().catch((error) => {
  console.error(`API startup failed (${error.name}).`);
  process.exit(1);
});
