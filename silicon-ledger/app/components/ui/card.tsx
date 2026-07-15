import { cn } from "~/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mac-card", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("px-4 py-2.5 border-b border-hairline", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn("text-xs font-semibold text-zinc-800 dark:text-zinc-200", className)}>
      {children}
    </p>
  );
}
