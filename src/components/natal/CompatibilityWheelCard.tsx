import type { ReactNode } from "react";

type Props = {
  title: string;
  toolbar?: ReactNode;
  children: ReactNode;
  status?: ReactNode;
  footer: ReactNode;
};

export default function CompatibilityWheelCard({ title, toolbar, children, status, footer }: Props) {
  return (
    <article className="flex h-full min-h-[36rem] flex-col rounded-2xl border border-amber-300/12 bg-[linear-gradient(180deg,rgba(20,14,32,0.92),rgba(8,5,14,0.94))] p-4 sm:p-5">
      <header className="shrink-0">
        <p className="text-center text-[10px] font-medium uppercase tracking-[0.2em] text-amber-200/60">{title}</p>
        <div className="mt-3 flex min-h-10 items-center justify-center">{toolbar ?? <span className="block h-10" aria-hidden />}</div>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center py-1">{children}</div>
      <div className="mt-2 min-h-14 rounded-xl border border-amber-300/10 bg-black/25 px-3 py-2" aria-live="polite">
        {status}
      </div>
      <footer className="mt-auto shrink-0 space-y-3 pt-2">{footer}</footer>
    </article>
  );
}
