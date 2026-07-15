import { cn } from "~/lib/utils";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ className, label, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        className={cn(
          "w-full h-8 px-2.5 rounded-lg border border-hairline bg-white/50 dark:bg-zinc-800/50 text-xs font-mono",
          "focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent",
          "placeholder:text-zinc-400",
          className,
        )}
        {...props}
      />
    </div>
  );
}
