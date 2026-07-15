import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiFetch } from "~/lib/client";
import { Bell, Check, X, AlertCircle, Clock, RefreshCw } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

interface Notification {
  id: string;
  workspace_id: string | null;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  staged_pending: <Clock size={12} className="text-amber-500" />,
  transaction_rejected: <X size={12} className="text-red-500" />,
  transaction_approved: <Check size={12} className="text-green-500" />,
  invite_received: <Bell size={12} className="text-expense" />,
  digest: <RefreshCw size={12} className="text-zinc-500" />,
};

export function NotificationCenter() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<{ notifications: Notification[]; unread: number }>("/api/v2/notifications"),
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch("/api/v2/notifications/read", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/api/v2/notifications/read", {
      method: "POST",
      body: JSON.stringify({ id: "all" }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-expense text-white text-[8px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 max-h-96 overflow-y-auto bg-white dark:bg-zinc-900 border border-hairline rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
              <span className="text-xs font-semibold">Notifications</span>
              {unread > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-[10px] text-expense hover:underline font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>

            {isLoading ? (
              <p className="text-xs text-zinc-400 text-center py-6">Loading...</p>
            ) : notifications.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">No notifications</p>
            ) : (
              <div className="divide-y divide-hairline">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer",
                      !n.read_at && "bg-expense/5",
                    )}
                    onClick={() => {
                      if (!n.read_at) markRead.mutate(n.id);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">
                        {TYPE_ICONS[n.type] || <Bell size={12} className="text-zinc-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{n.title}</p>
                        {n.body && <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-[9px] text-zinc-500 font-mono mt-1">
                          {new Date(n.created_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {!n.read_at && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markRead.mutate(n.id); }}
                          className="shrink-0 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
                        >
                          <X size={10} className="text-zinc-400" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
