import { useClickCount } from "#/hooks/use-click-count.js";
import { CounterLabel } from "./counter-label.js";

export function Counter() {
  const [count, increment] = useClickCount();
  return (
    <button type="button" onClick={increment}>
      <CounterLabel count={count} />
    </button>
  );
}
