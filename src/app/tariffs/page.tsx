import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Gift, ShoppingBag, Sparkles } from "lucide-react";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import ShopAction from "@/components/tariffs/ShopAction";
import { ensureDb, query } from "@/lib/db";
import { getRuneSettings } from "@/lib/rune-settings";
import { TARIFF_GROUPS } from "@/lib/tariff-catalog";
import { RITUAL_TYPES, RITUAL_TYPE_KEYS } from "@/lib/ritual-config";
import { RITUAL_PAGE_SLUGS } from "@/lib/ritual-recommendations";
import { getRitualSettings, isRitualCatalogEnabled, isRitualTypeEnabled, ritualCostFromSettings } from "@/lib/ritual-settings";
import { mergeSpreadSettingsFromFeatures } from "@/lib/spread-settings";
import { intentionSpreadPriceRange } from "@/lib/tariff-pricing";
import { MIN_CUSTOM_RUNE_PURCHASE_RUB, MAX_CUSTOM_RUNE_PURCHASE_RUB } from "@/lib/rune-purchase-constants";
import {
  isAuraReadingEnabled, isHumanDesignEnabled, isJointReadingEnabled,
  isNatalChartEnabled, isPalmReadingEnabled, isPhotoReadingEnabled, getSetting,
} from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Тарифы и магазин рун",
  description: "Полный каталог услуг Zovus: расклады Таро, матрица судьбы, астрология, Дизайн Человека и цены магазина рун.",
  alternates: { canonical: "/tariffs" },
};

type RunePackage = { id: string; name: string; runes: number; price_rub: number; bonus_runes: number; is_popular: boolean };
const RUB = new Intl.NumberFormat("ru-RU");

async function loadPackages(): Promise<RunePackage[] | null> {
  try {
    if (!(await ensureDb())) return null;
    const { rows } = await query<RunePackage>("SELECT id, name, runes, price_rub, bonus_runes, is_popular FROM rune_packages ORDER BY sort_order ASC");
    return rows;
  } catch (error) {
    console.warn("[tariffs] packages unavailable:", error);
    return null;
  }
}

