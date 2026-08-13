export function formatPkr(value: number, compact = false) {
  if (compact && value >= 1_000_000) {
    return `PKR ${(value / 1_000_000).toFixed(2)}M`;
  }
  if (compact && value >= 1_000) {
    return `PKR ${(value / 1_000).toFixed(0)}K`;
  }
  return `PKR ${new Intl.NumberFormat("en-PK").format(value)}`;
}

export function salesTypeLabel(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
