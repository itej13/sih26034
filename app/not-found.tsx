import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-shell flex flex-1 items-center">
      <section className="panel max-w-xl p-8">
        <p className="eyebrow">Not found</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">No inspection matches that address</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          The scan id may be mistyped, or the record may not have been filed on this machine. The register lists every inspection this deployment can reach.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/history" className="button-primary">Open the register</Link>
          <Link href="/capture" className="button-secondary">Start an inspection</Link>
        </div>
      </section>
    </main>
  );
}
