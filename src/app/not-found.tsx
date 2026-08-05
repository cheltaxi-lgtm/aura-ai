import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <BrandMark size={40} className="mb-4" />
      <h1 className="font-display mb-2 text-3xl font-bold text-white">Страница не найдена</h1>
      <p className="mb-8 max-w-sm text-sm text-gray-400">
        Такого пути нет — возможно, ссылка устарела или была введена с ошибкой.
      </p>
      <Link href="/" className="btn-primary px-8 py-3 text-sm">
        На главную
      </Link>
    </div>
  );
}
