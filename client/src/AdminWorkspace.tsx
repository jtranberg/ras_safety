import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import PhotoPanel from "./PhotoPanel";
import WorkerAccessPanel from "./WorkerAccessPanel";
import SiteManagementPanel from "./SiteManagementPanel";

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
};

const emptyFilters: Filters = {
  siteId: "",
  workerId: "",
  from: "",
  to: "",
};

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

async function fetchDashboard(filters: Filters) {
  const query = new URLSearchParams();

  if (filters.siteId) query.set("siteId", filters.siteId);
  if (filters.workerId) query.set("workerId", filters.workerId);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);

  const [result, sitesResult, workersResult] = await Promise.all([
    api<{ submissions: Submission[]; summary: Summary }>(
      `/submissions?${query.toString()}`
    ),
    api<{ sites: SiteOption[] }>("/sites"),
    api<{ workers: WorkerOption[] }>("/auth/workers"),
  ]);

  if (!result.summary) {
    throw new Error(
      "The API is missing summary data. Update the GET /submissions route."
    );
  }

  return {
    submissions: result.submissions,
    summary: result.summary,
    sites: sitesResult.sites,
    workers: workersResult.workers,
  };
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
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<Filters>(emptyFilters);
  const [summary, setSummary] = useState<Summary>(emptySummary);

  const saving = pendingAction !== null;
  const controlsBusy = loading || opening || saving;

  // Validation is derived from the input values, not stored by an effect.
  const filterError =
    filters.from && filters.to && filters.from > filters.to
      ? "The start date must be on or before the end date."
      : "";

  const filtersChanged =
    filters.siteId !== appliedFilters.siteId ||
    filters.workerId !== appliedFilters.workerId ||
    filters.from !== appliedFilters.from ||
    filters.to !== appliedFilters.to;

  // Initial loading only updates state after the API request completes.
  useEffect(() => {
    let active = true;

    async function loadInitialDashboard() {
      try {
        const result = await fetchDashboard(emptyFilters);

        if (active) {
          setSubmissions(result.submissions);
          setSummary(result.summary);
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!selected && (
        <>
          <WorkerAccessPanel />
          <SiteManagementPanel />
        </>
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
                    selected.checklist[key] ? "answer-yes" : "answer-no"
                  }
                >
                  {selected.checklist[key] ? "Yes" : "No"}
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
        <section className="card">
          <span className="eyebrow">CREW OVERVIEW</span>
          <h2>Safety submissions</h2>

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
                Clear filters
              </button>

              <button
                type="button"
                className="secondary"
                disabled={controlsBusy}
                onClick={() => void loadDashboard(appliedFilters)}
              >
                Refresh dashboard
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

          {loading || opening ? (
            <p role="status">
              {opening
                ? "Opening submission..."
                : "Loading dashboard..."}
            </p>
          ) : (
            <>
              <div className="summary-grid">
                <div className="summary-stat">
                  <span>Matching submissions</span>
                  <strong>{summary.total}</strong>
                </div>
                <div className="summary-stat">
                  <span>Authorized</span>
                  <strong>{summary.authorized}</strong>
                </div>
                <div className="summary-stat">
                  <span>Awaiting authorization</span>
                  <strong>{summary.awaitingAuthorization}</strong>
                </div>
              </div>

              {summary.sites.length > 0 && (
                <div className="site-summary">
                  <h3>Submissions per site</h3>
                  {summary.sites.map((site) => (
                    <div
                      className="site-summary-row"
                      key={site.siteId}
                    >
                      <span>{site.name}</span>
                      <strong>
                        {site.total} submitted · {site.authorized} authorized
                      </strong>
                    </div>
                  ))}
                </div>
              )}

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
    </div>
  );
}