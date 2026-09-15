"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Scan } from "@/lib/types";
import { VerdictBadge } from "@/components/scan/VerdictBadge";

const manufacturerOf = (scan: Scan) => scan.fields.find((field) => field.key === "manufacturer")?.text ?? "—";
const capturedOn = (scan: Scan) => new Date(scan.captured_at).toLocaleDateString("en-IN", { dateStyle: "medium" });

export default function HistoryPage() {
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState("ALL");
  // This screen filters on the client, so it reads through /api/scan rather than calling the
  // repository directly — the route already routes to Supabase or the fixtures, and its
  // X-Scan-Repository header is the server's own answer about which one replied. Guessing the
  // mode here instead would let the screen label filed rows as fixtures, or worse, the reverse.
  const [allScans, setAllScans] = useState<Scan[]>([]);
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/scan")
      .then(async (response) => {
        const header = response.headers.get("X-Scan-Repository");
        const body = await response.json();
        if (!live) return;
        setMode(header);
        setAllScans(body.scans ?? []);
      })
      .catch(() => { if (live) setMode("unavailable"); });
    return () => { live = false; };
  }, []);

  const scans = allScans.filter((scan) =>
    (verdict === "ALL" || scan.overall === verdict) &&
    `${scan.scan_id} ${manufacturerOf(scan)}`.toLowerCase().includes(query.toLowerCase()));

  const sourceLabel = mode === null ? "Loading…" : mode === "fixture" ? "Fixture development data" : mode === "supabase" ? "Filed inspections" : "Register unavailable";

  return (
    <main className="page-shell">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-6">
        <div>
          <p className="eyebrow">Inspection register</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">Inspection history</h1>
          <p className="mt-2 text-sm text-ink-muted">Search completed scans and reopen their evidence trail.</p>
        </div>
        <Link href="/capture" className="button-primary no-print">New inspection</Link>
      </header>

      <section className="panel mt-7 p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <label className="text-sm font-semibold text-ink-muted">
            Search inspections
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Scan ID or manufacturer" className="field-input" />
          </label>
          <label className="text-sm font-semibold text-ink-muted">
            Verdict
            <select value={verdict} onChange={(event) => setVerdict(event.target.value)} className="field-input">
              <option value="ALL">All verdicts</option>
              <option value="COMPLIANT">Compliant</option>
              <option value="VIOLATION">Violation</option>
              <option value="INDETERMINATE">Indeterminate</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel mt-5 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <p className="text-sm font-semibold text-ink">{scans.length} inspection{scans.length === 1 ? "" : "s"} found</p>
          <p className="text-xs text-ink-faint">{sourceLabel}</p>
        </div>

        {/*
          Below md this was a 600px-wide table inside overflow-x-auto, so a 375px phone read the
          register sideways. The same four columns are kept — inspection, captured, manufacturer,
          verdict — restacked as one card per row, with the whole card as the tap target.
        */}
        <ul className="divide-y divide-line md:hidden">
          {scans.map((scan) => (
            <li key={scan.scan_id}>
              <Link href={`/result/${scan.scan_id}`} className="flex min-h-11 items-start justify-between gap-3 px-4 py-4 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
                <div className="min-w-0">
                  <p className="numeral text-sm font-semibold text-brand">{scan.scan_id}</p>
                  <p className="mt-1 truncate text-sm text-ink">{manufacturerOf(scan)}</p>
                  <p className="numeral mt-1 text-xs text-ink-faint">Captured {capturedOn(scan)}</p>
                </div>
                <VerdictBadge verdict={scan.overall} />
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken text-xs uppercase tracking-[0.12em] text-ink-faint">
              <tr>
                <th scope="col" className="px-5 py-3">Inspection</th>
                <th scope="col" className="px-5 py-3">Captured</th>
                <th scope="col" className="px-5 py-3">Manufacturer</th>
                <th scope="col" className="px-5 py-3">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((scan) => (
                <tr key={scan.scan_id} className="border-t border-line transition-colors hover:bg-brand-soft/50">
                  <td className="numeral px-5 py-4 font-semibold text-brand">
                    <Link href={`/result/${scan.scan_id}`} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{scan.scan_id}</Link>
                  </td>
                  <td className="numeral px-5 py-4 text-ink-muted">{capturedOn(scan)}</td>
                  <td className="px-5 py-4 text-ink">{manufacturerOf(scan)}</td>
                  <td className="px-5 py-4"><VerdictBadge verdict={scan.overall} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {scans.length === 0 && mode !== null && (
          <div className="p-10 text-center">
            <p className="font-semibold text-ink">{allScans.length === 0 ? "No inspections have been filed yet." : "No inspections match these filters."}</p>
            <p className="mt-1 text-sm text-ink-muted">{allScans.length === 0 ? "The first completed inspection appears here with its evidence trail." : "Clear the filters or start a new inspection."}</p>
            <Link href="/capture" className="button-primary mt-5">Start an inspection</Link>
          </div>
        )}
      </section>
    </main>
  );
}
