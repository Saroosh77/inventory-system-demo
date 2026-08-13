/**
 * Historical aliases over `lib/server/platform/date`, kept so the sales,
 * purchasing and recovery services keep compiling. `parseDate` now routes
 * through the validating parser rather than a second copy that returned an
 * Invalid Date silently.
 */
export {
  formatDateOnly as dateOnly,
  parseDateOnly as parseDate,
} from "@/lib/server/platform/date";

export function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
