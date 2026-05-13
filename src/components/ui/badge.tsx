import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground border-border",
        login: "border-cyan-500/40 bg-cyan-500/15 text-cyan-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
