/** Shown while a page renders on the server, so the screen is never blank. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="skel h-3 w-40" />
        <div className="skel h-8 w-72 max-w-full" />
        <div className="skel h-4 w-[28rem] max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-card">
            <div className="skel h-3 w-24" />
            <div className="skel h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-line bg-white p-6 shadow-card">
            <div className="skel h-4 w-48" />
            <div className="skel h-3 w-full" />
            <div className="skel h-3 w-5/6" />
            <div className="skel h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
