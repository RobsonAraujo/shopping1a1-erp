"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type FormInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "className"
> & {
  label?: string;
  className?: string;
  inputClassName?: string;
};

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, id, className, inputClassName, ...props }, ref) => {
    const inputId = id ?? (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

    return (
      <div className={cn("space-y-1.5", className)}>
        {label ? (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-[var(--muted-foreground)]"
          >
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm transition-colors",
            "placeholder:text-[var(--muted-foreground)] hover:bg-[var(--accent)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30 disabled:cursor-not-allowed disabled:opacity-50",
            inputClassName,
          )}
          {...props}
        />
      </div>
    );
  },
);
FormInput.displayName = "FormInput";
