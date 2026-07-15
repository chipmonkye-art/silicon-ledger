import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6 text-sm leading-relaxed">
      <h1 className="text-xl font-bold">Privacy Policy</h1>
      <p className="text-xs text-zinc-400">Last updated: July 15, 2026</p>

      <section className="space-y-2">
        <h2 className="font-semibold">Data We Collect</h2>
        <p>We collect only the data necessary for the app to function:</p>
        <ul className="list-disc pl-5 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li><strong>Email address</strong> — account authentication and communication</li>
          <li><strong>Financial transactions</strong> — amounts, descriptions, dates, accounts, categories (stored as integer cents)</li>
          <li><strong>Biometric credentials</strong> — WebAuthn public key or ECDSA public key for secure authentication</li>
          <li><strong>Device identifier</strong> — for push notification delivery</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">How We Use Data</h2>
        <ul className="list-disc pl-5 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li>Core accounting functionality — track income, expenses, transfers</li>
          <li>Authentication and session management</li>
          <li>Push notification delivery for reminders and alerts</li>
          <li>Voice search — speech-to-text is processed on-device via the Web Speech API; transcripts are sent to our NLP search endpoint for query parsing only</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Data Storage & Security</h2>
        <ul className="list-disc pl-5 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li>All data stored in PostgreSQL 17 on Supabase (ca-central-1)</li>
          <li>Transport encryption: TLS 1.3</li>
          <li>Database encryption: AES-256 at rest</li>
          <li>Row-level security: each user can only access their own workspace data</li>
          <li>Session tokens: short-lived JWT access tokens (15min) with refresh rotation</li>
          <li>Session revocation: server-side Redis/in-memory blacklist</li>
          <li>Credit card numbers are never stored; only transaction amounts</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Data Retention</h2>
        <p>Transaction data is retained indefinitely for accounting continuity. You may export or purge all personal data at any time via Settings &gt; Delete Account (GDPR right-to-erasure).</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Third-Party Services</h2>
        <ul className="list-disc pl-5 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li><strong>Supabase</strong> — database, authentication, storage</li>
          <li><strong>Frankfurter API</strong> — foreign exchange rates (public API, no user data sent)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Your Rights (GDPR)</h2>
        <ul className="list-disc pl-5 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li>Right to access — view all your data in-app or export as CSV/JSON</li>
          <li>Right to rectification — edit any transaction or profile field</li>
          <li>Right to erasure — purge all personal data via account deletion</li>
          <li>Right to data portability — export all transactions as CSV</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Contact</h2>
        <p>For privacy inquiries, contact the workspace owner or open an issue at <span className="font-mono text-xs">github.com/anomalyco/opencode</span>.</p>
      </section>

      <div className="pt-4">
        <Link to="/" className="text-expense text-xs hover:underline">&larr; Back to app</Link>
      </div>
    </div>
  );
}
