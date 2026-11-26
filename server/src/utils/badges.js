import { buildLeaderboard } from "./leaderboard.js";

// Badges are derived from existing forms and hazard reports; nothing is stored.
export const BADGES = [
  { id: "first-form", name: "First Form", description: "Submit your first safety form.", metric: "forms", target: 1 },
  { id: "forms-10", name: "10 Forms", description: "Submit 10 safety forms.", metric: "forms", target: 10 },
  { id: "forms-30", name: "30 Forms", description: "Submit 30 safety forms.", metric: "forms", target: 30 },
  { id: "forms-100", name: "100 Forms", description: "Submit 100 safety forms.", metric: "forms", target: 100 },
  { id: "streak-5", name: "5-Day Streak", description: "Respond on time 5 tracked days in a row.", metric: "bestStreak", target: 5 },
  { id: "streak-10", name: "10-Day Streak", description: "Respond on time 10 tracked days in a row.", metric: "bestStreak", target: 10 },
  { id: "first-responder", name: "First Responder", description: "Be first to submit the safety form on 10 days.", metric: "firstPlace", target: 10 },
  { id: "hazard-spotter", name: "Hazard Spotter", description: "Report a hazard or near miss.", metric: "hazardReports", target: 1 },
  { id: "monthly-champion", name: "Monthly Champion", description: "Finish a month with the most leaderboard points.", metric: "championships", target: 1 },
];

// "YYYY-MM" of the month before the given "YYYY-MM-DD" business date.
export function previousMonth(date) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

export function monthRange(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

// Everyone tied for rank 1 on the month's leaderboard shares the title.
export function monthWinners(submissions) {
  return buildLeaderboard(submissions).leaderboard
    .filter((entry) => entry.rank === 1)
    .map(({ workerId, name, points, firstPlace }) => ({ workerId, name, points, firstPlace }));
}

// Champions of every completed month before `currentMonth` ("YYYY-MM").
export function monthlyChampions(submissions, currentMonth) {
  const byMonth = new Map();
  for (const submission of submissions) {
    const month = submission.workDate?.slice(0, 7);
    if (!month || month >= currentMonth) continue;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(submission);
  }
  return [...byMonth.keys()].sort()
    .map((month) => ({ month, winners: monthWinners(byMonth.get(month)) }))
    .filter((result) => result.winners.length > 0);
}

// `workers` need _id and name; `submissions` need worker, workDate, createdAt;
// `hazardCounts` maps worker ID to reports filed; `today` is the BC business date.
export function buildBadges({ workers, submissions, hazardCounts = new Map(), today }) {
  const allTime = new Map(buildLeaderboard(submissions).leaderboard.map((entry) => [entry.workerId, entry]));
  const formCounts = new Map();
  for (const submission of submissions) {
    const workerId = submission.worker?._id ?? submission.worker;
    if (!workerId) continue;
    formCounts.set(String(workerId), (formCounts.get(String(workerId)) ?? 0) + 1);
  }

  const champions = monthlyChampions(submissions, today.slice(0, 7));
  const titles = new Map();
  for (const { winners } of champions) {
    for (const { workerId } of winners) titles.set(workerId, (titles.get(workerId) ?? 0) + 1);
  }
  const lastMonth = previousMonth(today);

  const results = workers.map((worker) => {
    const workerId = String(worker._id);
    const stats = {
      forms: formCounts.get(workerId) ?? 0,
      bestStreak: allTime.get(workerId)?.bestStreak ?? 0,
      firstPlace: allTime.get(workerId)?.firstPlace ?? 0,
      hazardReports: hazardCounts.get(workerId) ?? 0,
      championships: titles.get(workerId) ?? 0,
    };
    const badges = BADGES.map(({ metric, target, ...badge }) => ({
      ...badge,
      target,
      progress: Math.min(stats[metric], target),
      earned: stats[metric] >= target,
    }));
    return { workerId, name: worker.name, stats, earnedCount: badges.filter((badge) => badge.earned).length, badges };
  }).sort((a, b) => b.earnedCount - a.earnedCount || a.name.localeCompare(b.name));

  return {
    monthlyChampion: champions.find((result) => result.month === lastMonth) ?? null,
    workers: results,
  };
}
