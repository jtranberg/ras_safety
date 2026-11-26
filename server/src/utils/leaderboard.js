// Points for the daily response order. Every on-time response earns at least
// the participation point, so consistency is rewarded as well as speed.
export const POSITION_POINTS = [5, 3, 2];
export const PARTICIPATION_POINTS = 1;

export function pointsForPosition(position) {
  return POSITION_POINTS[position - 1] ?? PARTICIPATION_POINTS;
}

// Minutes after midnight in the business timezone.
export function localMinutes(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  return part("hour") * 60 + part("minute");
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// Rank workers by who responded first to each day's safety form.
// `submissions` need worker ({ _id, name }), workDate and createdAt.
export function buildLeaderboard(submissions) {
  const days = new Map();
  for (const submission of submissions) {
    const worker = submission.worker;
    const submittedAt = new Date(submission.createdAt);
    if (!worker?._id || !submission.workDate || !Number.isFinite(submittedAt.valueOf())) continue;
    const workerId = String(worker._id);
    const day = days.get(submission.workDate) ?? new Map();
    const previous = day.get(workerId);
    // Only a worker's first response on a day counts toward the order.
    if (!previous || submittedAt < previous.submittedAt) {
      day.set(workerId, { workerId, name: worker.name ?? "Unavailable worker", submittedAt });
    }
    days.set(submission.workDate, day);
  }

  const dates = [...days.keys()].sort();
  const stats = new Map();
  const dailyOrder = [];

  for (const date of dates) {
    const order = [...days.get(date).values()]
      .sort((a, b) => a.submittedAt - b.submittedAt || a.workerId.localeCompare(b.workerId));
    dailyOrder.push({
      date,
      responses: order.map((entry, index) => ({
        position: index + 1, workerId: entry.workerId, name: entry.name,
        submittedAt: entry.submittedAt.toISOString(), points: pointsForPosition(index + 1),
      })),
    });
    order.forEach((entry, index) => {
      const position = index + 1;
      const record = stats.get(entry.workerId) ?? {
        workerId: entry.workerId, name: entry.name, points: 0, firstPlace: 0, secondPlace: 0,
        thirdPlace: 0, daysResponded: 0, positionTotal: 0, minutesTotal: 0, fastestMinutes: null,
        respondedDates: new Set(),
      };
      const minutes = localMinutes(entry.submittedAt);
      record.points += pointsForPosition(position);
      if (position === 1) record.firstPlace += 1;
      if (position === 2) record.secondPlace += 1;
      if (position === 3) record.thirdPlace += 1;
      record.daysResponded += 1;
      record.positionTotal += position;
      record.minutesTotal += minutes;
      record.fastestMinutes = record.fastestMinutes === null ? minutes : Math.min(record.fastestMinutes, minutes);
      record.respondedDates.add(date);
      stats.set(entry.workerId, record);
    });
  }

  const ranked = [...stats.values()].map((record) => {
    // Streaks count consecutive tracked days (days with any response).
    let run = 0;
    let bestStreak = 0;
    for (const date of dates) {
      run = record.respondedDates.has(date) ? run + 1 : 0;
      bestStreak = Math.max(bestStreak, run);
    }
    return {
      workerId: record.workerId,
      name: record.name,
      points: record.points,
      firstPlace: record.firstPlace,
      secondPlace: record.secondPlace,
      thirdPlace: record.thirdPlace,
      daysResponded: record.daysResponded,
      participationRate: dates.length ? round((record.daysResponded / dates.length) * 100) : 0,
      averagePosition: round(record.positionTotal / record.daysResponded),
      averageResponseMinutes: Math.round(record.minutesTotal / record.daysResponded),
      fastestResponseMinutes: record.fastestMinutes,
      currentStreak: run,
      bestStreak,
    };
  }).sort((a, b) => b.points - a.points || b.firstPlace - a.firstPlace
    || a.averagePosition - b.averagePosition || a.name.localeCompare(b.name));

  let rank = 0;
  ranked.forEach((entry, index) => {
    const previous = ranked[index - 1];
    const tied = previous && previous.points === entry.points && previous.firstPlace === entry.firstPlace
      && previous.averagePosition === entry.averagePosition;
    rank = tied ? rank : index + 1;
    entry.rank = rank;
  });

  const firstResponses = dailyOrder.map((day) => ({ ...day.responses[0], date: day.date }));
  const earliest = firstResponses.reduce((best, response) => {
    const minutes = localMinutes(response.submittedAt);
    return !best || minutes < best.minutes ? { ...response, minutes } : best;
  }, null);
  const totalResponses = dailyOrder.reduce((sum, day) => sum + day.responses.length, 0);

  return {
    leaderboard: ranked,
    metrics: {
      daysTracked: dates.length,
      totalResponses,
      respondents: ranked.length,
      averageResponsesPerDay: dates.length ? round(totalResponses / dates.length) : 0,
      averageFirstResponseMinutes: firstResponses.length
        ? Math.round(firstResponses.reduce((sum, response) => sum + localMinutes(response.submittedAt), 0) / firstResponses.length)
        : null,
      earliestResponse: earliest
        ? { name: earliest.name, workerId: earliest.workerId, date: earliest.date, minutes: earliest.minutes }
        : null,
    },
    latestDay: dailyOrder.at(-1) ?? null,
  };
}
