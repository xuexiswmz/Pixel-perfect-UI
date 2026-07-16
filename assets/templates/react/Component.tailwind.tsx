export default function __COMPONENT_NAME__() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16" aria-labelledby="__ID__-title">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">New module</p>
        <h2 id="__ID__-title" className="mt-3 text-3xl font-semibold text-slate-950">
          __TITLE__
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          Replace this copy with product-specific content and supporting details.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <a className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white" href="#">
            Primary action
          </a>
          <a className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-900" href="#">
            Secondary action
          </a>
        </div>
      </div>
    </section>
  );
}
