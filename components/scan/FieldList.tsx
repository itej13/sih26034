import type { LabelField } from "@/lib/types";

export function FieldList({ fields }: { fields: LabelField[] }) {
  return (
    <section className="panel p-5">
      <div>
        <p className="eyebrow">Extraction output</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">Extracted declarations</h2>
        <p className="mt-1 text-xs leading-5 text-ink-faint">Read from the label. Nothing here is measured, and nothing here decides a verdict.</p>
      </div>
      <dl className="mt-5 divide-y divide-line">
        {fields.map((field) => (
          <div key={field.key} className="flex items-start justify-between gap-4 py-3 first:pt-0">
            <div className="min-w-0">
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-faint">{field.key.replace("_", " ")}</dt>
              <dd className="mt-1 text-sm leading-6 text-ink">{field.text}</dd>
            </div>
            <span className="numeral shrink-0 text-xs font-semibold text-ink-muted" title="Extraction confidence">
              {(field.confidence * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </dl>
    </section>
  );
}
