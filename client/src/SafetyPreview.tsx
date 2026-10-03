import { useState } from "react";
import "./App.css";

type Submission = {
  id: number;
  worker: string;
  site: string;
  date: string;
};

const sites = ["Cedar Heights", "Harbour View", "Westshore"];
const checks = [
  "Hard hat, vest, boots and eye protection checked",
  "Fall protection in place",
  "Ladders and scaffolding inspected",
  "Tools and cords in good condition",
  "Hazards identified",
];

export default function App() {
  const [view, setView] = useState<"worker" | "admin">("worker");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [message, setMessage] = useState("");

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    setSubmissions((previous) => [
      {
        id: Date.now(),
        worker: "Demo Framer",
        site: String(data.get("site")),
        date: String(data.get("date")),
      },
      ...previous,
    ]);

    setMessage("Demo submission added. It is stored only until page refresh.");
    form.reset();
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <span className="eyebrow">RAS / SITE OPERATIONS</span>
          <h1>Daily safety.</h1>
        </div>

        <nav aria-label="Preview views">
          <button
            className={view === "worker" ? "active" : ""}
            onClick={() => setView("worker")}
          >
            Worker
          </button>
          <button
            className={view === "admin" ? "active" : ""}
            onClick={() => setView("admin")}
          >
            Admin
          </button>
        </nav>
      </header>

      <main>
        <p className="preview">
          Layout preview · Demo data · Login and storage coming next
        </p>

        {view === "worker" ? (
          <section className="card">
            <span className="eyebrow">BEFORE YOU START</span>
            <h2>Site safety check</h2>
            <p className="muted">
              Review your equipment and site conditions before starting work.
            </p>

            <form onSubmit={submitForm}>
              <div className="fields">
                <label>
                  Worker
                  <input value="Demo Framer" readOnly />
                </label>

                <label>
                  Job site
                  <select name="site" required defaultValue="">
                    <option value="" disabled>Select a site</option>
                    {sites.map((site) => (
                      <option key={site}>{site}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Work date
                  <input name="date" type="date" required />
                </label>
              </div>

              <fieldset>
                <legend>Safety checklist</legend>
                {checks.map((check, index) => (
                  <label className="check" key={check}>
                    <input name={`check-${index}`} type="checkbox" />
                    <span>{check}</span>
                  </label>
                ))}
              </fieldset>

              <label>
                Hazards and notes
                <textarea
                  name="notes"
                  rows={4}
                  placeholder="Describe any hazards or actions needed."
                />
              </label>

              <button className="primary" type="submit">
                Submit demo form
              </button>
              <p role="status" className="message">{message}</p>
            </form>
          </section>
        ) : (
          <section className="card">
            <span className="eyebrow">CREW OVERVIEW</span>
            <h2>Safety submissions</h2>
            <p className="muted">
              {submissions.length} demo submissions this session
            </p>

            {submissions.length === 0 ? (
              <div className="empty">
                No submissions yet. Add one from the Worker view.
              </div>
            ) : (
              <div className="submission-list">
                {submissions.map((submission) => (
                  <article className="submission" key={submission.id}>
                    <div>
                      <strong>{submission.worker}</strong>
                      <p>{submission.site} · {submission.date}</p>
                    </div>
                    <span className="badge">Submitted</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}