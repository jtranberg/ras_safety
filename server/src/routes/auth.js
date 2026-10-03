import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import User from "../models/User.js";
import {
  publicUser,
  requireAuth,
  requireRole,
} from "../middleware/auth.js";


const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again later." },
});

// Compare against a dummy hash when the email is unknown.
const dummyHash = await bcrypt.hash("unused-login-comparison", 12);

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length > 254 ||
    password.length > 128 ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      message: "Enter a valid email and password.",
    });
  }

  const user = await User.findOne({
    email: email.trim().toLowerCase(),
  }).select("+passwordHash");

  const valid = await bcrypt.compare(
    password,
    user?.passwordHash ?? dummyHash
  );

  if (!user || !valid || user.isActive === false) {
    return res.status(401).json({
      message: "Invalid email or password.",
    });
  }

  // Replace any previous session before authenticating.
  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  req.session.userId = String(user._id);
  req.session.sessionVersion = user.sessionVersion ?? 0;

  await new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  res.json({ user: publicUser(user) });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

   res.clearCookie("ras.sid", {
  path: "/",
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
});

    res.json({ message: "Logged out." });
  });
});

// List all workers, including workers who have not submitted a form.
router.get(
  "/workers",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      const workers = await User.find({ role: "FRAMER" })
        .sort({ name: 1 })
        .select("name email isActive");

      res.json({
        workers: workers.map((worker) => ({
          id: String(worker._id),
          name: worker.name,
          email: worker.email,
          isActive: worker.isActive !== false,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Set/change a password and restore access.
router.patch(
  "/workers/:id/password",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
        return res.status(400).json({ message: "Invalid worker ID." });
      }

      const { password } = req.body ?? {};

      if (
        typeof password !== "string" ||
        password.trim().length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
      ) {
        return res.status(400).json({
          message:
            "Use at least 8 characters and no more than 72 UTF-8 bytes.",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const worker = await User.findOneAndUpdate(
        { _id: req.params.id, role: "FRAMER" },
        {
          $set: { passwordHash, isActive: true },
          $inc: { sessionVersion: 1 },
        },
        { returnDocument: "after", runValidators: true }
      );

      if (!worker) {
        return res.status(404).json({ message: "Worker not found." });
      }

      res.json({ message: "Password updated. Worker access is active." });
    } catch (error) {
      next(error);
    }
  }
);

// Revoke access and invalidate existing sessions.
router.patch(
  "/workers/:id/revoke",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
        return res.status(400).json({ message: "Invalid worker ID." });
      }

      const worker = await User.findOneAndUpdate(
        { _id: req.params.id, role: "FRAMER" },
        {
          $set: { isActive: false },
          $inc: { sessionVersion: 1 },
        },
        { returnDocument: "after", runValidators: true }
      );

      if (!worker) {
        return res.status(404).json({ message: "Worker not found." });
      }

      res.json({ message: "Worker access revoked." });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/workers",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body ?? {};

      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 100 ||
        typeof email !== "string" ||
        email.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== "string" ||
        password.trim().length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
      ) {
        return res.status(400).json({
          message:
            "Enter a name, valid email, and password of at least 8 characters (maximum 72 UTF-8 bytes).",
        });
      }

      const worker = await User.create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        role: "FRAMER",
        isActive: true,
        sessionVersion: 0,
      });

      res.status(201).json({
        worker: {
          id: String(worker._id),
          name: worker.name,
          email: worker.email,
          isActive: worker.isActive,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: "An account with that email already exists.",
        });
      }

      next(error);
    }
  }
);

router.delete(
  "/workers/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
        return res.status(400).json({ message: "Invalid worker ID." });
      }

      const worker = await User.findOneAndDelete({
        _id: req.params.id,
        role: "FRAMER",
      });

      if (!worker) {
        return res.status(404).json({ message: "Worker not found." });
      }

      res.json({ message: "Worker deleted." });
    } catch (error) {
      next(error);
    }
  }
);

export default router;