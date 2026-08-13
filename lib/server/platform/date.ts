import { DomainError } from "./domain-error";

export function parseDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError(400, "Use a valid date in YYYY-MM-DD format.", "INVALID_DATE");
  }
  return date;
}

export function formatDateOnly(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

/**
 * How far back a transaction may be dated. Backdating past this window would
 * drop entries into periods that have already been reported on.
 */
const DEFAULT_BACKDATE_LIMIT_DAYS = 90;

function backdateLimitDays() {
  const configured = Number(process.env.POSTING_BACKDATE_LIMIT_DAYS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_BACKDATE_LIMIT_DAYS;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Guards the posting date of a financial or stock transaction.
 *
 * Document dates were previously unconstrained, so an order could be dated
 * years into the past or future. Because a document's number is derived from
 * its year, that also let entries be inserted into a closed year's series.
 *
 * Forward-dating is allowed one day of slack: business dates are computed in
 * Pakistan time (UTC+5) while the parsed value is UTC midnight, so a genuine
 * "today" can read as tomorrow for part of the day.
 *
 * Deliberately not applied to expiry, due or expected dates, which are
 * supposed to be in the future.
 */
export function assertPostingDate(date: Date, label = "date") {
  const now = Date.now();
  if (date.getTime() > now + DAY_MS) {
    throw new DomainError(
      422,
      `The ${label} cannot be in the future.`,
      "POSTING_DATE_IN_FUTURE",
    );
  }

  const limitDays = backdateLimitDays();
  if (date.getTime() < now - limitDays * DAY_MS) {
    throw new DomainError(
      422,
      `The ${label} is more than ${limitDays} days old. Reopen the period or use a current date.`,
      "POSTING_DATE_TOO_OLD",
    );
  }

  return date;
}

/** Parses a transaction date and rejects it if it falls outside the open period. */
export function parsePostingDate(value: string, label = "date") {
  return assertPostingDate(parseDateOnly(value), label);
}
