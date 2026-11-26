import mongoose from "mongoose";
import {
  HAZARD_TYPES,
  HAZARD_SEVERITIES,
  HAZARD_STATUSES,
} from "../models/HazardReport.js";

export function parseHazardReport(body) {
  const { siteId, type, severity, location = "", description } = body ?? {};

  if (typeof siteId !== "string" || !mongoose.isObjectIdOrHexString(siteId)) {
    return { error: "Select a valid site." };
  }
  if (!HAZARD_TYPES.includes(type)) {
    return { error: "Choose Hazard or Near miss." };
  }
  if (!HAZARD_SEVERITIES.includes(severity)) {
    return { error: "Choose a severity: Low, Medium or High." };
  }
  if (typeof location !== "string" || location.trim().length > 200) {
    return { error: "Location must be no more than 200 characters." };
  }
  if (
    typeof description !== "string" ||
    !description.trim() ||
    description.trim().length > 2000
  ) {
    return { error: "Describe what happened (maximum 2,000 characters)." };
  }

  return {
    value: {
      siteId,
      type,
      severity,
      location: location.trim(),
      description: description.trim(),
    },
  };
}

export function parseHazardStatus(body) {
  const { status, note = "" } = body ?? {};

  if (!HAZARD_STATUSES.includes(status)) {
    return { error: "Choose Open, In progress or Resolved." };
  }
  if (typeof note !== "string" || note.trim().length > 1000) {
    return { error: "Note must be no more than 1,000 characters." };
  }

  return { value: { status, note: note.trim() } };
}

export function parseHazardFilters(query) {
  const { status, siteId } = query ?? {};
  const filter = {};

  if (status !== undefined && status !== "") {
    if (!HAZARD_STATUSES.includes(status)) {
      return { error: "Invalid status filter." };
    }
    filter.status = status;
  }
  if (siteId !== undefined && siteId !== "") {
    if (typeof siteId !== "string" || !mongoose.isObjectIdOrHexString(siteId)) {
      return { error: "Invalid site filter." };
    }
    filter.site = new mongoose.Types.ObjectId(siteId);
  }

  return { value: filter };
}

// Photo object keys stay on the server; clients load signed URLs separately.
export function publicHazardReport(report) {
  const { photos = [], __v: _version, ...rest } = report;
  return { ...rest, photoCount: photos.length };
}
