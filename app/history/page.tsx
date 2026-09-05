"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Scan } from "@/lib/types";
import { VerdictBadge } from "@/components/scan/VerdictBadge";

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
  const scans = allScans.filter((scan) => (verdict === "ALL" || scan.overall === verdict) && `${scan.scan_id} ${scan.fields.find((field) => field.key === "manufacturer")?.text ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="page-shell"><header className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-200 pb-6"><div><p className="eyebrow">Inspection register</p><h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">Inspection history</h1><p className="mt-2 text-sm text-slate-600">Search completed scans and reopen their evidence trail.</p></div><Link href="/capture" className="button-primary no-print">New inspection</Link></header><section className="panel mt-7 p-5"><div className="grid gap-4 md:grid-cols-[1fr_220px]"><label className="text-sm font-semibold text-slate-700">Search inspections<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Scan ID or manufacturer" className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-blue-800 focus:ring-2 focus:ring-blue-100" /></label><label className="text-sm font-semibold text-slate-700">Verdict<select value={verdict} onChange={(event) => setVerdict(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-blue-800 focus:ring-2 focus:ring-blue-100"><option value="ALL">All verdicts</option><option value="COMPLIANT">Compliant</option><option value="VIOLATION">Violation</option><option value="INDETERMINATE">Indeterminate</option></select></label></div></section><section className="panel mt-5 overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><p className="text-sm font-semibold text-slate-900">{scans.length} inspection{scans.length === 1 ? "" : "s"} found</p><p className="text-xs text-slate-500">{mode === null ? "Loading…" : mode === "fixture" ? "Fixture development data" : mode === "supabase" ? "Filed inspections" : "Register unavailable"}</p></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-5 py-3">Inspection</th><th className="px-5 py-3">Captured</th><th className="px-5 py-3">Manufacturer</th><th className="px-5 py-3">Verdict</th></tr></thead><tbody>{scans.map((scan) => <tr key={scan.scan_id} className="border-t border-slate-100 transition-colors hover:bg-blue-50/40"><td className="px-5 py-4 font-semibold text-blue-900"><Link href={`/result/${scan.scan_id}`} className="focus-visible:outline-2 focus-visible:outline-blue-900">{scan.scan_id}</Link></td><td className="px-5 py-4 text-slate-600">{new Date(scan.captured_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td><td className="px-5 py-4 text-slate-700">{scan.fields.find((field) => field.key === "manufacturer")?.text ?? "—"}</td><td className="px-5 py-4"><VerdictBadge verdict={scan.overall} /></td></tr>)}</tbody></table></div>{scans.length === 0 && mode !== null && <div className="p-10 text-center"><p className="font-semibold text-slate-900">No inspections match these filters.</p><p className="mt-1 text-sm text-slate-600">Clear the filters or start a new inspection.</p></div>}</section></main>;
}
