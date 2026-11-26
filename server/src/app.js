import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import safetyRoutes from "./routes/safety.js";
import photoRoutes from "./routes/photos.js";
import adminSubmissionRoutes from "./routes/adminSubmissionRoutes.js";

// Keep app construction separate from database connection and listening.
// Tests can use an in-memory session store without production credentials.
export function createApp({
  sessionSecret,
  sessionStore,
  clientOrigin,
  nodeEnv = "development",
  isDatabaseConnected = () => mongoose.connection.readyState === 1,
}) {
  const app = express();
  app.set("trust proxy", 1);

  app.use(helmet());

  const allowedOrigins = new Set([
    "http://localhost:5173",
    "https://ras-safety-authorization.netlify.app",
    ...(clientOrigin || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  ]);

  app.use(
    cors({
      origin(origin, callback) {
        callback(null, Boolean(origin && allowedOrigins.has(origin)));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "1mb" }));

  if (
    !sessionSecret ||
    sessionSecret.length < 64
  ) {
    throw new Error("Set SESSION_SECRET to the generated 64-character value.");
  }

  // Require browser writes to come from our frontend.
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    if (!allowedOrigins.has(req.get("origin"))) {
      return res.status(403).json({
        message: "Request origin not allowed.",
      });
    }

    next();
  });

  // Readiness check: reports whether the API has a database connection.
  app.get("/api/health", (_req, res) => {
    const connected = isDatabaseConnected();

    res.status(connected ? 200 : 503).json({
      status: connected ? "ok" : "unavailable",
      service: "ras-safety-api",
      database: connected ? "connected" : "disconnected",
    });
  });

  app.use(
    session({
      name: "ras.sid",
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        httpOnly: true,
        secure: nodeEnv === "production",
        sameSite: nodeEnv === "production" ? "none" : "lax",
        maxAge: 8 * 60 * 60 * 1000,
      },
    })
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/submissions", adminSubmissionRoutes);
  app.use("/api", photoRoutes);
  app.use("/api", safetyRoutes);

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
  return app;
}
