// RAS-7Q
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import type { User } from "./api";
import "./App.css";

import WorkerWorkspace from "./WorkerWorkspace";
import AdminWorkspace from "./AdminWorkspace";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [splashComplete, setSplashComplete] = useState(
  () => sessionStorage.getItem("ras-splash-seen") === "true"
);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const result = await api<{ user: User }>("/auth/me");

        if (active) setUser(result.user);
      } catch (err) {
        if (
          active &&
          !(err instanceof ApiError && err.status === 401)
        ) {
          setError(
            "Could not reach the API. Check that the server is running."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
  if (splashComplete) return;

  const timer = window.setTimeout(() => {
    sessionStorage.setItem("ras-splash-seen", "true");
    setSplashComplete(true);
  }, 5000);

  return () => window.clearTimeout(timer);
}, [splashComplete]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    const data = new FormData(event.currentTarget);

    setError("");
    setBusy(true);

    try {
      const result = await api<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: String(data.get("email") ?? "").trim(),
          password: String(data.get("password") ?? ""),
        }),
      });

      setUser(result.user);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reach the API."
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
    } catch {
      setError("Logout failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

 if (!splashComplete) {
  return (
    <div
      className="splash-screen"
      role="status"
      aria-label="Loading RAS Safety"
    >
      <div className="splash-content">
        <img
          src="/iconwhite.png"
          alt="RAS"
          className="splash-logo"
        />
        <p className="splash-title">
          Safety Authorization form
        </p>
      </div>
    </div>
  );
}

  return (
    <div className="app">
      <header className="site-nav">
        <a
          className="site-brand"
          href="/"
          aria-label="RAS Safety home"
        >
          <img
            src="/iconwhite.png"
            alt="RAS"
            className="brand-logo"
          />

          <div className="brand-text">
            <span className="brand-title">Site Safety</span>
            <span className="brand-subtitle">
              Daily site operations
            </span>
          </div>
        </a>

        <nav
          className="nav-actions"
          aria-label="Workspace navigation"
        >
          {loading ? (
            <span className="nav-role">Checking session...</span>
          ) : user ? (
            <>
              <div className="nav-user">
                <span className="nav-user-name">
                  {user.name}
                </span>
                <span className="nav-role">
                  {user.role === "ADMIN"
                    ? "Admin workspace"
                    : "Framer workspace"}
                </span>
              </div>

              <button
                className="nav-logout"
                type="button"
                onClick={logout}
                disabled={busy}
              >
                {busy ? "Logging out..." : "Log out"}
              </button>
            </>
          ) : (
            <span className="nav-role">Crew sign in</span>
          )}
        </nav>
      </header>

      <main>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p role="status">Checking your session...</p>
        ) : !user ? (
          <section className="card login-card">
            <span className="eyebrow">CREW ACCESS</span>
            <h2>Welcome back</h2>
            <p className="muted">
              Sign in to access your site safety workspace.
            </p>

            <form onSubmit={login}>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  disabled={busy}
                />
              </label>

              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={busy}
                />
              </label>

              <button
                className="primary"
                type="submit"
                disabled={busy}
              >
                {busy ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </section>
        ) : user.role === "FRAMER" ? (
          <WorkerWorkspace key={user.id} user={user} />
        ) : (
          <AdminWorkspace key={user.id} />
        )}
      </main>
    </div>
  );
}