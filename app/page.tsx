import Link from "next/link";

export default function Home() {
  return (
    <main className="page-shell flex flex-1 items-center">
      <section className="max-w-3xl py-14 sm:py-20">
        <p className="eyebrow">Department of Consumer Affairs · SIH26034</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink sm:text-6xl">Measurements an inspector can stand behind.</h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
          Photograph a package with its calibration card. The system reads declarations, measures numerals in millimetres, and displays the rule-engine verdict with its evidence.
        </p>
        <dl className="mt-9 grid max-w-xl gap-4 sm:grid-cols-3">
          {[
            { term: "Measured", detail: "OpenCV arithmetic on a rectified image — never a model's guess." },
            { term: "With its uncertainty", detail: "Every value carries ± and k = 2; the interval meets the limit." },
            { term: "Under a named law", detail: "A versioned rule pack a human wrote, quoted verbatim." },
          ].map((item) => (
            <div key={item.term} className="border-t-2 border-brand pt-3">
              <dt className="text-sm font-bold text-ink">{item.term}</dt>
              <dd className="mt-1 text-xs leading-5 text-ink-muted">{item.detail}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link className="button-primary" href="/capture">Start an inspection</Link>
          <Link className="button-secondary" href="/result/sc_0142">View demonstration result</Link>
        </div>
      </section>
    </main>
  );
}
