import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import PhotoPanel from "./PhotoPanel";
import WorkerAccessPanel from "./WorkerAccessPanel";
import SiteManagementPanel from "./SiteManagementPanel";
import "./AdminSummary.css";
const checks = [
  ["ppe", "Required PPE worn"],
  ["fallProtection", "Fall protection in place"],
  ["laddersScaffolding", "Ladders and scaffolding inspected"],
  ["toolsCords", "Tools and cords in good condition"],
  ["hazardsIdentified", "Hazards identified"],
  ["siteOrientation", "Site orientation and daily instructions reviewed"],
  ["emergencyProcedures", "Emergency procedures and muster point reviewed"],
  ["firstAid", "First aid supplies and attendant location known"],
  ["fireSafety", "Fire extinguishers accessible and locations known"],
  ["accessRoutes", "Walkways, stairs and exits clear"],
  ["housekeeping", "Work area clear of debris and tripping hazards"],
  ["materialStorage", "Materials stacked and secured safely"],
  ["overheadHazards", "Overhead hazards assessed and controlled"],
  ["openingsGuarded", "Floor openings and exposed edges protected"],
  ["equipment", "Equipment inspected before use"],
  ["vehicleTraffic", "Vehicle and equipment movement hazards controlled"],
  ["weatherConditions", "Weather conditions assessed for planned work"],
  ["taskCommunication", "Work tasks and hazards communicated to the crew"],
] as const;
type ChecklistKey = (typeof checks)[number][0];
type Submission = {
  _id: string;
  worker: { _id: string; name: string } | null;
  site: { _id: string; name: string } | null;
  workDate: string;
  createdAt: string;
  status: "SUBMITTED" | "REVIEWED" | "AUTHORIZED";
  checklist: Record<ChecklistKey, boolean>;
  notes: string;
  authorizedBy: { _id: string; name: string } | null;
  authorizedAt: string | null;
  revokedBy?: { _id: string; name: string } | null;
  revokedAt?: string | null;
};
type SiteOption = {
  _id: string;
  name: string;
};
type WorkerOption = {
  id: string;
  name: string;
};
type TodaySummary = {
  date: string;
  activeWorkerCount: number;
  submittedWorkerCount: number;
  missingWorkers: { id: string; name: string; trade: string }[];
};
type DashboardResult = {
  submissions: Submission[];
  summary: Summary;
  matchingTotal: number;
  today: TodaySummary;
};
type Summary = {
  total: number;
  authorized: number;
  awaitingAuthorization: number;
  sites: {
    siteId: string;
    name: string;
    total: number;
    authorized: number;
  }[];
};
type Filters = {
  siteId: string;
  workerId: string;
  from: string;
  to: string;
  status: "ALL" | "AUTHORIZED" | "AWAITING";
};
const emptyFilters: Filters = {
  siteId: "",
  workerId: "",
  from: "",
  to: "",
  status: "ALL",
};
// Use the job site's business timezone, even when the admin is travelling.
function todayFilters(): Filters {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  return { ...emptyFilters, from: today, to: today };
}
const emptySummary: Summary = {
  total: 0,
  authorized: 0,
  awaitingAuthorization: 0,
  sites: [],
};
function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "Could not reach the API.";
}
function dashboardQuery(filters: Filters) {
  const query = new URLSearchParams();
  if (filters.siteId) query.set("siteId", filters.siteId);
  if (filters.workerId) query.set("workerId", filters.workerId);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  query.set("status", filters.status);
  return query.toString();
}
async function fetchDashboard(filters: Filters) {
  const [result, sitesResult, workersResult] = await Promise.all([
    api<DashboardResult>(`/submissions/admin-dashboard?${dashboardQuery(filters)}`),
    api<{ sites: SiteOption[] }>("/sites"),
    api<{ workers: WorkerOption[] }>("/auth/workers"),
  ]);
  if (!result.summary || !result.today || typeof result.matchingTotal !== "number") {
    throw new Error("The API is missing admin dashboard data. Install the new admin routes and restart the server.");
  }
  return { ...result, sites: sitesResult.sites, workers: workersResult.workers };
}
function StatusBadge({ status }: { status: Submission["status"] }) {
  return (
    <span
      className={`badge ${status === "AUTHORIZED" ? "badge-authorized" : ""
        }`}
    >
      {status === "AUTHORIZED"
        ? "Authorized"
        : status === "REVIEWED"
          ? "Reviewed"
          : "Submitted"}
    </span>
  );
}
export default function AdminWorkspace() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "authorize" | "revoke" | null
  >(null);
  const [siteOptions, setSiteOptions] = useState<SiteOption[]>([]);
  const [workerOptions, setWorkerOptions] = useState<WorkerOption[]>([]);
  const [filters, setFilters] = useState<Filters>(todayFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<Filters>(todayFilters);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [matchingTotal, setMatchingTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const chartSites = [...summary.sites].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name)
  );
  const chartMax = Math.max(1, ...chartSites.map((site) => site.total));
  const summaryPeriod = appliedFilters.from && appliedFilters.from === appliedFilters.to
    ? `Work date: ${appliedFilters.from}`
    : appliedFilters.from || appliedFilters.to
      ? `Work dates: ${appliedFilters.from || "earliest"} to ${appliedFilters.to || "latest"}`
      : "All work dates";
  const saving = pendingAction !== null;
  const controlsBusy = loading || opening || saving || exporting;
  // Validation is derived from the input values, not stored by an effect.
  const filterError =
    filters.from && filters.to && filters.from > filters.to
      ? "The start date must be on or before the end date."
      : "";
  const filtersChanged =
    filters.siteId !== appliedFilters.siteId ||
    filters.workerId !== appliedFilters.workerId ||
    filters.from !== appliedFilters.from ||
    filters.to !== appliedFilters.to ||
    filters.status !== appliedFilters.status;
  // Initial loading only updates state after the API request completes.
  useEffect(() => {
    let active = true;
    async function loadInitialDashboard() {
      try {
        const initialFilters = todayFilters();
        const result = await fetchDashboard(initialFilters);
        if (active) {
          setFilters(initialFilters);
          setAppliedFilters(initialFilters);
          setSubmissions(result.submissions);
          setSummary(result.summary);
          setTodaySummary(result.today);
          setMatchingTotal(result.matchingTotal);
          setSiteOptions(result.sites);
          setWorkerOptions(result.workers);
        }
      } catch (err) {
        if (active) setError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInitialDashboard();
    return () => {
      active = false;
    };
  }, []);
  async function loadDashboard(nextFilters: Filters) {
    setLoading(true);
    setError("");
    try {
      const result = await fetchDashboard(nextFilters);
      setSubmissions(result.submissions);
      setSummary(result.summary);
      setTodaySummary(result.today);
      setMatchingTotal(result.matchingTotal);
      setSiteOptions(result.sites);
      setWorkerOptions(result.workers);
      setAppliedFilters({ ...nextFilters });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controlsBusy || filterError) return;
    void loadDashboard({ ...filters });
  }
  function clearFilters() {
    if (controlsBusy) return;
    setFilters({ ...emptyFilters });
    void loadDashboard({ ...emptyFilters });
  }
  function showToday() {
    if (controlsBusy) return;
    const nextFilters = todayFilters();
    setFilters(nextFilters);
    void loadDashboard(nextFilters);
  }
  function selectStatus(status: Filters["status"]) {
    if (controlsBusy) return;
    const nextFilters = { ...appliedFilters, status };
    setFilters(nextFilters);
    void loadDashboard(nextFilters);
  }
  async function exportCsv() {
    if (controlsBusy) return;
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ csv: string; filename: string; total: number }>(
        `/submissions/admin-export?${dashboardQuery(appliedFilters)}`
      );
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`CSV prepared: ${result.total} matching submission${result.total === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }
  async function openSubmission(id: string) {
    if (controlsBusy) return;
    setOpening(true);
    setError("");
    try {
      const result = await api<{ submission: Submission }>(
        `/submissions/${id}`
      );
      setSelected(result.submission);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOpening(false);
    }
  }
  async function changeAuthorization(action: "authorize" | "revoke") {
    if (!selected || saving) return;
    setPendingAction(action);
    setError("");
    setNotice("");
    try {
      const result = await api<{ submission: Submission }>(
        `/submissions/${selected._id}/${action}`,
        { method: "PATCH" }
      );
      setSelected(result.submission);
      setSubmissions((previous) =>
        previous.map((submission) =>
          submission._id === result.submission._id
            ? result.submission
            : submission
        )
      );
      setNotice(action === "authorize"
        ? `Form authorized for ${result.submission.worker?.name ?? "this worker"}.`
        : `Authorization revoked for ${result.submission.worker?.name ?? "this worker"}. The form is awaiting authorization.`);
      // Reload matching records and summary after authorization changes.
      await loadDashboard(appliedFilters);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }
  return (
    <div className="workspace">
      <div className="ras-feedback-slot" aria-live="polite" aria-atomic="true">
        {notice && (
          <div className="ras-success-feedback">
            <span><strong>Done.</strong> {notice}</span>
            <button type="button" className="ras-dismiss-feedback" onClick={() => setNotice("")} aria-label="Dismiss success message">Dismiss</button>
          </div>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {selected ? (
        <section className="card">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setSelected(null);
              setError("");
            }}
            disabled={saving}
          >
            Back to submissions
          </button>
          <p className="eyebrow">SUBMISSION DETAILS</p>
          <h2>{selected.worker?.name ?? "Unavailable worker"}</h2>
          <p className="muted">
            {selected.site?.name ?? "Unavailable site"} ·{" "}
            {selected.workDate}
          </p>
          <div className="submission-actions">
            <StatusBadge status={selected.status} />
            {selected.status === "AUTHORIZED" ? (
              <button
                type="button"
                className="secondary revoke-button"
                onClick={() => void changeAuthorization("revoke")}
                disabled={saving}
              >
                {pendingAction === "revoke"
                  ? "Revoking..."
                  : "Revoke authorization"}
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={() => void changeAuthorization("authorize")}
                disabled={saving}
              >
                {pendingAction === "authorize"
                  ? "Authorizing..."
                  : "Authorize form"}
              </button>
            )}
          </div>
          <div aria-live="polite">
            {selected.status === "AUTHORIZED" &&
              selected.authorizedAt && (
                <p className="muted">
                  Authorized by {selected.authorizedBy?.name ?? "Admin"} on{" "}
                  {new Date(selected.authorizedAt).toLocaleString()}
                </p>
              )}
            {selected.status !== "AUTHORIZED" && selected.revokedAt && (
              <p className="muted">
                Authorization revoked by{" "}
                {selected.revokedBy?.name ?? "Admin"} on{" "}
                {new Date(selected.revokedAt).toLocaleString()}.
                {" "}This form is awaiting authorization.
              </p>
            )}
          </div>
          <dl className="review-list">
            {checks.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd
                  className={
                    selected.checklist[key] === true ? "answer-yes" : selected.checklist[key] === false ? "answer-no" : "muted"
                  }
                >
                  {selected.checklist[key] === true ? "Yes" : selected.checklist[key] === false ? "No" : "Not recorded"}
                </dd>
              </div>
            ))}
          </dl>
          <h3>Hazards and notes</h3>
          <p className="submission-notes">
            {selected.notes || "No notes provided."}
          </p>
          <PhotoPanel
            key={selected._id}
            submissionId={selected._id}
          />
          <p className="muted">
            Submitted: {new Date(selected.createdAt).toLocaleString()}
          </p>
        </section>
      ) : (
        <section className="card ras-dashboard-card">
          <span className="eyebrow">DAILY SITE OPERATIONS</span>
          <h2>Safety dashboard</h2>
          <p className="ras-dashboard-intro">See who has submitted and what needs attention.</p>
          <p className="muted">
            Filter by site, worker, and work date. Showing up to 100
            matching submissions; summary totals include all matches.
          </p>
          <form onSubmit={applyFilters}>
            <div className="admin-filters">
              <label>
                Site
                <select
                  value={filters.siteId}
                  disabled={controlsBusy}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      siteId: event.target.value,
                    })
                  }
                >
                  <option value="">All sites</option>
                  {siteOptions.map((site) => (
                    <option key={site._id} value={site._id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Worker
                <select
                  value={filters.workerId}
                  disabled={controlsBusy}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      workerId: event.target.value,
                    })
                  }
                >
                  <option value="">All workers</option>
                  {workerOptions.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Authorization
                <select
                  value={filters.status}
                  disabled={controlsBusy}
                  onChange={(event) => setFilters({ ...filters, status: event.target.value as Filters["status"] })}
                >
                  <option value="ALL">All statuses</option>
                  <option value="AUTHORIZED">Authorized</option>
                  <option value="AWAITING">Awaiting authorization</option>
                </select>
              </label>
              <label>
                From
                <input
                  type="date"
                  value={filters.from}
                  disabled={controlsBusy}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      from: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={filters.to}
                  disabled={controlsBusy}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      to: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="submission-actions">
              <button
                type="button"
                className="secondary"
                disabled={controlsBusy}
                onClick={showToday}
              >
                Today
              </button>
              <button
                type="submit"
                className="primary"
                disabled={controlsBusy || Boolean(filterError)}
              >
                Apply filters
              </button>
              <button
                type="button"
                className="secondary"
                disabled={controlsBusy}
                onClick={clearFilters}
              >
                All dates / clear filters
              </button>
              <button
                type="button"
                className="secondary"
                disabled={controlsBusy}
                onClick={() => void loadDashboard(appliedFilters)}
              >
                Refresh dashboard
              </button>
              <button
                type="button"
                className="secondary"
                disabled={controlsBusy}
                onClick={() => void exportCsv()}
              >
                {exporting ? "Exporting..." : "Export CSV"}
              </button>
            </div>
            {filterError && (
              <p className="error" role="alert">
                {filterError}
              </p>
            )}
            {filtersChanged && !filterError && (
              <p className="muted">
                Select Apply filters to update the results and summary.
              </p>
            )}
          </form>
          <p className="muted">CSV includes all matches for the applied site, worker, dates and authorization status.</p>
          {loading || opening ? (
            <p role="status">
              {opening
                ? "Opening submission..."
                : "Loading dashboard..."}
            </p>
          ) : (
            <>
              <p className="muted">{summaryPeriod} · Totals and chart cover the applied site, worker and dates. Click a total to filter the submission list by status.</p>
              <div className="ras-summary-grid" aria-label="Filter submissions by authorization status">
                <button type="button" className="ras-summary-stat" aria-pressed={appliedFilters.status === "ALL"} disabled={controlsBusy} onClick={() => selectStatus("ALL")}>
                  <span>Matching submissions</span>
                  <strong>{summary.total}</strong>
                </button>
                <button type="button" className="ras-summary-stat" aria-pressed={appliedFilters.status === "AUTHORIZED"} disabled={controlsBusy} onClick={() => selectStatus("AUTHORIZED")}>
                  <span>Authorized</span>
                  <strong>{summary.authorized}</strong>
                </button>
                <button type="button" className="ras-summary-stat" aria-pressed={appliedFilters.status === "AWAITING"} disabled={controlsBusy} onClick={() => selectStatus("AWAITING")}>
                  <span>Awaiting authorization</span>
                  <strong>{summary.awaitingAuthorization}</strong>
                </button>
              </div>
              <section className="ras-site-chart" aria-labelledby="site-chart-heading">
                <h3 id="site-chart-heading">Submissions per site</h3>
                <p className="ras-chart-legend">
                  <span><i className="ras-key-authorized" aria-hidden="true" />Authorized</span>
                  <span><i className="ras-key-awaiting" aria-hidden="true" />Awaiting authorization</span>
                </p>
                {chartSites.length === 0 ? (
                  <p className="muted">No submissions for the applied filters.</p>
                ) : (
                  <ul className="ras-chart-list">
                    {chartSites.map((site) => {
                      const authorized = Math.min(site.total, Math.max(0, site.authorized));
                      const awaiting = site.total - authorized;
                      return (
                        <li className="ras-chart-row" key={site.siteId}>
                          <div className="ras-chart-label">
                            <strong>{site.name || "Unavailable site"}</strong>
                            <span>{site.total} submitted · {authorized} authorized · {awaiting} awaiting</span>
                          </div>
                          <div className="ras-chart-track" aria-hidden="true">
                            <div className="ras-chart-bar" style={{ width: `${(site.total / chartMax) * 100}%` }}>
                              <span className="ras-bar-authorized" style={{ flexGrow: authorized }} />
                              <span className="ras-bar-awaiting" style={{ flexGrow: awaiting }} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              {todaySummary && (
                <section className="ras-missing-panel" aria-labelledby="missing-today-heading">
                  <h3 id="missing-today-heading">Workers with no submission today</h3>
                  <p className="muted">
                    {todaySummary.date} · BC time · {todaySummary.submittedWorkerCount} of {todaySummary.activeWorkerCount} active workers have submitted.
                  </p>
                  <p className="muted">Across all sites, regardless of the filters above. Workers may be off or unscheduled.</p>
                  {todaySummary.activeWorkerCount === 0 ? (
                    <p>No active worker accounts.</p>
                  ) : todaySummary.missingWorkers.length === 0 ? (
                    <p className="ras-all-submitted">All active workers have submitted today.</p>
                  ) : (
                    <>
                      <p><strong>{todaySummary.missingWorkers.length}</strong> active worker{todaySummary.missingWorkers.length === 1 ? "" : "s"} with no submission.</p>
                      <ul className="ras-missing-list">
                        {todaySummary.missingWorkers.map((worker) => (
                          <li key={worker.id}><strong>{worker.name}</strong><span>{worker.trade}</span></li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              )}
              <p className="muted" role="status">
                Showing {submissions.length} of {matchingTotal} matching submissions · {appliedFilters.status === "ALL" ? "All statuses" : appliedFilters.status === "AUTHORIZED" ? "Authorized" : "Awaiting authorization"}.
              </p>
              {submissions.length === 0 ? (
                <div className="empty">
                  No submissions match the applied filters.
                </div>
              ) : (
                <div
                  className="submission-list admin-submission-list"
                  tabIndex={0}
                  role="region"
                  aria-label="Safety submissions"
                >
                  {submissions.map((submission) => (
                    <article
                      className="submission"
                      key={submission._id}
                    >
                      <div>
                        <strong>
                          {submission.worker?.name ?? "Unavailable worker"}
                        </strong>
                        <p>
                          {submission.site?.name ?? "Unavailable site"} ·{" "}
                          {submission.workDate}
                        </p>
                      </div>
                      <div className="submission-actions">
                        <StatusBadge status={submission.status} />
                        <button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            void openSubmission(submission._id)
                          }
                        >
                          View form
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
      {!selected && (
        <section className="ras-management-section" aria-labelledby="management-heading">
          <div className="ras-management-heading">
            <span className="eyebrow">ADMIN TOOLS</span>
            <h2 id="management-heading">Crew and job sites</h2>
            <p className="muted">Open a section to manage accounts or update job sites.</p>
          </div>
          <details className="ras-management-drawer">
            <summary>
              <span className="ras-drawer-title">Manage workers</span>
              <span className="ras-drawer-hint">{workerOptions.length} account{workerOptions.length === 1 ? "" : "s"}</span>
            </summary>
            <div className="ras-drawer-content"><WorkerAccessPanel /></div>
          </details>
          <details className="ras-management-drawer">
            <summary>
              <span className="ras-drawer-title">Manage sites</span>
              <span className="ras-drawer-hint">{siteOptions.length} job site{siteOptions.length === 1 ? "" : "s"}</span>
            </summary>
            <div className="ras-drawer-content"><SiteManagementPanel /></div>
          </details>
        </section>
      )}
    </div>
  );
}
