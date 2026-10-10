import type { PropsOf } from "@lynstack/class-recipe";
import type { ComponentProps } from "react";

import { cva } from "@/lib/utils";

const buttonVariants = cva({
  base: "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium",
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      outline: "border border-border bg-background",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Button({
  className,
  variant,
  ...props
}: ComponentProps<"button"> & PropsOf<typeof buttonVariants>) {
  return (
    <button className={buttonVariants({ variant, className })} {...props} />
  );
}
