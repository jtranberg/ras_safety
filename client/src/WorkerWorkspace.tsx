import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import type { User } from "./api";
import PhotoPanel from "./PhotoPanel";

type Site = {
  _id: string;
  name: string;
};

type Submission = {
  _id: string;
  workDate: string;
  status: "SUBMITTED" | "REVIEWED" | "AUTHORIZED";
  site: { _id: string; name: string } | null;
};

const checks = [
  ["ppe", "Required PPE worn"],
  ["fallProtection", "Fall protection in place"],
  ["laddersScaffolding", "Ladders and scaffolding inspected"],
  ["toolsCords", "Tools and cords in good condition"],
  ["hazardsIdentified", "Hazards identified"],
] as const;

function todayLocal() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Could not reach the API. Please try again.";
}

export default function WorkerWorkspace({ user }: { user: User }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [siteResult, submissionResult] = await Promise.all([
          api<{ sites: Site[] }>("/sites"),
          api<{ submissions: Submission[] }>("/submissions"),
        ]);

        if (active) {
          setSites(siteResult.sites);
          setSubmissions(submissionResult.submissions);
        }
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    const form = event.currentTarget;
    const data = new FormData(form);

    setError("");
    setMessage("");

    if (
      checks.some(
        ([key]) =>
          data.get(key) !== "yes" && data.get(key) !== "no"
      )
    ) {
      setError("Answer every safety checklist item.");
      return;
    }

    const checklist = Object.fromEntries(
      checks.map(([key]) => [key, data.get(key) === "yes"])
    );

    setBusy(true);

    try {
      await api("/submissions", {
        method: "POST",
        body: JSON.stringify({
          siteId: data.get("siteId"),
          workDate: data.get("workDate"),
          checklist,
          notes: data.get("notes"),
        }),
      });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      return;
    }

    form.reset();
    setMessage(
      "Your safety form was saved. Attach site photos to it in My submissions below."
    );

    try {
      const result = await api<{ submissions: Submission[] }>(
        "/submissions"
      );

      setSubmissions(result.submissions);
    } catch {
      setError(
        "Your form was saved, but history could not refresh. Reload to view it."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p role="status">Loading your workspace...</p>;
  }

  return (
    <div className="workspace">
      <section className="card">
        <span className="eyebrow">BEFORE YOU START</span>
        <h2>Site safety check</h2>

        <p className="muted">
          Record site conditions. A “No” answer records an issue;
          it does not certify the site as safe.
        </p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p className="message" role="status">
            {message}
          </p>
        )}

        <form onSubmit={submit}>
          <fieldset className="form-fields" disabled={busy}>
            <div className="fields">
              <label>
                Worker
                <input value={user.name} readOnly />
              </label>

              <label>
                Job site
                <select name="siteId" required defaultValue="">
                  <option value="" disabled>
                    Select a site
                  </option>

                  {sites.map((site) => (
                    <option key={site._id} value={site._id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Work date
                <input
                  name="workDate"
                  type="text"
                  value={todayLocal()}
                  readOnly
                />
              </label>
            </div>

            <fieldset>
              <legend>Safety checklist</legend>

              {checks.map(([key, label]) => (
                <label className="check-row" key={key}>
                  <span>{label}</span>

                  <select name={key} required defaultValue="">
                    <option value="" disabled>
                      Select answer
                    </option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              ))}
            </fieldset>

            <label>
              Hazards and notes
              <textarea
                name="notes"
                rows={4}
                maxLength={5000}
                placeholder="Describe hazards and any actions taken."
              />
            </label>

            <button
              className="primary"
              type="submit"
              disabled={sites.length === 0}
            >
              {busy ? "Saving..." : "Submit safety form"}
            </button>
          </fieldset>
        </form>
      </section>

      <section className="card">
        <span className="eyebrow">YOUR RECORDS</span>
        <h2>Submissions</h2>

        <p className="muted">
          Your latest 100 submissions. Attach photos to a Submitted form below.
        </p>

        {submissions.length === 0 ? (
          <div className="empty">No submissions yet.</div>
        ) : (
          <div
            className="submission-list worker-submission-list"
            tabIndex={0}
            role="region"
            aria-label="Your safety submissions"
          >
            {submissions.map((submission) => (
              <div className="card" key={submission._id}>
                <article className="submission">
                  <div>
                    <strong>
                      {submission.site?.name ?? "Unavailable site"}
                    </strong>
                    <p>{submission.workDate}</p>
                  </div>

                  <span
                    className={`badge ${submission.status === "AUTHORIZED"
                      ? "badge-authorized"
                      : ""
                      }`}
                  >
                    {submission.status === "AUTHORIZED"
                      ? "Authorized"
                      : submission.status === "REVIEWED"
                        ? "Reviewed"
                        : "Submitted"}
                  </span>
                </article>

                <PhotoPanel
                  key={submission._id}
                  submissionId={submission._id}
                  canUpload={submission.status === "SUBMITTED"}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}