export default async function TariffsPage() {
  const [settings, packages, natal, design, joint, photo, aura, palm, tts, rituals, features] = await Promise.all([
    getRuneSettings(), loadPackages(), isNatalChartEnabled(), isHumanDesignEnabled(),
    isJointReadingEnabled(), isPhotoReadingEnabled(), isAuraReadingEnabled(), isPalmReadingEnabled(), getSetting("tts"), getRitualSettings(), getSetting("features"),
  ]);
  const hidden = new Set([
    ...(!joint ? ["JOINT_READING"] : []),
    ...(!photo ? ["VISION_ANALYSIS"] : []),
    ...(!natal ? ["NATAL_READING", "FORECAST_REPORT", "SYNASTRY_REPORT"] : []),
    ...(!design ? ["HD_REPORT", "HD_COMPOSITE_REPORT", "HD_ASK"] : []),
    ...(!aura ? ["AURA_READING"] : []),
    ...(!palm ? ["PALM_READING"] : []),
    ...(!tts.enabled ? ["VOICE_TTS"] : []),
  ]);
  const spreadSettings = mergeSpreadSettingsFromFeatures(features as Record<string, unknown>);
  const spreadRange = intentionSpreadPriceRange(settings.costs.INTENTION_SPREAD, spreadSettings);
  const spreadMin = spreadRange?.min ?? 0;
  const spreadMax = spreadRange?.max ?? 0;
  const groups = TARIFF_GROUPS.map((group) => ({ ...group, services: group.services.filter((service) => !hidden.has(service.action) && (service.action !== "INTENTION_SPREAD" || spreadRange !== null)) })).filter((group) => group.services.length > 0);
  const activeRituals = isRitualCatalogEnabled(rituals) ? RITUAL_TYPE_KEYS.filter((type) => isRitualTypeEnabled(rituals, type)) : [];

  return <SeoPageShell wide breadcrumbs={[{ name: "Zovus", path: "/" }, { name: "Тарифы и магазин", path: "/tariffs" }]}><div className="tariffs-page">
    <div className="relative overflow-hidden rounded-[2rem] border border-amber-200/15 bg-[radial-gradient(circle_at_80%_0%,rgba(180,127,47,0.20),transparent_40%),linear-gradient(145deg,#1e1715,#0b0a0b)] px-6 py-9 sm:px-10 sm:py-12">
      <div className="absolute -right-9 top-0 select-none text-[14rem] leading-none text-amber-200/[0.035]" aria-hidden>ᚢ</div>
      <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300"><ShoppingBag size={14} /> Zovus · тарифы</p>
      <h1 className="relative mt-5 max-w-2xl font-display text-4xl font-semibold leading-tight text-white sm:text-5xl">Всё о стоимости — <span className="text-amber-200">до выбора услуги</span></h1>
      <p className="relative mt-5 max-w-2xl text-base leading-7 text-white/70">Смотрите, что входит в каждый разбор, сколько рун он стоит и по какой цене можно пополнить баланс. Списание за услугу происходит только при её заказе.</p>
      <div className="relative mt-7 flex flex-wrap gap-3"><a href="#services" className="btn-luxe btn-luxe--md btn-luxe--gold inline-flex items-center gap-2">Смотреть услуги <ArrowRight size={16} /></a><a href="#shop" className="btn-luxe btn-luxe--md btn-luxe--ghost inline-flex items-center gap-2">Магазин рун</a></div>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><Gift className="text-amber-300" size={21} /><p className="mt-3 font-semibold">При регистрации</p><p className="mt-1 text-sm leading-6 text-white/60">{settings.starterRunes} ᚢ на стартовом балансе</p></div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><Sparkles className="text-amber-300" size={21} /><p className="mt-3 font-semibold">Каждый день</p><p className="mt-1 text-sm leading-6 text-white/60">Один расклад на сутки бесплатно</p></div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><Check className="text-amber-300" size={21} /><p className="mt-3 font-semibold">В сеансе</p><p className="mt-1 text-sm leading-6 text-white/60">{settings.freeQuestions} вопроса мастеру бесплатно</p></div>
    </div>
    <section id="services" className="scroll-mt-28 pt-16">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Каталог</p><h2 className="mt-2 font-display text-3xl">Услуги и цены</h2></div><a href="#shop" className="text-sm text-amber-200 underline decoration-amber-200/40 underline-offset-4 hover:text-white">Как купить руны ↓</a></div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">Цена услуги указана в рунах (ᚢ). Перевод в рубли ниже — ориентир по базовому курсу {settings.rubPerRune} ₽/ᚢ; фактическая стоимость пополнения зависит от выбранного пакета.</p>
      {!settings.enabled ? <p className="mt-6 rounded-xl border border-amber-400/20 p-4 text-white/70">Платные услуги временно недоступны. Цены появятся после открытия магазина.</p> : null}
      {settings.enabled ? groups.map((group) => <div id={group.id} key={group.id} className="scroll-mt-28 mt-11">
        <h3 className="font-display text-2xl text-amber-100">{group.title}</h3><p className="mt-1 text-sm text-white/55">{group.description}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{group.services.map((service) => {
          const cost = settings.costs[service.action];
          const variable = service.action === "INTENTION_SPREAD";
          const firstPhoto = service.action === "AURA_READING" || service.action === "PALM_READING";
          const firstPhotoCost = firstPhoto ? Math.max(1, Math.round(cost * 0.5)) : cost;
          const costText = variable && spreadMin !== spreadMax ? `${spreadMin}–${spreadMax}` : `${variable ? spreadMin : firstPhotoCost}`;
          const rubText = variable && spreadMin !== spreadMax ? `${RUB.format(Math.round(spreadMin * settings.rubPerRune))}–${RUB.format(Math.round(spreadMax * settings.rubPerRune))}` : RUB.format(Math.round((variable ? spreadMin : firstPhotoCost) * settings.rubPerRune));
          const unit = service.action === "VOICE_TTS";
          return <article key={service.action} className="flex flex-col rounded-2xl border border-white/10 bg-[#151314] p-5 hover:border-amber-200/25 sm:p-6">
            <div className="flex items-start justify-between gap-3"><h4 className="font-display text-lg font-semibold leading-snug">{service.title}</h4><span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-sm font-bold text-amber-200">{unit || firstPhoto ? "от " : ""}{costText} ᚢ{unit ? " / 2 000 зн." : ""}</span></div>
            <p className="mt-3 text-sm leading-6 text-white/65">{service.description}</p><p className="mt-3 text-xs leading-5 text-white/50"><span className="text-white/75">Входит:</span> {service.includes}</p>
            {service.priceNote ? <p className="mt-2 text-xs leading-5 text-amber-200/75">{service.priceNote}</p> : null}
            {firstPhoto ? <p className="mt-2 text-xs leading-5 text-amber-200/75">Первый разбор со скидкой: {firstPhotoCost} ᚢ; следующие: {cost} ᚢ</p> : null}
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs"><span className="text-white/45">≈ {unit || firstPhoto ? "от " : ""}{rubText} ₽ по базовому курсу</span><Link href={service.href} className="shrink-0 text-amber-200 hover:text-white">Подробнее →</Link></div>
          </article>;
        })}</div>
      </div>) : null}
      {settings.enabled && activeRituals.length > 0 ? <div id="rituals" className="scroll-mt-28 mt-11">
        <h3 className="font-display text-2xl text-amber-100">Обряды</h3><p className="mt-1 text-sm text-white/55">Персональная практика с мастером: пять позиций расклада, план действий и сохранение в кабинете.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{activeRituals.map((type) => {
          const ritual = RITUAL_TYPES[type];
          const cost = ritualCostFromSettings(rituals, type);
          return <article key={type} className="flex flex-col rounded-2xl border border-white/10 bg-[#151314] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3"><h4 className="font-display text-lg font-semibold">{ritual.emoji} {ritual.label}</h4><span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-sm font-bold text-amber-200">{cost} ᚢ</span></div>
            <p className="mt-3 text-sm leading-6 text-white/65">{ritual.desc}</p><p className="mt-3 text-xs leading-5 text-white/50"><span className="text-white/75">Входит:</span> персональный обряд, расклад и сохранённый результат</p>
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs"><span className="text-white/45">≈ {RUB.format(Math.round(cost * settings.rubPerRune))} ₽ по базовому курсу</span><Link href={`/obryady/${RITUAL_PAGE_SLUGS[type]}`} className="shrink-0 text-amber-200 hover:text-white">Подробнее →</Link></div>
          </article>;
        })}</div>
      </div> : null}
    </section>
    <section id="shop" className="scroll-mt-28 pt-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Пополнение</p><h2 className="mt-2 font-display text-3xl">Магазин рун</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">Покупка пополняет единый баланс. Руны не сгорают. Указана итоговая цена пакета в рублях; бонусные руны уже включены в общий объём.</p>
      {settings.enabled && packages && packages.length > 0 ? <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{packages.map((pkg) => <div key={pkg.id} className={`flex flex-col rounded-2xl border p-5 ${pkg.is_popular ? "border-amber-300/55 bg-amber-300/[0.08]" : "border-white/10 bg-white/[0.035]"}`}>
        <div className="flex min-h-6 items-center justify-between gap-2"><p className="font-semibold">{pkg.name}</p>{pkg.is_popular ? <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#21170c]">Популярный</span> : null}</div>
        <p className="mt-5 font-display text-3xl text-amber-100">{RUB.format(pkg.runes + pkg.bonus_runes)} <span className="text-xl">ᚢ</span></p><p className="mt-1 min-h-5 text-xs text-white/50">{pkg.bonus_runes > 0 ? `${RUB.format(pkg.runes)} + ${RUB.format(pkg.bonus_runes)} бонусных` : `${RUB.format(pkg.runes)} рун`}</p>
        <p className="mt-5 border-t border-white/10 pt-4 text-xl font-semibold">{RUB.format(pkg.price_rub)} ₽</p><ShopAction label="Выбрать пакет" packageId={pkg.id} className="btn-luxe btn-luxe--sm btn-luxe--gold mt-4 inline-flex justify-center" />
      </div>)}</div> : <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.035] p-5 text-sm text-white/60">Сейчас пакеты недоступны. Попробуйте открыть магазин позже.</p>}
      {settings.enabled && packages && packages.length > 0 ? <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5 sm:flex sm:items-center sm:justify-between sm:gap-6"><div><h3 className="font-display text-lg">Нужна другая сумма?</h3><p className="mt-1 text-sm leading-6 text-white/60">В магазине можно выбрать от {RUB.format(MIN_CUSTOM_RUNE_PURCHASE_RUB)} до {RUB.format(MAX_CUSTOM_RUNE_PURCHASE_RUB)} ₽. Руны рассчитываются по курсу {settings.rubPerRune} ₽/ᚢ с округлением вниз; точное число увидите до оплаты.</p></div><ShopAction className="btn-luxe btn-luxe--md btn-luxe--gold mt-4 inline-flex shrink-0 justify-center sm:mt-0" label="Открыть магазин" /></div> : null}
      <p className="mt-5 text-xs leading-5 text-white/45">Оплата проходит через ЮKassa. В выбранной услуге перед подтверждением показывается итоговое списание рун; доступный баланс учитывается автоматически.</p>
    </section>
  </div></SeoPageShell>;
}
