import { cn } from "~/lib/utils";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" && "h-7 px-2.5 text-[10px] rounded-lg gap-1",
        size === "md" && "h-9 px-4 text-xs rounded-xl gap-1.5",
        size === "lg" && "h-11 px-6 text-sm rounded-xl gap-2",
        variant === "default" && "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
        variant === "outline" && "border border-hairline bg-white/50 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300",
        variant === "ghost" && "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400",
        variant === "danger" && "bg-expense text-white hover:bg-expense-light shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
