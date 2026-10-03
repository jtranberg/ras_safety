import { useEffect, useState } from "react";
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

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Could not reach the API.";
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

  const saving = pendingAction !== null;

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await api<{ submissions: Submission[] }>(
          "/submissions"
        );

        if (active) setSubmissions(result.submissions);
      } catch (err) {
        if (active) setError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  async function openSubmission(id: string) {
    setOpening(true);
    setError("");
    setSelected(null);

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
                className="secondary revoke-button"
                onClick={() => changeAuthorization("revoke")}
                disabled={saving}
              >
                {pendingAction === "revoke"
                  ? "Revoking..."
                  : "Revoke authorization"}
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => changeAuthorization("authorize")}
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

            {selected.status !== "AUTHORIZED" &&
              selected.revokedAt && (
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
          <PhotoPanel key={selected._id} submissionId={selected._id} />
          <p className="muted">
            Submitted: {new Date(selected.createdAt).toLocaleString()}
          </p>
        </section>
      ) : (
        <section className="card">
          <span className="eyebrow">CREW OVERVIEW</span>
          <h2>Safety submissions</h2>
          <p className="muted">
            Latest 100 submissions across all sites.
          </p>

          {loading || opening ? (
            <p role="status">
              {opening
                ? "Opening submission..."
                : "Loading submissions..."}
            </p>
          ) : submissions.length === 0 ? (
            <div className="empty">No submissions yet.</div>
          ) : (
            <div className="submission-list">
              {submissions.map((submission) => (
                <article className="submission" key={submission._id}>
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
                      className="secondary"
                      onClick={() => openSubmission(submission._id)}
                    >
                      View form
                    </button>

                  </div>
                </article>
              ))}
            </div>

          )}
        </section>
      )}
    </div>
  );
}