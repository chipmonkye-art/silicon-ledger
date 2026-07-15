import type { ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";

interface Column {
  key: string;
  label: string;
  grow?: boolean;
  width?: string;
  align?: "left" | "right";
}

interface Row {
  id: string;
  cells: Record<string, ReactNode>;
}

interface CompactListProps {
  title: string;
  columns: Column[];
  rows: Row[];
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onRowClick?: (id: string) => void;
  actionLabel?: string;
  onAction?: () => void;
  tabs?: { key: string; label: string; active: boolean; onClick: () => void }[];
}

export function CompactList({
  title,
  columns,
  rows,
  searchable,
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  onRowClick,
  actionLabel,
  onAction,
  tabs,
}: CompactListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-1">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-bold text-zinc-800 dark:text-zinc-100">{title}</h1>
        </div>

        {/* Segmented Tabs */}
        {tabs && (
          <div className="flex border-b border-hairline text-[11px] font-medium mb-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={tab.onClick}
                className={`flex-1 pb-2 border-b-2 transition-colors ${
                  tab.active
                    ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-zinc-400"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        {searchable && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-zinc-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-md py-1.5 pl-8 pr-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-zinc-400"
            />
          </div>
        )}
      </div>

      {/* Column Headers */}
      <div className="flex justify-between px-4 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] font-bold text-zinc-500 border-y border-hairline">
        {columns.map((col) => (
          <span
            key={col.key}
            className={col.align === "right" ? "text-right" : ""}
            style={col.width ? { width: col.width, flexShrink: 0 } : col.grow ? { flex: 1 } : { flex: 1 }}
          >
            {col.label}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-hairline">
        {rows.map((row) => (
          <div
            key={row.id}
            onClick={() => onRowClick?.(row.id)}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer active:bg-zinc-100 dark:active:bg-zinc-700"
          >
            {columns.map((col) => (
              <span
                key={col.key}
                className={`text-[11px] truncate ${
                  col.align === "right" ? "text-right" : ""
                } ${col.key === "name" ? "font-medium text-zinc-700 dark:text-zinc-300" : "text-zinc-400"}`}
                style={col.width ? { width: col.width, flexShrink: 0 } : col.grow ? { flex: 1, marginRight: 8 } : { flex: 1 }}
              >
                {row.cells[col.key]}
              </span>
            ))}
            {onRowClick && <ChevronRight size={12} className="text-zinc-300 shrink-0 ml-2" />}
          </div>
        ))}
      </div>

      {/* Sticky Action Button */}
      {actionLabel && onAction && (
        <div className="p-3 bg-white dark:bg-zinc-900 border-t border-hairline">
          <button
            onClick={onAction}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-full text-[13px] font-bold hover:bg-indigo-700 active:bg-indigo-800 shadow-sm transition-all active:scale-[0.98]"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
