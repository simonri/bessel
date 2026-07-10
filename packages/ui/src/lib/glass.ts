import { cva } from "class-variance-authority";

export const glassSurface = cva("backdrop-blur-xl", {
  variants: {
    weight: {
      light: "bg-black/40",
      medium: "bg-black/60",
      heavy: "bg-black/80",
    },
  },
  defaultVariants: {
    weight: "medium",
  },
});
