import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";

type Worker = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
};

export default function WorkerAccessPanel() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [addingWorker, setAddingWorker] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

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
    setNewEmail("");
    setNewPassword("");
  }

  async function addWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

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
        }),
      });

      setWorkers((previous) =>
        [...previous, result.worker].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );

      clearNewWorker();
      setAddingWorker(false);
      setMessage(`${result.worker.name} added. They can now sign in.`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not add worker."
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateAccess(
    workerId: string,
    action: "password" | "revoke"
  ) {
    if (busy) return;

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

      setPassword("");
      setSelectedId(null);
      setMessage(result.message);
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
      }

      setMessage(`${worker.name}'s account deleted.`);
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
        Add workers and manage individual passwords and access.
        Saving a new password restores access and ends existing sessions.
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <button
        type="button"
        className="primary"
        disabled={busy || loading}
        onClick={() => {
          setAddingWorker(true);
          clearNewWorker();
          setSelectedId(null);
          setPassword("");
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
            Initial password
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              required
              disabled={busy}
            />
          </label>

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
            <article className="submission" key={worker.id}>
              <div>
                <strong>{worker.name}</strong>
                <p>{worker.email}</p>
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
                    setAddingWorker(false);
                    clearNewWorker();
                    setSelectedId(worker.id);
                    setPassword("");
                    setError("");
                    setMessage("");
                  }}
                >
                  Set/change password
                </button>

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
            </article>
          ))}
        </div>
      )}

      {selectedId && (
        <form onSubmit={savePassword}>
          <h3>
            Password for{" "}
            {workers.find((worker) => worker.id === selectedId)?.name}
          </h3>

          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              required
              disabled={busy}
            />
          </label>

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
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}