export const BUSINESS_TIME_ZONE = "Asia/Karachi";

function pakistanDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function formatDate(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export function today(now = new Date()): string {
  const { year, month, day } = pakistanDateParts(now);
  return formatDate(year, month, day);
}

export function plusDays(days: number, from = new Date()): string {
  const { year, month, day } = pakistanDateParts(from);
  const result = new Date(Date.UTC(year, month - 1, day));

  result.setUTCDate(result.getUTCDate() + days);

  return formatDate(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    result.getUTCDate(),
  );
}