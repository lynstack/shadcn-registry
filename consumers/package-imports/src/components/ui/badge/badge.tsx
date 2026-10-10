import type { ComponentProps } from "react";

import { useSettings } from "#/lib/settings/settings-context";
import type { BadgeTone } from "./badge-variants";
import { badgeVariants } from "./badge-variants";

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & { readonly tone?: BadgeTone }) {
  const { density } = useSettings();
  return (
    <span className={badgeVariants({ tone, density, className })} {...props} />
  );
}
