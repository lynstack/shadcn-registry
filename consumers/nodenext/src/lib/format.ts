export function formatCount(count: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(count);
}
