import { Suspense } from "react";
import NewCaseForm from "./NewCaseForm";

export default function ProNewCasePage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-gray-400">Загрузка…</p>}>
      <NewCaseForm />
    </Suspense>
  );
}
