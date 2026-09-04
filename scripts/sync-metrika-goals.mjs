#!/usr/bin/env node
/**
 * Sync JS-event goals to Yandex Metrika via Management API.
 * Requires: YANDEX_METRIKA_OAUTH_TOKEN (OAuth with metrika:write)
 * Usage: node scripts/sync-metrika-goals.mjs [--dry-run]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(__dir, "..", ".env.local"));

const doc = JSON.parse(readFileSync(join(__dir, "metrika-goals.json"), "utf8"));
const dryRun = process.argv.includes("--dry-run");
const token = process.env.YANDEX_METRIKA_OAUTH_TOKEN;

const DISPLAY_NAMES = {
  landing_view: "Лендинг — просмотр",
  social_proof_view: "Лендинг — social proof",
  hero_question_started: "Лендинг — вопрос (начало)",
  hero_question_submitted: "Лендинг — вопрос (отправка)",
  guest_spread_started: "Гостевой расклад — начало",
  guest_card_revealed: "Гостевой расклад — карта",
  guest_spread_completed: "Гостевой расклад — завершение",
  registration_gate_view: "Регистрация — gate",
  registration_cta_click: "Регистрация — CTA",
  landing_primary_cta_click: "Лендинг — primary CTA",
  onboarding_started: "Онбординг — начало",
  first_chat_opened: "Первый чат",
  registration_started: "Регистрация — начало",
  registration_account_created: "Регистрация — аккаунт создан",
  registration_completed: "Регистрация — завершение",
  registration_error: "Регистрация — ошибка",
  quick_question_click: "SEO — быстрый вопрос",
  spread_intent_view: "SEO — spread intent view",
  spread_intent_start: "SEO — spread intent start",
  photo_landing_cta_click: "CTA фото-лендинга",
  photo_reading_step: "Фоточтение — шаг воронки",
  ritual_landing_view: "Ритуал — просмотр лендинга",
  ritual_landing_cta_click: "CTA ритуала-лендинга",
  ritual_recommendation_view: "Ритуал — рекомендация view",
  ritual_recommendation_click: "Ритуал — рекомендация click",
  joint_reading_cta_click: "CTA совместного расклада",
  numerology_cta_click: "CTA нумерологии",
  card_meaning_view: "Карта — значение view",
  card_combination_view: "Карта — сочетание view",
  gadanie_hub_view: "Гадание hub — view",
  gadanie_hub_cta_click: "Гадание hub — CTA",
  gadanie_da_net_view: "Да/нет — view",
  gadanie_da_net_cta_click: "Да/нет — CTA",
  runes_hub_view: "Руны hub — view",
  runes_hub_cta_click: "Руны hub — CTA",
  rune_meaning_view: "Руна — значение view",
  rune_meaning_cta_click: "Руна — значение CTA",
  zodiac_compat_view: "Зодиак — совместимость view",
  zodiac_compat_cta_click: "Зодиак — совместимость CTA",
  lenormand_combo_cta: "Ленорман — combo CTA",
  rune_purchase: "Покупка рун (доход)",
  paywall_open: "Paywall / магазин рун — открытие",
  payment_cancelled: "Оплата рун — отмена",
  share_open: "Открытие шеринга",
  share_create_success: "Шеринг — создание OK",
  share_create_fail: "Шеринг — создание fail",
  share_copy_success: "Шеринг — копирование OK",
  share_copy_fail: "Шеринг — копирование fail",
  share_landing_view: "Шеринг лендинг — view",
  share_landing_copy: "Шеринг лендинг — copy",
  share_landing_cta: "Шеринг лендинг — CTA",
  share_channel: "Шеринг — канал",
  rasklady_hub_view: "Расклады hub — view",
  lenormand_hub_view: "Ленорман hub — view",
  taro_hub_view: "Таро hub — view",
  cards_hub_view: "Карты hub — view",
  photo_landing_view: "Фото-лендинг — view",
  ritual_catalog_view: "Каталог обрядов — view",
  ritual_step: "Обряд — шаг воронки",
  numerology_hub_view: "Нумерология hub — view",
  numerology_topic_view: "Нумерология тема — view",
  lenormand_combo_view: "Ленорман сочетание — view",
  matrix_landing_view: "Матрица судьбы — просмотр лендинга",
  matrix_preview_start: "Матрица судьбы — старт расчёта",
  matrix_preview_complete: "Матрица судьбы — расчёт готов",
  natal_landing_view: "Натальная карта — просмотр лендинга",
  natal_landing_cta_click: "Натальная карта — CTA",
  natal_landing_login_click: "Натальная карта — вход",
  prognoz_hub_view: "Прогноз hub — view",
  aura_landing_view: "Аура — лендинг",
  aura_snapshot_start: "Аура — старт снимка",
  aura_snapshot_complete: "Аура — снимок готов",
  aura_auth_cta: "Аура — CTA регистрации",
  aura_guest_claim_complete: "Аура — гостевой claim",
  aura_paid_cta: "Аура — CTA полного разбора",
  aura_seo_cta: "Аура — CTA с SEO-страницы",
  aura_colors_hub_view: "Аура — hub цветов",
  aura_color_view: "Аура — страница цвета",
  aura_chakra_hub_view: "Аура — hub чакр",
  aura_chakra_view: "Аура — страница чакры",
  aura_layers_hub_view: "Аура — hub слоёв",
  aura_layer_view: "Аура — страница слоя",
  aura_intent_view: "Аура — тематическая посадка",
  palm_landing_view: "Ладонь — лендинг",
  palm_snapshot_start: "Ладонь — старт снимка",
  palm_snapshot_complete: "Ладонь — снимок готов",
  palm_auth_cta: "Ладонь — CTA регистрации",
  palm_guest_claim_complete: "Ладонь — гостевой claim",
  palm_paid_cta: "Ладонь — CTA полного разбора",
  palm_seo_cta: "Ладонь — CTA с SEO-страницы",
  palm_lines_hub: "Ладонь — hub линий",
  palm_mounts_hub: "Ладонь — hub холмов",
  palm_shapes_hub: "Ладонь — hub типов рук",
  palm_marks_hub: "Ладонь — hub знаков",
  palm_line_view: "Ладонь — страница линии",
  palm_mount_view: "Ладонь — страница холма",
  palm_shape_view: "Ладонь — страница типа руки",
  palm_mark_view: "Ладонь — страница знака",
  palm_intent_view: "Ладонь — тематическая посадка",
  gadanie_karta_dnya_view: "Карта дня — view",
  gadanie_karta_dnya_cta_click: "Карта дня — CTA",
  gadanie_besplatno_view: "Гадание бесплатно — view",
  gadanie_besplatno_cta_click: "Гадание бесплатно — CTA",
  goroskop_na_segodnya_view: "Гороскоп на сегодня — view",
  goroskop_na_segodnya_cta_click: "Гороскоп на сегодня — CTA",
  life_path_landing_view: "Число пути — view",
  life_path_calc_complete: "Число пути — расчёт",
  life_path_cta_click: "Число пути — CTA",
  lenormand_love_view: "Ленорман любовь — view",
  lenormand_love_cta_click: "Ленорман любовь — CTA",
  runes_love_view: "Руны любовь — view",
  runes_love_cta_click: "Руны любовь — CTA",
  natal_synastry_view: "Синастрия — view",
  natal_synastry_cta_click: "Синастрия — CTA",
  natal_or_matrix_view: "Натал или матрица — view",
  natal_or_matrix_cta_click: "Натал или матрица — CTA",
  personal_year_landing_view: "Личный год — view",
  personal_year_calc_complete: "Личный год — расчёт",
  personal_year_cta_click: "Личный год — CTA",
  numerology_calc_view: "Нумерология калькулятор — view",
  numerology_calc_complete: "Нумерология калькулятор — расчёт",
  numerology_calc_cta_click: "Нумерология калькулятор — CTA",
  gadanie_love_view: "Гадание на любовь — view",
  gadanie_love_cta_click: "Гадание на любовь — CTA",
  lenormand_da_net_view: "Ленорман да/нет — view",
  lenormand_da_net_cta_click: "Ленорман да/нет — CTA",
  minor_arcana_view: "Младшие арканы — view",
  rising_sign_view: "Асцендент — view",
  rising_sign_cta_click: "Асцендент — CTA",
  soul_number_view: "Число души — view",
  soul_number_calc_complete: "Число души — расчёт",
  soul_number_cta_click: "Число души — CTA",
  karmic_tail_view: "Кармический хвост — view",
  karmic_tail_cta_click: "Кармический хвост — CTA",
  money_channel_view: "Канал денег — view",
  money_channel_cta_click: "Канал денег — CTA",
  runes_work_view: "Руны работа — view",
  runes_work_cta_click: "Руны работа — CTA",
  runes_money_view: "Руны деньги — view",
  runes_money_cta_click: "Руны деньги — CTA",
  lenormand_work_view: "Ленорман работа — view",
  lenormand_work_cta_click: "Ленорман работа — CTA",
  gadanie_future_view: "Гадание на будущее — view",
  gadanie_future_cta_click: "Гадание на будущее — CTA",
  three_cards_view: "Три карты — view",
  three_cards_cta_click: "Три карты — CTA",
  aura_free_view: "Аура бесплатно — view",
  aura_free_cta_click: "Аура бесплатно — CTA",
};

function displayName(id) {
  return DISPLAY_NAMES[id] ?? id.replace(/_/g, " ");
}

async function api(path, options = {}) {
  const res = await fetch(`https://api-metrika.yandex.net${path}`, {
    ...options,
    headers: {
      Authorization: `OAuth ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

if (!token) {
  console.error("Set YANDEX_METRIKA_OAUTH_TOKEN (OAuth scope: metrika:write)");
  process.exit(1);
}

const counterId = doc.counterId;
const existing = await api(`/management/v1/counter/${counterId}/goals`);
const byCondition = new Map();
for (const g of existing.goals ?? []) {
  const cond = g.conditions?.[0];
  if (cond?.url) {
    byCondition.set(cond.url, g);
  }
}

let created = 0;
let synced = 0;
let missing = 0;

for (const goal of doc.goals) {
  const id = goal.id;
  if (byCondition.has(id)) {
    const existingGoal = byCondition.get(id);
    if (goal.metrikaGoalId !== existingGoal.id) {
      goal.metrikaGoalId = existingGoal.id;
      synced++;
    }
    console.log(`ok ${id} #${existingGoal.id}`);
    continue;
  }

  missing++;
  const body = {
    goal: {
      name: displayName(id),
      type: "action",
      conditions: [{ type: "exact", url: id }],
    },
  };

  if (dryRun) {
    console.log(`would create ${id}: ${body.goal.name}`);
    continue;
  }

  const result = await api(`/management/v1/counter/${counterId}/goals`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  goal.metrikaGoalId = result.goal.id;
  byCondition.set(id, result.goal);
  created++;
  console.log(`created ${id} #${result.goal.id}`);
  await new Promise((r) => setTimeout(r, 300));
}

if (!dryRun && (created > 0 || synced > 0)) {
  writeFileSync(join(__dir, "metrika-goals.json"), JSON.stringify(doc, null, 2) + "\n");
}

console.log(`\nDone: created=${created}, syncedIds=${synced}, missing=${missing}, total=${doc.goals.length}`);
