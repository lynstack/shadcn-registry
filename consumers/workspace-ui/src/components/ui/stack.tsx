import { spacing } from "@consumers/workspace-tokens";
import { cx } from "@lynstack/class-recipe";
import type { ComponentProps } from "react";

export function Stack({ className, style, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("flex flex-col", className)}
      style={{ gap: spacing.compact, ...style }}
      {...props}
    />
  );
}
