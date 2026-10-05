import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
type Worker = {
  id: string;
  name: string;
  email: string;
  trade?: string;
  isActive: boolean;
};
type LoginDetails = {
  workerId: string;
  name: string;
  email: string;
  password: string;
};
const trades = [
  "Framer",
  "Carpenter",
  "Roofer",
  "Electrician",
  "Plumber",
  "Drywaller",
  "Painter",
  "Labourer",
  "Equipment operator",
  "Other",
];
type Props = { onChanged?: () => void };

export default function WorkerAccessPanel({ onChanged }: Props = {}) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [addingWorker, setAddingWorker] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrade, setNewTrade] = useState("Framer");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loginDetails, setLoginDetails] = useState<LoginDetails | null>(null);
  // Keep newly entered credentials only in memory, for up to five minutes.
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    if (!loginDetails) return;
    const timer = window.setTimeout(() => setLoginDetails(null), 5 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [loginDetails]);
  function emailLoginDetails() {
    if (!loginDetails || busy) return;
    const body = [
      `Hi ${loginDetails.name},`,
      "",
      "Your RAS Safety Authorization login details are:",
      "",
      "Sign in: https://ras-safety-authorization.netlify.app/",
      `Email: ${loginDetails.email}`,
      `Password: ${loginDetails.password}`,
      "",
      "Use these details to sign in and complete your daily site safety form.",
      "Please keep your login details private.",
    ].join("\r\n");
    const mailto = `mailto:${encodeURIComponent(loginDetails.email)}` +
      `?subject=${encodeURIComponent("RAS Safety Authorization - Login details")}` +
      `&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await api<{ workers: Worker[] }>("/auth/workers");
        if (active) setWorkers(result.workers);
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load workers."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  function clearNewWorker() {
    setNewName("");
    setNewTrade("Framer");
    setNewEmail("");
    setNewPassword("");
    setShowNewPassword(false);
  }
  async function addWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setLoginDetails(null);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ worker: Worker }>("/auth/workers", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          password: newPassword,
          trade: newTrade,
        }),
      });
      setWorkers((previous) =>
        [...previous, result.worker].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setLoginDetails({
        workerId: result.worker.id,
        name: result.worker.name,
        email: result.worker.email,
        password: newPassword,
      });
      clearNewWorker();
      setAddingWorker(false);
      setMessage(`${result.worker.name} added. They can now sign in.`);
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not add worker."
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveTrade(event: FormEvent<HTMLFormElement>, worker: Worker) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const trade = String(data.get("trade") ?? "").trim();
    if (!trade) {
      setError("Select a trade.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ worker: Worker }>(
        `/auth/workers/${worker.id}/trade`,
        {
          method: "PATCH",
          body: JSON.stringify({ trade }),
        },
      );
      setWorkers((previous) =>
        previous.map((person) =>
          person.id === worker.id ? result.worker : person,
        ),
      );
      setMessage(`${result.worker.name}'s trade updated to ${result.worker.trade}.`);
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update trade.");
    } finally {
      setBusy(false);
    }
  }
  async function updateAccess(
    workerId: string,
    action: "password" | "revoke"
  ) {
    if (busy) return;
    setLoginDetails(null);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>(
        `/auth/workers/${workerId}/${action}`,
        {
          method: "PATCH",
          ...(action === "password"
            ? { body: JSON.stringify({ password }) }
            : {}),
        }
      );
      setWorkers((previous) =>
        previous.map((worker) =>
          worker.id === workerId
            ? { ...worker, isActive: action === "password" }
            : worker
        )
      );
      if (action === "password") {
        const worker = workers.find((person) => person.id === workerId);
        if (worker) {
          setLoginDetails({
            workerId: worker.id,
            name: worker.name,
            email: worker.email,
            password,
          });
        }
      }
      setPassword("");
      setShowPassword(false);
      setSelectedId(null);
      setMessage(result.message);
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update access."
      );
    } finally {
      setBusy(false);
    }
  }
  function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedId) void updateAccess(selectedId, "password");
  }
  async function deleteWorker(worker: Worker) {
    if (busy) return;
    const confirmed = window.confirm(
      `Permanently delete ${worker.name}'s account? ` +
      "They will lose access. Their submitted forms will remain."
    );
    if (!confirmed) return;
    setLoginDetails(null);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api<{ message: string }>(`/auth/workers/${worker.id}`, {
        method: "DELETE",
      });
      setWorkers((previous) =>
        previous.filter((person) => person.id !== worker.id)
      );
      if (selectedId === worker.id) {
        setSelectedId(null);
        setPassword("");
        setShowPassword(false);
      }
      setMessage(`${worker.name}'s account deleted.`);
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete worker."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <span className="eyebrow">ADMIN CONTROLS</span>
      <h2>Worker access</h2>
      <p className="muted">
        Add workers, assign trades, and manage individual passwords and access.
        Saving a new password restores access and ends existing sessions.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="ras-feedback-slot" aria-live="polite" aria-atomic="true">
        {message && (
          <div className="ras-success-feedback">
            <span><strong>Done.</strong> {message}</span>
            <button type="button" className="ras-dismiss-feedback" onClick={() => setMessage("")} aria-label="Dismiss worker success message">Dismiss</button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="primary add-worker-button"
        disabled={busy || loading}
        onClick={() => {
          setLoginDetails(null);
          setAddingWorker(true);
          clearNewWorker();
          setSelectedId(null);
          setPassword("");
          setShowPassword(false);
          setError("");
          setMessage("");
        }}
      >
        Add worker
      </button>
      {addingWorker && (
        <form onSubmit={addWorker}>
          <h3>Add worker</h3>
          <label>
            Full name
            <input
              type="text"
              autoComplete="off"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={100}
              required
              disabled={busy}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              autoComplete="off"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              maxLength={254}
              required
              disabled={busy}
            />
          </label>
          <label>
            Trade
            <select
              value={newTrade}
              onChange={(event) => setNewTrade(event.target.value)}
              required
              disabled={busy}
            >
              {trades.map((trade) => (
                <option key={trade} value={trade}>{trade}</option>
              ))}
            </select>
          </label>
          <label>
            Initial password
            <input
              type={showNewPassword ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              required
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="secondary password-toggle"
            disabled={busy}
            aria-pressed={showNewPassword}
            onClick={() => setShowNewPassword((shown) => !shown)}
          >
            {showNewPassword ? "Hide password" : "Show password"}
          </button>
          <div className="submission-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Adding..." : "Create worker"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setAddingWorker(false);
                clearNewWorker();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {loading ? (
        <p role="status">Loading workers...</p>
      ) : workers.length === 0 ? (
        <p className="empty">No workers yet.</p>
      ) : (
        <div className="submission-list">
          {workers.map((worker) => (
            <article className="submission worker-access-row" key={worker.id}>
              <div>
                <strong>{worker.name}</strong>
                <p>{worker.email}</p>
                <p className="muted">Trade: {worker.trade ?? "Framer"}</p>
                <form
                  key={`${worker.id}:${worker.trade ?? "Framer"}`}
                  onSubmit={(event) => void saveTrade(event, worker)}
                >
                  <label>
                    Trade for {worker.name}
                    <select
                      name="trade"
                      defaultValue={worker.trade ?? "Framer"}
                      required
                      disabled={busy}
                    >
                      {worker.trade && !trades.includes(worker.trade) && (
                        <option value={worker.trade}>{worker.trade}</option>
                      )}
                      {trades.map((trade) => (
                        <option key={trade} value={trade}>{trade}</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="secondary" disabled={busy}>
                    Save trade
                  </button>
                </form>
                <span className="badge">
                  {worker.isActive ? "Access active" : "Access revoked"}
                </span>
              </div>
              <div className="submission-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setLoginDetails(null);
                    setAddingWorker(false);
                    clearNewWorker();
                    setSelectedId(worker.id);
                    setPassword("");
                    setShowPassword(false);
                    setError("");
                    setMessage("");
                  }}
                >
                  Set/change password
                </button>
                {loginDetails?.workerId === worker.id && (
                  <div className="worker-login-email">
                    <p role="status">
                      <strong>Password saved. Ready to send.</strong>
                    </p>
                    <div className="submission-actions">
                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={emailLoginDetails}
                        title={`Open an email draft for ${worker.name}`}
                      >
                        Email login details
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => setLoginDetails(null)}
                      >
                        Clear
                      </button>
                    </div>
                    <p className="muted">
                      Review the draft and click Send in your email app.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className="secondary revoke-button"
                  disabled={busy || !worker.isActive}
                  onClick={() => {
                    if (window.confirm(`Revoke access for ${worker.name}?`)) {
                      void updateAccess(worker.id, "revoke");
                    }
                  }}
                >
                  Revoke access
                </button>
                <button
                  type="button"
                  className="secondary revoke-button"
                  disabled={busy}
                  onClick={() => void deleteWorker(worker)}
                >
                  Delete worker
                </button>
              </div>
              {selectedId === worker.id && (
                <form className="worker-password-form" onSubmit={savePassword}>
                  <h3>New password for {worker.name}</h3>
                  <label>
                    New password
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      autoFocus
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={8}
                      maxLength={72}
                      required
                      disabled={busy}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary password-toggle"
                    disabled={busy}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((shown) => !shown)}
                  >
                    {showPassword ? "Hide password" : "Show password"}
                  </button>
                  <div className="submission-actions">
                    <button type="submit" className="primary" disabled={busy}>
                      {busy ? "Saving..." : "Save password and enable access"}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setSelectedId(null);
                        setPassword("");
                        setShowPassword(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
