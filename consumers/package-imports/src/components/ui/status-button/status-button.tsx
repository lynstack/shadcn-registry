import { Button } from "@base-ui/react/button";
import type { ReactNode } from "react";

import { Badge } from "#/components/ui/badge/badge";
import { join } from "#/lib/classes/join";

export function StatusButton({
  children,
  status,
}: {
  readonly children: ReactNode;
  readonly status: string;
}) {
  return (
    <Button className={join("inline-flex items-center gap-2 rounded-md px-3")}>
      {children}
      <Badge>{status}</Badge>
    </Button>
  );
}
