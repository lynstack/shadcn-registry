import type { ReactNode } from "react";

import { SettingsContext } from "#/lib/settings/settings-context";
import type { Settings } from "#/lib/settings/settings-context";

export function SettingsProvider({
  children,
  settings,
}: {
  readonly children: ReactNode;
  readonly settings: Settings;
}) {
  return <SettingsContext value={settings}>{children}</SettingsContext>;
}
