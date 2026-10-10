import { cva } from "@lynstack/class-recipe";
import type { VariantsOf } from "@lynstack/class-recipe";

export const badgeVariants = cva({
  base: "inline-flex rounded-sm px-1.5 animate-in fade-in",
  variants: {
    tone: {
      danger: "bg-danger text-danger-foreground",
      neutral: "bg-muted text-foreground",
    },
    density: {
      comfortable: "text-sm",
      compact: "text-xs",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type BadgeTone = NonNullable<VariantsOf<typeof badgeVariants>["tone"]>;
