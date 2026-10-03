import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";

type Site = {
  _id: string;
  name: string;
  address: string;
};

export default function SiteManagementPanel() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await api<{ sites: Site[] }>("/sites");
        if (active) setSites(result.sites);
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError ? err.message : "Could not load sites."
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

  async function addSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await api<{ site: Site }>("/sites", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
        }),
      });

      setSites((previous) =>
        [...previous, result.site].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );

      setName("");
      setAddress("");
      setAdding(false);
      setMessage(`${result.site.name} added.`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not add site."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <span className="eyebrow">ADMIN CONTROLS</span>
      <h2>Job sites</h2>
      <p className="muted">
        Add job sites for workers to select when completing safety forms.
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <button
        type="button"
        className="primary"
        disabled={busy || loading}
        onClick={() => {
          setAdding(true);
          setError("");
          setMessage("");
        }}
      >
        Add site
      </button>

      {adding && (
        <form onSubmit={addSite}>
          <h3>Add job site</h3>

          <label>
            Site name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              disabled={busy}
            />
          </label>

          <label>
            Address (optional)
            <input
              type="text"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={300}
              disabled={busy}
            />
          </label>

          <div className="submission-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Adding..." : "Create site"}
            </button>

            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setName("");
                setAddress("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p role="status">Loading sites...</p>
      ) : sites.length === 0 ? (
        <p className="empty">No sites yet.</p>
      ) : (
        <div className="submission-list">
          {sites.map((site) => (
            <article className="submission" key={site._id}>
              <div>
                <strong>{site.name}</strong>
                <p>{site.address || "No address provided."}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}