/** Placeholder shell — real cabinet UI lands in S1. Not rendered while module is dark. */

export default function ProStub({ title }: { title: string }) {
  return (
    <main className="mx-auto flex min-h-[50dvh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-2xl text-[#ede6da]">{title}</h1>
      <p className="mt-3 text-sm text-gray-400">Zovus Pro — внутренний контур (S0).</p>
    </main>
  );
}
