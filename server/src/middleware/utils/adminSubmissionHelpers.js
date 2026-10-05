export const EXPORT_CHECKS = [
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
];

export function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function parseAdminFilters(query = {}) {
  const filters = {};
  for (const key of ["siteId", "workerId", "from", "to", "status"]) {
    const value = query[key];
    if (value !== undefined && typeof value !== "string") {
      throw badRequest(`Invalid ${key} filter.`);
    }
    filters[key] = value || "";
  }
  for (const key of ["siteId", "workerId"]) {
    if (filters[key] && !/^[a-f\d]{24}$/i.test(filters[key])) {
      throw badRequest(`Invalid ${key === "siteId" ? "site" : "worker"} ID.`);
    }
  }
  for (const key of ["from", "to"]) {
    const value = filters[key];
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) {
      throw badRequest("Enter a valid work date.");
    }
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    throw badRequest("The start date must be on or before the end date.");
  }
  filters.status ||= "ALL";
  if (!["ALL", "AUTHORIZED", "AWAITING"].includes(filters.status)) {
    throw badRequest("Invalid authorization status.");
  }
  return filters;
}

export function csvCell(value) {
  let text = value == null ? "" : String(value);
  // Keep user-entered names/notes as text when opened in spreadsheet apps.
  if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function timestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : "";
}

export function csvHeader() {
  return ["Submission ID", "Worker", "Site", "Work date", "Status", "Submitted at (UTC)",
    "Authorized by", "Authorized at (UTC)", "Revoked by", "Revoked at (UTC)",
    "Hazards and notes", "Photo count", ...EXPORT_CHECKS.map(([, label]) => label)]
    .map(csvCell).join(",");
}

export function csvSubmission(submission) {
  return [submission._id, submission.worker?.name ?? "Unavailable worker",
    submission.site?.name ?? "Unavailable site", submission.workDate, submission.status,
    timestamp(submission.createdAt), submission.authorizedBy?.name ?? "",
    timestamp(submission.authorizedAt), submission.revokedBy?.name ?? "",
    timestamp(submission.revokedAt), submission.notes ?? "", submission.photos?.length ?? 0,
    ...EXPORT_CHECKS.map(([key]) => submission.checklist?.[key] === true ? "Yes"
      : submission.checklist?.[key] === false ? "No" : "Not recorded")]
    .map(csvCell).join(",");
}
