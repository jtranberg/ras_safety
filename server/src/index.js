import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";

import session from "express-session";
import MongoStore from "connect-mongo";
import authRoutes from "./routes/auth.js";

import safetyRoutes from "./routes/safety.js";
import photoRoutes from "./routes/photos.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(helmet());

const clientOrigin =
  process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

if (
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET.length < 64
) {
  throw new Error("Set SESSION_SECRET to the generated 64-character value.");
}

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing.");
}

// Require browser writes to come from our frontend.
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  if (req.get("origin") !== clientOrigin) {
    return res.status(403).json({
      message: "Request origin not allowed.",
    });
  }

  next();
});

app.use(
  session({
    name: "ras.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "sessions",
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);


app.use("/api/auth", authRoutes);
app.use("/api", photoRoutes);
app.use("/api", safetyRoutes);

// Readiness check: reports whether the API has a database connection.
app.get("/api/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;

  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    service: "ras-safety-api",
    database: connected ? "connected" : "disconnected",
  });
});

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found." });
});

app.use((error, _req, res, _next) => {
  console.error("Request failed:", error.name);

  const invalidJson = error.type === "entity.parse.failed";
  const tooLarge = error.type === "entity.too.large";

  res.status(invalidJson ? 400 : tooLarge ? 413 : 500).json({
    message: invalidJson
      ? "Invalid JSON body."
      : tooLarge
        ? "Request body is too large."
        : "Something went wrong.",
  });
});

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing.");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log("MongoDB connected.");

  app.listen(port, () => {
    console.log(`RAS Safety API running on port ${port}`);
  });
}

start().catch((error) => {
  // Avoid printing a connection string or credentials.
  console.error(`API startup failed (${error.name}).`);
  process.exit(1);
});