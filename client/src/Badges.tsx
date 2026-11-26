import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import "./Badges.css";
import { monthLabel } from "./champion";
import type { MonthlyChampion } from "./champion";

type Badge = {
  id: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  earned: boolean;
};
type WorkerBadges = {
  workerId: string;
  name: string;
  earnedCount: number;
  badges: Badge[];
};
type BadgesResult = { monthlyChampion: MonthlyChampion | null; workers: WorkerBadges[] };

const icons: Record<string, string> = {
  "first-form": "📝",
  "forms-10": "📋",
  "forms-30": "🗂️",
  "forms-100": "🏗️",
  "streak-5": "🔥",
  "streak-10": "🚀",
  "first-responder": "⚡",
  "hazard-spotter": "🦺",
  "monthly-champion": "👑",
};

export function ChampionBanner({ champion }: { champion: MonthlyChampion | null }) {
  if (!champion) return null;
  const [first] = champion.winners;
  return (
    <p className="ras-champion-banner" role="status">
      <span aria-hidden="true">👑</span>
      <span>
        <strong>{monthLabel(champion.month)} champion{champion.winners.length > 1 ? "s" : ""}:</strong>{" "}
        {champion.winners.map((winner) => winner.name).join(" & ")} · {first.points} {first.points === 1 ? "point" : "points"}
      </span>
    </p>
  );
}

function BadgeTile({ badge }: { badge: Badge }) {
  return (
    <li className={`ras-badge-tile${badge.earned ? " ras-badge-earned" : ""}`}>
      <span className="ras-badge-icon" aria-hidden="true">{badge.earned ? icons[badge.id] ?? "🏅" : "🔒"}</span>
      <strong>{badge.name}</strong>
      <span className="ras-badge-description">{badge.description}</span>
      <span className="ras-badge-progress">
        {badge.earned ? "Earned" : `Locked · ${badge.progress} / ${badge.target}`}
      </span>
      {!badge.earned && (
        <span className="ras-badge-bar" aria-hidden="true">
          <span style={{ width: `${(badge.progress / badge.target) * 100}%` }} />
        </span>
      )}
    </li>
  );
}

export default function Badges({ mode, refreshKey }: { mode: "worker" | "admin"; refreshKey?: number }) {
  const [data, setData] = useState<BadgesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    let active = true;
    api<BadgesResult>("/submissions/badges")
      .then((result) => {
        if (active) { setData(result); setError(""); }
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Could not load badges.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [refreshKey]);

  const workers = data?.workers ?? [];
  const mine = mode === "worker" ? workers[0] : undefined;
  const selected = workers.find((worker) => worker.workerId === selectedId);

  return (
    <section className="card ras-badges" aria-labelledby="badges-heading">
      <span className="eyebrow">ACHIEVEMENTS</span>
      <h2 id="badges-heading">{mode === "worker" ? "Your badges" : "Crew badges"}</h2>
      <p className="muted">
        Earned for submitting forms, keeping streaks, finishing first and reporting hazards. The monthly champion is the worker with the most leaderboard points last month (BC time).
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading badges...</p>
      ) : data && (
        <>
          <ChampionBanner champion={data.monthlyChampion} />
          {mine && (
            <>
              <p className="ras-badge-count"><strong>{mine.earnedCount}</strong> of {mine.badges.length} badges earned</p>
              <ul className="ras-badge-grid">
                {mine.badges.map((badge) => <BadgeTile key={badge.id} badge={badge} />)}
              </ul>
            </>
          )}
          {mode === "admin" && (workers.length === 0 ? (
            <div className="empty">No active workers yet.</div>
          ) : (
            <>
              <div className="ras-leaderboard-table" role="region" aria-label="Badges by worker" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Worker</th>
                      <th scope="col">Earned</th>
                      <th scope="col">Badges</th>
                      <th scope="col">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workers.map((worker) => (
                      <tr key={worker.workerId} className={worker.workerId === selectedId ? "ras-leaderboard-me" : undefined}>
                        <th scope="row">{worker.name}</th>
                        <td><strong>{worker.earnedCount}</strong> / {worker.badges.length}</td>
                        <td className="ras-badge-icons">
                          {worker.badges.filter((badge) => badge.earned).map((badge) => (
                            <span key={badge.id} title={badge.name} aria-label={badge.name} role="img">{icons[badge.id] ?? "🏅"}</span>
                          ))}
                          {worker.earnedCount === 0 && <span className="muted">None yet</span>}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary"
                            aria-expanded={worker.workerId === selectedId}
                            onClick={() => setSelectedId((current) => (current === worker.workerId ? "" : worker.workerId))}
                          >
                            {worker.workerId === selectedId ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected && (
                <div className="ras-badge-detail">
                  <h3>{selected.name} · {selected.earnedCount} of {selected.badges.length} badges</h3>
                  <ul className="ras-badge-grid">
                    {selected.badges.map((badge) => <BadgeTile key={badge.id} badge={badge} />)}
                  </ul>
                </div>
              )}
            </>
          ))}
        </>
      )}
    </section>
  );
}
