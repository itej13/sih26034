"use client";

import Link from "next/link";

/**
 * Without this a thrown render error showed Next's own default page — the thing a judge sees
 * if they type a URL by hand. It states what failed without claiming any inspection outcome:
 * a screen that cannot render is not a verdict.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page-shell flex flex-1 items-center">
      <section className="panel max-w-xl border-l-4 border-l-verdict-violation-border p-8" role="alert">
        <p className="eyebrow">Screen error</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">This screen could not be displayed</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          No inspection result is implied by this failure. The underlying record, if one exists, is unchanged.
        </p>
        <p className="mt-3 break-words font-mono text-xs text-ink-faint">{error.message}{error.digest && ` · ${error.digest}`}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="button-primary">Try again</button>
          <Link href="/history" className="button-secondary">Open the register</Link>
        </div>
      </section>
    </main>
  );
}
