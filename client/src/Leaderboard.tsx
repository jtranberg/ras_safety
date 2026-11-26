import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import "./Leaderboard.css";

type LeaderboardEntry = {
  workerId: string;
  name: string;
  rank: number;
  points: number;
  firstPlace: number;
  secondPlace: number;
  thirdPlace: number;
  daysResponded: number;
  participationRate: number;
  averagePosition: number;
  averageResponseMinutes: number;
  fastestResponseMinutes: number | null;
  currentStreak: number;
  bestStreak: number;
};
type DayResponse = {
  position: number;
  workerId: string;
  name: string;
  submittedAt: string;
  points: number;
};
type LeaderboardResult = {
  leaderboard: LeaderboardEntry[];
  metrics: {
    daysTracked: number;
    totalResponses: number;
    respondents: number;
    averageResponsesPerDay: number;
    averageFirstResponseMinutes: number | null;
    earliestResponse: { name: string; workerId: string; date: string; minutes: number } | null;
  };
  latestDay: { date: string; responses: DayResponse[] } | null;
};
export type LeaderboardPeriod = "today" | "7" | "30" | "all";
type Period = LeaderboardPeriod;

const periods: [Period, string][] = [
  ["today", "Today"],
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["all", "All time"],
];
const medals = ["1st", "2nd", "3rd"];

function businessToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function periodQuery(period: Period, siteId?: string) {
  const query = new URLSearchParams();
  if (siteId) query.set("siteId", siteId);
  if (period !== "all") {
    const today = businessToday();
    const start = new Date(`${today}T00:00:00Z`);
    if (period !== "today") start.setUTCDate(start.getUTCDate() - (Number(period) - 1));
    query.set("from", start.toISOString().slice(0, 10));
    query.set("to", today);
  }
  return query.toString();
}

function formatMinutes(minutes: number | null) {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: "America/Vancouver", hour: "numeric", minute: "2-digit",
  });
}

function leader(entries: LeaderboardEntry[], score: (entry: LeaderboardEntry) => number) {
  const best = entries.reduce<LeaderboardEntry | null>(
    (top, entry) => (!top || score(entry) > score(top) ? entry : top), null);
  return best && score(best) > 0 ? best : null;
}

