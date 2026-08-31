import { redirect } from "next/navigation";

/**
 * Дневник как отдельный раздел закрыт: автосаммари сеансов больше не
 * генерируются, личная поверхность — История и Память в кабинете.
 * Старые записи остаются в БД и доступны через /api/diary (privacy).
 */
export default function DiaryPage() {
  redirect("/cabinet?tab=history");
}
