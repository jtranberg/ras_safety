import User from "../models/User.js";


export function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function requireAuth(req, res, next) {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Please log in." });
    }

    const user = await User.findById(req.session.userId);

    if (
      !user ||
      user.isActive === false ||
      (req.session.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)
    ) {
      return req.session.destroy((error) => {
        if (error) return next(error);

        res.status(401).json({
          message: "Your session has ended. Please log in again.",
        });
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: "Access denied." });
    }

    next();
  };
}