import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)] shadow",
        secondary:
          "border-transparent bg-[var(--secondary)] text-[var(--secondary-foreground)]",
        outline: "border-[var(--border)] text-[var(--foreground)]",
        destructive:
          "border-transparent bg-[var(--destructive)] text-[var(--destructive-foreground)] shadow",
        warning:
          "border-amber-200/80 bg-amber-100 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100",
        success:
          "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
        muted:
          "border-transparent bg-[var(--muted)] text-[var(--muted-foreground)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
