import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { supabase } from "~/lib/supabase";
import { useAuthStore } from "~/lib/stores";
import { seedUserData } from "~/lib/api";

export const Route = createFileRoute("/auth/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function afterAuth(data: { session: { access_token: string; user: { id: string } } }) {
    setSession(data.session.access_token, data.session.user.id);
    try {
      await seedUserData();
    } catch { /* profile already exists — fine */ }
    navigate({ to: "/dashboard" });
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");
    setSuccess("");

    if (mode === "signin") {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email, password,
      });
      if (err) { setError(err.message); setLoading(false); return; }
      if (data.session) {
        await afterAuth(data);
      }
    } else {
      const { data, error: err } = await supabase.auth.signUp({
        email, password,
        options: { data: {} },
      });
      if (err) { setError(err.message); setLoading(false); return; }
      if (data.user?.identities?.length === 0) {
        setError("This email is already registered. Sign in instead.");
      } else if (data.session) {
        await afterAuth(data);
      } else {
        setSuccess("Account created! Check your email to confirm, or try signing in.");
        setMode("signin");
      }
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Silicon Accounting</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Precision ledger, minimalist by design
          </p>
        </div>

        <div className="flex rounded-lg border border-hairline p-1">
          <button
            onClick={() => { setMode("signin"); setError(""); setSuccess(""); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === "signin" ? "bg-expense text-white" : "text-zinc-500"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === "signup" ? "bg-expense text-white" : "text-zinc-500"
            }`}
          >
            Sign Up
          </button>
        </div>

        <div className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            placeholder={mode === "signup" ? "Choose a password" : "Enter your password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />

          {error && <p className="text-xs text-expense">{error}</p>}
          {success && <p className="text-xs text-green-600">{success}</p>}

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={loading || !email || !password}
          >
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </div>
      </div>
    </div>
  );
}
