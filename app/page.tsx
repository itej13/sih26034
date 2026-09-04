import Link from "next/link";

export default function Home() {
  return <main className="page-shell flex flex-1 items-center"><section className="max-w-3xl py-20"><p className="eyebrow">Department of Consumer Affairs · SIH26034</p><h1 className="mt-4 text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">Measurements an inspector can stand behind.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Photograph a package with its calibration card. The system reads declarations, measures numerals in millimetres, and displays the rule-engine verdict with its evidence.</p><div className="mt-9 flex flex-wrap gap-3"><Link className="button-primary" href="/capture">Start an inspection</Link><Link className="button-secondary" href="/result/sc_0142">View demonstration result</Link></div></section></main>;
}
