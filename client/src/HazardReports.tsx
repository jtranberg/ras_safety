import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import PhotoPanel from "./PhotoPanel";
import "./HazardReports.css";

type HazardStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
type HazardType = "HAZARD" | "NEAR_MISS";
type Severity = "LOW" | "MEDIUM" | "HIGH";

type HazardReport = {
  _id: string;
  type: HazardType;
  severity: Severity;
  status: HazardStatus;
  location: string;
  description: string;
  adminNote: string;
  createdAt: string;
  statusUpdatedAt: string | null;
  reporter: { _id: string; name: string } | null;
  site: { _id: string; name: string } | null;
  statusUpdatedBy: { _id: string; name: string } | null;
  photoCount: number;
};

type Counts = Record<HazardStatus, number>;
type Site = { _id: string; name: string };

const statusLabels: Record<HazardStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
};
const typeLabels: Record<HazardType, string> = { HAZARD: "Hazard", NEAR_MISS: "Near miss" };
const severityLabels: Record<Severity, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };
const emptyCounts: Counts = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0 };

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Could not reach the API. Please try again.";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function StatusUpdate({ report, onSaved }: { report: HazardReport; onSaved: (report: HazardReport) => void }) {
  const [status, setStatus] = useState<HazardStatus>(report.status);
  const [note, setNote] = useState(report.adminNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const unchanged = status === report.status && note.trim() === report.adminNote;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || unchanged) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<{ report: HazardReport }>(`/hazards/${report._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, note }),
      });
      onSaved(result.report);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="ras-hazard-status-form" onSubmit={save}>
      {error && <p className="error" role="alert">{error}</p>}
      <label>
        Status
        <select value={status} onChange={(event) => setStatus(event.target.value as HazardStatus)} disabled={saving}>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label>
        Admin note
        <textarea
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Action taken or next steps (visible to the reporter)."
          disabled={saving}
        />
      </label>
      <button className="primary" type="submit" disabled={saving || unchanged}>
        {saving ? "Saving..." : "Save status"}
      </button>
    </form>
  );
}

function ReportCard({ report, mode, onSaved }: {
  report: HazardReport;
  mode: "worker" | "admin";
  onSaved: (report: HazardReport) => void;
}) {
  const [showPhotos, setShowPhotos] = useState(false);
  const canUpload = mode === "worker" && report.status !== "RESOLVED";

  return (
    <article className={`ras-hazard-card ras-hazard-${report.severity.toLowerCase()}`}>
      <div className="ras-hazard-card-header">
        <div>
          <strong>{typeLabels[report.type]} · {report.site?.name ?? "Unavailable site"}</strong>
          <p className="muted">
            {mode === "admin" && <>{report.reporter?.name ?? "Unavailable worker"} · </>}
            {formatTime(report.createdAt)}
            {report.location && <> · {report.location}</>}
          </p>
        </div>
        <div className="ras-hazard-badges">
          <span className={`ras-severity ras-severity-${report.severity.toLowerCase()}`}>
            {severityLabels[report.severity]}
          </span>
          <span className={`badge ras-hazard-state-${report.status.toLowerCase()}`}>{statusLabels[report.status]}</span>
        </div>
      </div>
      <p className="ras-hazard-description">{report.description}</p>
      {report.adminNote && (
        <p className="ras-hazard-note">
          <strong>Admin note{report.statusUpdatedBy ? ` from ${report.statusUpdatedBy.name}` : ""}:</strong> {report.adminNote}
        </p>
      )}
      {mode === "admin" && <StatusUpdate key={`${report.status}-${report.adminNote}`} report={report} onSaved={onSaved} />}
      {(canUpload || report.photoCount > 0) && (
        <button type="button" className="secondary" onClick={() => setShowPhotos((shown) => !shown)} aria-expanded={showPhotos}>
          {showPhotos ? "Hide photos" : `Photos (${report.photoCount})`}
        </button>
      )}
      {showPhotos && (
        <PhotoPanel photosPath={`/hazards/${report._id}/photos`} canUpload={canUpload} itemLabel="report" />
      )}
    </article>
  );
}

export default function HazardReports({ mode, sites }: { mode: "worker" | "admin"; sites: Site[] }) {
  const [reports, setReports] = useState<HazardReport[]>([]);
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [statusFilter, setStatusFilter] = useState<HazardStatus | "">(mode === "admin" ? "OPEN" : "");
  const [siteFilter, setSiteFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (siteFilter) params.set("siteId", siteFilter);
    api<{ reports: HazardReport[]; counts: Counts }>(`/hazards?${params}`)
      .then((result) => {
        if (!active) return;
        setReports(result.reports);
        setCounts(result.counts);
        setError("");
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [statusFilter, siteFilter, reload]);

  function refresh() {
    setLoading(true);
    setReload((value) => value + 1);
  }

  function filterStatus(next: HazardStatus | "") {
    if (next === statusFilter) return;
    setLoading(true);
    setStatusFilter(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await api("/hazards", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(
          ["siteId", "type", "severity", "location", "description"].map((key) => [key, String(data.get(key) ?? "")])
        )),
      });
      form.reset();
      setMessage("Report sent. An admin will review it. You can add photos to it below.");
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function saved(updated: HazardReport) {
    setMessage(`Report marked ${statusLabels[updated.status]}.`);
    refresh();
  }

  return (
    <section className="card ras-hazards" aria-labelledby="hazards-heading">
      <span className="eyebrow">{mode === "admin" ? "SAFETY HAZARDS" : "SPEAK UP"}</span>
      <h2 id="hazards-heading">{mode === "admin" ? "Hazard reports" : "Report a hazard or near miss"}</h2>
      <p className="muted">
        {mode === "admin"
          ? "Hazards and near misses reported by the crew. Update the status as they are handled; reporters see your note."
          : "Spotted something unsafe, or had a close call? Report it any time. An admin will follow up."}
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="message" role="status">{message}</p>}

      {mode === "worker" && (
        <form onSubmit={submit} className="ras-hazard-form">
          <fieldset className="form-fields" disabled={submitting}>
            <div className="fields">
              <label>
                Type
                <select name="type" required defaultValue="HAZARD">
                  <option value="HAZARD">Hazard</option>
                  <option value="NEAR_MISS">Near miss</option>
                </select>
              </label>
              <label>
                Severity
                <select name="severity" required defaultValue="">
                  <option value="" disabled>Select severity</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </label>
              <label>
                Job site
                <select name="siteId" required defaultValue="">
                  <option value="" disabled>Select a site</option>
                  {sites.map((site) => <option key={site._id} value={site._id}>{site.name}</option>)}
                </select>
              </label>
              <label>
                Location on site (optional)
                <input name="location" maxLength={200} placeholder="e.g. Level 2, north stairwell" />
              </label>
            </div>
            <label>
              What happened?
              <textarea name="description" rows={3} maxLength={2000} required placeholder="Describe the hazard or near miss and anything you did about it." />
            </label>
            <button className="primary" type="submit" disabled={sites.length === 0}>
              {submitting ? "Sending..." : "Send report"}
            </button>
          </fieldset>
        </form>
      )}

      <div className="ras-hazard-toolbar">
        <div className="ras-period-tabs" role="group" aria-label="Filter hazard reports by status">
          {mode === "worker" && (
            <button type="button" aria-pressed={statusFilter === ""} disabled={loading} onClick={() => filterStatus("")}>
              All my reports
            </button>
          )}
          {(Object.keys(statusLabels) as HazardStatus[]).map((status) => (
            <button key={status} type="button" aria-pressed={statusFilter === status} disabled={loading} onClick={() => filterStatus(status)}>
              {statusLabels[status]} ({counts[status]})
            </button>
          ))}
          {mode === "admin" && (
            <button type="button" aria-pressed={statusFilter === ""} disabled={loading} onClick={() => filterStatus("")}>
              All
            </button>
          )}
        </div>
        <div className="ras-hazard-toolbar-actions">
          {mode === "admin" && (
            <label>
              Site
              <select value={siteFilter} disabled={loading} onChange={(event) => { setLoading(true); setSiteFilter(event.target.value); }}>
                <option value="">All sites</option>
                {sites.map((site) => <option key={site._id} value={site._id}>{site.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="secondary" disabled={loading} onClick={refresh}>Refresh</button>
        </div>
      </div>

      {loading ? (
        <p role="status">Loading hazard reports...</p>
      ) : reports.length === 0 ? (
        <div className="empty">
          {statusFilter ? `No ${statusLabels[statusFilter].toLowerCase()} reports.` : "No hazard reports yet."}
        </div>
      ) : (
        <div className="ras-hazard-list">
          {reports.map((report) => (
            <ReportCard key={report._id} report={report} mode={mode} onSaved={saved} />
          ))}
        </div>
      )}
    </section>
  );
}
