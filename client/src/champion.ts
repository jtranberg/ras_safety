export type MonthlyChampion = {
  month: string;
  winners: { workerId: string; name: string; points: number; firstPlace: number }[];
};

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`));
}
