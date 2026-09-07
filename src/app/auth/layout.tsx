import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Вход и регистрация | Zovus",
  description: "Личный кабинет Zovus для сохранения расчётов, раскладов и отчётов.",
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="page-with-site-header">{children}</div>;
}
