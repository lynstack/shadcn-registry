import { createRecipes } from "@lynstack/class-recipe";
import { twMerge } from "tailwind-merge";

export const { cx: cn, cva } = createRecipes({ join: twMerge });