// The parent owns the period so it survives dashboard reloads and remounts.
export default function Leaderboard({
  period,
  onPeriodChange,
  refreshKey,
  siteId,
  siteName,
  currentWorkerId,
}: {
  period: Period;
  onPeriodChange: (period: Period) => void;
  refreshKey?: number;
  siteId?: string;
  siteName?: string;
  currentWorkerId?: string;
}) {
  const [data, setData] = useState<LeaderboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    api<LeaderboardResult>(`/submissions/leaderboard?${periodQuery(period, siteId)}`)
      .then((result) => {
        if (active) { setData(result); setError(""); }
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Could not load the leaderboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [period, siteId, reload, refreshKey]);

  function choose(next: Period) {
    if (next === period) return;
    setLoading(true);
    onPeriodChange(next);
  }

  const entries = data?.leaderboard ?? [];
  const metrics = data?.metrics;
  const earlyBird = leader(entries, (entry) => entry.firstPlace);
  const streakLeader = leader(entries, (entry) => entry.currentStreak);
  const mostConsistent = leader(entries, (entry) => entry.participationRate);
  const mine = currentWorkerId ? entries.find((entry) => entry.workerId === currentWorkerId) : undefined;

  return (
    <section className="ras-leaderboard" aria-labelledby="leaderboard-heading">
      <div className="ras-leaderboard-header">
        <div>
          <span className="eyebrow">FIRST RESPONDERS</span>
          <h3 id="leaderboard-heading">Safety response leaderboard</h3>
          <p className="muted">
            Ranked by who submits the daily safety form first{siteName ? ` at ${siteName}` : " across all sites"}.
            Points: 1st = 5, 2nd = 3, 3rd = 2, every other response = 1.
          </p>
        </div>
        <button type="button" className="secondary" disabled={loading} onClick={() => { setLoading(true); setReload((value) => value + 1); }}>
          Refresh
        </button>
      </div>
      <div className="ras-period-tabs" role="group" aria-label="Leaderboard period">
        {periods.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={period === value} disabled={loading} onClick={() => choose(value)}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading leaderboard...</p>
      ) : !metrics || entries.length === 0 ? (
        <p className="muted">No safety forms submitted in this period yet. Be the first!</p>
      ) : (
        <>
          {mine && (
            <p className="ras-my-rank" role="status">
              You are <strong>#{mine.rank}</strong> of {entries.length} with <strong>{mine.points}</strong> points
              {mine.currentStreak > 1 ? ` and a ${mine.currentStreak}-day streak` : ""}.
            </p>
          )}
          <div className="ras-metric-grid">
            <div className="ras-metric"><span>Days tracked</span><strong>{metrics.daysTracked}</strong></div>
            <div className="ras-metric"><span>Responses</span><strong>{metrics.totalResponses}</strong></div>
            <div className="ras-metric"><span>Avg responses / day</span><strong>{metrics.averageResponsesPerDay}</strong></div>
            <div className="ras-metric"><span>Avg first response</span><strong>{formatMinutes(metrics.averageFirstResponseMinutes)}</strong></div>
            <div className="ras-metric">
              <span>Earliest response</span>
              <strong>{formatMinutes(metrics.earliestResponse?.minutes ?? null)}</strong>
              {metrics.earliestResponse && <small>{metrics.earliestResponse.name} · {metrics.earliestResponse.date}</small>}
            </div>
          </div>
          <ul className="ras-awards">
            {earlyBird && <li><strong>Early Bird</strong> {earlyBird.name} · {earlyBird.firstPlace}× first</li>}
            {streakLeader && <li><strong>Streak leader</strong> {streakLeader.name} · {streakLeader.currentStreak} day{streakLeader.currentStreak === 1 ? "" : "s"}</li>}
            {mostConsistent && <li><strong>Most consistent</strong> {mostConsistent.name} · {mostConsistent.participationRate}% of days</li>}
          </ul>
          {data.latestDay && (
            <div className="ras-podium-block">
              <h4>Response order · {data.latestDay.date}</h4>
              <ol className="ras-podium">
                {data.latestDay.responses.slice(0, 3).map((response) => (
                  <li key={response.workerId} className={`ras-podium-${response.position}`}>
                    <span className="ras-medal">{medals[response.position - 1]}</span>
                    <strong>{response.name}</strong>
                    <span>{formatTime(response.submittedAt)}</span>
                  </li>
                ))}
              </ol>
              {data.latestDay.responses.length > 3 && (
                <p className="muted">
                  Then: {data.latestDay.responses.slice(3).map((response) => `${response.name} (${formatTime(response.submittedAt)})`).join(", ")}
                </p>
              )}
            </div>
          )}
          <div className="ras-leaderboard-table" role="region" aria-label="Leaderboard rankings" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Worker</th>
                  <th scope="col">Points</th>
                  <th scope="col">1st / 2nd / 3rd</th>
                  <th scope="col">Days</th>
                  <th scope="col">Participation</th>
                  <th scope="col">Avg position</th>
                  <th scope="col">Avg time</th>
                  <th scope="col">Fastest</th>
                  <th scope="col">Streak</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.workerId} className={entry.workerId === currentWorkerId ? "ras-leaderboard-me" : undefined}>
                    <td><span className={`ras-rank ras-rank-${Math.min(entry.rank, 4)}`}>{entry.rank}</span></td>
                    <th scope="row">{entry.name}</th>
                    <td><strong>{entry.points}</strong></td>
                    <td>{entry.firstPlace} / {entry.secondPlace} / {entry.thirdPlace}</td>
                    <td>{entry.daysResponded}</td>
                    <td>{entry.participationRate}%</td>
                    <td>{entry.averagePosition}</td>
                    <td>{formatMinutes(entry.averageResponseMinutes)}</td>
                    <td>{formatMinutes(entry.fastestResponseMinutes)}</td>
                    <td>{entry.currentStreak} (best {entry.bestStreak})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">Times are BC time. Only each worker's first form per work day counts. Streaks count consecutive days with any submissions.</p>
        </>
      )}
    </section>
  );
}
