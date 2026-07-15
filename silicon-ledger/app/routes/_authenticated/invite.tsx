import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { acceptInvite } from "~/lib/api";
import { useWorkspaceStore } from "~/lib/stores";

export const Route = createFileRoute("/_authenticated/invite")({
  component: InviteRedemption,
});

function InviteRedemption() {
  const navigate = useNavigate();
  const { setWorkspace } = useWorkspaceStore();
  const [code, setCode] = useState("");

  const { mutate, isPending, isError, error, isSuccess } = useMutation({
    mutationFn: acceptInvite,
    onSuccess: async (data) => {
      const ws = (data as { workspace?: { id: string; name: string } }).workspace;
      if (ws) {
        setWorkspace(ws.id);
        setTimeout(() => navigate({ to: "/dashboard" }), 1500);
      }
    },
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Join Workspace</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Enter the 8-character invite code shared by your workspace owner.
          </p>
        </div>

        <input
          type="text"
          maxLength={9}
          className="w-full text-center py-4 text-2xl font-mono tracking-widest uppercase border-b border-hairline focus:border-expense focus:outline-none transition-colors bg-transparent"
          placeholder="XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.length >= 8 && !isPending) mutate(code);
          }}
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          spellCheck={false}
          autoFocus
        />

        <button
          onClick={() => mutate(code)}
          disabled={isPending || isSuccess || code.length < 8}
          className="w-full py-3 text-sm font-medium rounded-lg transition-colors disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400"
          style={{
            backgroundColor: isSuccess ? "#16a34a" : "oklch(0.58 0.22 25)",
            color: "white",
          }}
          onMouseOver={(e) => {
            if (!isSuccess && !isPending) e.currentTarget.style.backgroundColor = "oklch(0.52 0.22 25)";
          }}
          onMouseOut={(e) => {
            if (!isSuccess && !isPending) e.currentTarget.style.backgroundColor = "oklch(0.58 0.22 25)";
          }}
        >
          {isPending ? "Verifying..." : isSuccess ? "Joined!" : "Accept Invitation"}
        </button>

        {isError && (
          <div className="p-3 rounded-lg border border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20">
            <p className="text-[10px] text-red-600 dark:text-red-400 uppercase tracking-wider font-bold">Error</p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
              {error instanceof Error ? error.message : "Invalid or expired invite code"}
            </p>
          </div>
        )}

        {isSuccess && (
          <p className="text-xs text-center text-green-600 dark:text-green-400 animate-pulse">
            Redirecting to dashboard...
          </p>
        )}
      </div>
    </div>
  );
}
