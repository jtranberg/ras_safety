import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";

type Site = {
  _id: string;
  name: string;
  address: string;
};

type Props = { onChanged?: () => void };

export default function SiteManagementPanel({ onChanged }: Props = {}) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const formOpen = adding || editingId !== null;
  const editing = editingId !== null;

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await api<{ sites: Site[] }>("/sites");
        if (active) setSites(result.sites);
      } catch (err) {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Could not load sites.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  function closeForm() {
    setAdding(false);
    setEditingId(null);
    setName("");
    setAddress("");
    setError("");
  }

  function startEdit(site: Site) {
    if (busy || formOpen) return;
    setAdding(false);
    setEditingId(site._id);
    setName(site.name);
    setAddress(site.address ?? "");
    setError("");
    setMessage("");
  }

  async function saveSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    if (!trimmedName) {
      setError("Site name is required.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ site: Site }>(
        editingId ? `/sites/${encodeURIComponent(editingId)}` : "/sites",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify({ name: trimmedName, address: trimmedAddress }),
        }
      );
      setSites((previous) => {
        const updated = editingId
          ? previous.map((site) => site._id === editingId ? result.site : site)
          : [...previous, result.site];
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });
      setMessage(`${result.site.name} ${editingId ? "updated" : "added"}.`);
      closeForm();
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : editingId ? "Could not update site." : "Could not add site."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <span className="eyebrow">ADMIN CONTROLS</span>
      <h2>Job sites</h2>
      <p className="muted">Add job sites or update an existing site's name and address.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="ras-feedback-slot" aria-live="polite" aria-atomic="true">
        {message && (
          <div className="ras-success-feedback">
            <span><strong>Saved.</strong> {message}</span>
            <button type="button" className="ras-dismiss-feedback" onClick={() => setMessage("")} aria-label="Dismiss site success message">Dismiss</button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="primary add-site-button"
        disabled={busy || loading || formOpen}
        onClick={() => {
          setAdding(true);
          setEditingId(null);
          setName("");
          setAddress("");
          setError("");
          setMessage("");
        }}
      >
        Add site
      </button>
      {formOpen && (
        <form onSubmit={saveSite}>
          <h3>{editing ? "Edit job site" : "Add job site"}</h3>
          <label>
            Site name
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required disabled={busy} autoFocus />
          </label>
          <label>
            Address (optional)
            <input type="text" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} disabled={busy} />
          </label>
          <div className="submission-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? editing ? "Saving..." : "Adding..." : editing ? "Save changes" : "Create site"}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={closeForm}>Cancel</button>
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
              <div className="submission-actions">
                <button type="button" className="secondary" disabled={busy || formOpen} onClick={() => startEdit(site)} aria-label={`Edit ${site.name}`}>
                  Edit site
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
