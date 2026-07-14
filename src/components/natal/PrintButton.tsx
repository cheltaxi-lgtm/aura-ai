"use client";

export default function PrintButton() {
  return <button type="button" onClick={() => window.print()}
    className="print:hidden rounded-lg border border-black/20 px-4 py-2 text-sm">
    Печать / сохранить PDF
  </button>;
}
