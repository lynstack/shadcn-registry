import { formatCount } from "#/lib/format.js";

export function CounterLabel({ count }: { readonly count: number }) {
  return <span>{formatCount(count)}</span>;
}
