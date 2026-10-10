import { useState } from "react";

export function useClickCount(start = 0): readonly [number, () => void] {
  const [count, setCount] = useState(start);
  return [count, () => setCount((value) => value + 1)];
}
