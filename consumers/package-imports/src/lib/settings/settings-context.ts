import { createContext, useContext } from "react";

export interface Settings {
  readonly density: "compact" | "comfortable";
}

export const SettingsContext = createContext<Settings>({ density: "compact" });

export function useSettings(): Settings {
  return useContext(SettingsContext);
}
