// Shaurya. Reads from lib/fixtures until Dhruv's search lands on Day 3.
import { allScans } from "@/lib/fixtures";

export default function HistoryPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">History</h1>
      <ul className="mt-6 space-y-2">
        {allScans.map((s) => (
          <li key={s.scan_id} className="rounded border p-3 text-sm">
            <a href={`/result/${s.scan_id}`}>
              {s.scan_id} — {s.overall} — {s.captured_at}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
