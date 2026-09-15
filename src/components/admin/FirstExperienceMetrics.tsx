"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  CreditCard,
  Gift,
  Info,
  Repeat2,
  Sparkles,
  Users,
} from "lucide-react";
import type { getFirstExperienceAnalytics } from "@/lib/first-experience-analytics";

type AnalyticsData = NonNullable<Awaited<ReturnType<typeof getFirstExperienceAnalytics>>>;
type Cohort = AnalyticsData["cohorts"][number];

const number = new Intl.NumberFormat("ru-RU");

const FUNNEL_STAGES = [
  { event: "bonus_granted", label: "Получили бонус", hint: "Старт пути" },
  { event: "bonus_spent", label: "Использовали бонус", hint: "Попробовали продукт" },
  { event: "first_result", label: "Получили результат", hint: "Первая ценность" },
  { event: "continuation_shown", label: "Увидели продолжение", hint: "Коммерческое предложение" },
  { event: "payment_started", label: "Начали оплату", hint: "Высокий интерес" },
  { event: "first_topup", label: "Впервые оплатили", hint: "Новый плательщик" },
] as const;

const ENGAGEMENT_EVENTS = [
  { event: "continuation_selected", label: "Выбрали продолжение" },
  { event: "insight_saved", label: "Сохранили вывод" },
  { event: "step_saved", label: "Выбрали следующий шаг" },
  { event: "changes_saved", label: "Отметили изменения" },
] as const;

const GUEST_REGISTRATION_STAGES = [
  { event: "receipt_issued", label: "Сохранили расклад" },
  { event: "auth_started", label: "Начали регистрацию" },
  { event: "account_created", label: "Создали аккаунт" },
  { event: "claim_succeeded", label: "Привязали расклад" },
] as const;

export function formatBonusVersion(version: string) {
  if (version === "starter-100-v1") return "Бонус 100 рун";
  if (version === "legacy-no-starter-grant") return "Без стартового бонуса";
  if (version === "legacy") return "Старый сценарий";
  return version.replaceAll("-", " ");
}

export function formatCohortDate(day: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${day}T00:00:00Z`))
    .replace(" г.", "");
}

function maturityDate(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(date)
    .replace(" г.", "");
}

function percent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1).replace(".0", "")}%`;
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "gold",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "gold" | "emerald" | "ivory";
}) {
  const tones = {
    gold: "border-aura-gold/25 bg-aura-gold/[0.07] text-aura-champagne",
    emerald: "border-aura-emerald/25 bg-aura-emerald/[0.07] text-aura-emerald",
    ivory: "border-white/10 bg-white/[0.035] text-aura-ivory",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/60">{label}</p>
        <span className="opacity-80">{icon}</span>
      </div>
      <p className="mt-4 font-display text-3xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/60">{detail}</p>
    </div>
  );
}

function ConversionCell({ cohort, windowDays }: { cohort: Cohort; windowDays: 7 | 30 }) {
  const eligible = windowDays === 7 ? cohort.eligible7 : cohort.eligible30;
  const paid = windowDays === 7 ? cohort.paid7 : cohort.paid30;
  const rate = windowDays === 7 ? cohort.firstPayment7 : cohort.firstPayment30;
  if (eligible === 0) {
    return (
      <div>
        <span className="inline-flex rounded-full border border-aura-gold/20 bg-aura-gold/[0.07] px-2.5 py-1 text-xs text-aura-champagne">
          Формируется
        </span>
        <p className="mt-1.5 text-[11px] text-white/55">Итог после {maturityDate(cohort.day, windowDays)}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="font-semibold tabular-nums text-white">{percent(rate)}</p>
      <p className="mt-0.5 text-xs text-white/55">{paid} из {eligible} аккаунтов</p>
    </div>
  );
}

export default function FirstExperienceMetrics({data}:{data:AnalyticsData|{unavailable:true}|null|undefined}) {
  const [expanded, setExpanded] = useState(false);
  if(!data)return null;
  if("unavailable" in data)return <p className="mt-6 text-white/60">Данные первого опыта временно недоступны.</p>;

  const events = new Map(data.events.map(item => [item.event, item.count]));
  const eventCount = (event: string) => events.get(event) ?? 0;
  const funnel = new Map(data.funnel.map(item => [item.event, item.count]));
  const funnelCount = (event: string) => funnel.get(event) ?? 0;
  const bonusGranted = funnelCount("bonus_granted");
  const bonusSpent = funnelCount("bonus_spent");
  const guestFunnel = new Map(data.guestRegistration.funnel.map(item => [item.event, item.count]));
  const guestFunnelCount = (event: string) => guestFunnel.get(event) ?? 0;
  const guestDiagnostics = new Map(data.guestRegistration.diagnostics.map(item => [item.event, item.count]));
  const guestReceipts = guestFunnelCount("receipt_issued");
  const visibleCohorts = expanded ? data.cohorts : data.cohorts.slice(0, 12);
  const cost = data.freeGenerationCost;
  const costStatus = cost.tracked + cost.untracked === 0
    ? { label: "Генераций пока нет", classes: "border-white/10 bg-white/[0.035] text-white/50" }
    : cost.untracked > 0
      ? { label: "Данные частичные", classes: "border-amber-300/20 bg-amber-300/[0.06] text-amber-200" }
      : { label: "Учтено полностью", classes: "border-aura-emerald/20 bg-aura-emerald/[0.06] text-aura-emerald" };

  return (
    <section className="relative mt-8 overflow-hidden rounded-[28px] border border-aura-gold/20 bg-[#100e0c]/95 p-4 shadow-lux sm:p-6 lg:p-7">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-aura-gold/[0.06] blur-3xl" />

      <div className="relative flex flex-col gap-4 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-lux text-aura-gold">Путь нового пользователя</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">Первый опыт и оплата</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50">
            Показывает, сколько реальных пользователей проходят путь от подарка до первой и повторной покупки.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-white/55">
          <Users className="h-3.5 w-3.5 text-aura-champagne" />
          {number.format(data.summary.registrations)} аккаунтов в когортах
        </div>
      </div>

      <div className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Gift className="h-5 w-5" />}
          label="Получили подарок"
          value={number.format(bonusGranted)}
          detail="уникальных пользователей получили стартовый бонус"
        />
        <MetricCard
          icon={<Sparkles className="h-5 w-5" />}
          label="Попробовали продукт"
          value={bonusGranted > 0 ? percent(bonusSpent / bonusGranted) : "—"}
          detail={`${number.format(bonusSpent)} из ${number.format(bonusGranted)} использовали бонус`}
          tone="ivory"
        />
        <MetricCard
          icon={<CreditCard className="h-5 w-5" />}
          label="Оплатили за 7 дней"
          value={percent(data.summary.firstPayment7)}
          detail={data.summary.eligible7 > 0 ? `${data.summary.paid7} из ${data.summary.eligible7} аккаунтов с полными 7 днями` : "Пока нет когорт с полными 7 днями"}
          tone="emerald"
        />
        <MetricCard
          icon={<Repeat2 className="h-5 w-5" />}
          label="Купили повторно"
          value={percent(data.summary.repeatPayment)}
          detail={data.summary.payers > 0 ? `${data.summary.repeatPayers} из ${data.summary.payers} плательщиков вернулись` : "Повторные покупки появятся после первых оплат"}
          tone="gold"
        />
      </div>

      <div className="relative mt-8 rounded-2xl border border-aura-gold/15 bg-black/20 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold text-white">Гостевой расклад → регистрация</h3>
            <p className="mt-1 text-xs text-white/55">
              Серверные данные за {data.guestRegistration.days} дней · этапы только в правильной последовательности
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-white/55">
            <span className="rounded-full border border-white/10 px-3 py-1.5">
              Повтор заблокирован: {number.format(guestDiagnostics.get("receipt_reused") ?? 0)}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1.5">
              Ошибка привязки: {number.format(guestDiagnostics.get("claim_failed") ?? 0)}
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {GUEST_REGISTRATION_STAGES.map((stage, index) => {
            const count = guestFunnelCount(stage.event);
            const previous = index === 0 ? null : guestFunnelCount(GUEST_REGISTRATION_STAGES[index - 1].event);
            const conversion = previous && previous > 0 ? count / previous : null;
            const totalConversion = guestReceipts > 0 ? count / guestReceipts : null;
            return (
              <div key={stage.event} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold tracking-[0.18em] text-aura-gold/70">ШАГ {index + 1}</span>
                  <span className="font-display text-2xl font-semibold tabular-nums text-white">{number.format(count)}</span>
                </div>
                <p className="mt-3 text-sm font-medium text-white/85">{stage.label}</p>
                <p className="mt-1 text-[11px] text-white/55">
                  {index === 0
                    ? "Сервер выдал уникальный чек"
                    : conversion === null
                      ? "Пока нет основы для расчёта"
                      : `${percent(conversion)} от прошлого шага · ${percent(totalConversion)} от раскладов`}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold text-white">Воронка первого опыта</h3>
            <p className="mt-1 text-xs text-white/55">Когорты последних 90 дней · процент относительно предыдущего этапа</p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-white/55">Тестовые аккаунты исключены</span>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {FUNNEL_STAGES.map((stage, index) => {
            const count = funnelCount(stage.event);
            const previous = index === 0 ? null : funnelCount(FUNNEL_STAGES[index - 1].event);
            const conversion = previous && previous > 0 ? count / previous : null;
            const width = bonusGranted > 0 ? Math.min(100, count / bonusGranted * 100) : 0;
            return (
              <div key={stage.event} className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold tracking-[0.18em] text-aura-gold/70">ШАГ {index + 1}</span>
                  <span className="font-display text-2xl font-semibold tabular-nums text-white">{number.format(count)}</span>
                </div>
                <p className="mt-3 text-sm font-medium text-white/85">{stage.label}</p>
                <p className="mt-1 min-h-8 text-[11px] leading-relaxed text-white/55">
                  {index === 0 ? stage.hint : conversion === null ? "Пока нет основы для расчёта" : `${percent(conversion)} от прошлого шага`}
                </p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-gradient-to-r from-aura-gold to-aura-champagne" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/15">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-5">
            <div>
              <h3 className="font-display text-lg font-semibold text-white">Конверсия по датам регистрации</h3>
              <p className="mt-1 text-xs text-white/55">Последние 90 дней · сравнивайте только завершённые периоды</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/55">Оплата за 30 дней</p>
              <p className="mt-0.5 font-semibold tabular-nums text-aura-champagne">{percent(data.summary.firstPayment30)}</p>
            </div>
          </div>
          {visibleCohorts.length ? (
            <>
            <div className="space-y-3 p-3 md:hidden">
              {visibleCohorts.map(row => (
                <article key={`mobile:${row.day}:${row.version}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] pb-3">
                    <div>
                      <p className="font-display text-lg font-semibold text-white">{formatCohortDate(row.day)}</p>
                      <span className="mt-1.5 inline-flex rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-xs text-white/60">{formatBonusVersion(row.version)}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-white/55">Аккаунты</p>
                      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-white">{row.users}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4">
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">Оплата за 7 дней</p>
                      <ConversionCell cohort={row} windowDays={7} />
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">Оплата за 30 дней</p>
                      <ConversionCell cohort={row} windowDays={30} />
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">Повторная покупка</p>
                      {row.payers > 0 ? <><p className="font-semibold tabular-nums text-white">{percent(row.repeatPayment)}</p><p className="mt-0.5 text-xs text-white/55">{row.repeatPayers} из {row.payers} плательщиков</p></> : <span className="text-xs text-white/55">Ещё нет плательщиков</span>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block" role="region" aria-label="Конверсия по когортам регистрации" tabIndex={0}>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[11px] font-semibold uppercase tracking-[0.13em] text-white/55">
                    <th className="px-5 py-3 font-medium">Регистрация</th>
                    <th className="px-4 py-3 font-medium">Условия старта</th>
                    <th className="px-4 py-3 font-medium">Аккаунты</th>
                    <th className="px-4 py-3 font-medium">Оплата за 7 дней</th>
                    <th className="px-4 py-3 font-medium">Оплата за 30 дней</th>
                    <th className="px-4 py-3 font-medium">Повторная покупка</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCohorts.map(row => (
                    <tr key={`${row.day}:${row.version}`} className="border-b border-white/[0.045] last:border-0 hover:bg-white/[0.025]">
                      <td className="whitespace-nowrap px-5 py-4 font-medium text-white/80">{formatCohortDate(row.day)}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-xs text-white/55">{formatBonusVersion(row.version)}</span>
                      </td>
                      <td className="px-4 py-4 font-semibold tabular-nums text-white">{row.users}</td>
                      <td className="px-4 py-4"><ConversionCell cohort={row} windowDays={7} /></td>
                      <td className="px-4 py-4"><ConversionCell cohort={row} windowDays={30} /></td>
                      <td className="px-4 py-4">
                        {row.payers > 0 ? <><p className="font-semibold tabular-nums text-white">{percent(row.repeatPayment)}</p><p className="mt-0.5 text-xs text-white/55">{row.repeatPayers} из {row.payers} плательщиков</p></> : <span className="text-xs text-white/55">Ещё нет плательщиков</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          ) : <p className="px-5 py-10 text-center text-sm text-white/40">Когорты начнут формироваться после новых регистраций.</p>}
          {data.cohorts.length > 12 && (
            <button type="button" onClick={() => setExpanded(value => !value)} className="flex w-full items-center justify-center gap-2 border-t border-white/[0.07] px-4 py-3 text-xs text-aura-champagne hover:bg-white/[0.025]">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "Показать только последние 12" : `Показать все когорты · ${data.cohorts.length}`}
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/55">Расходы на подарки</p>
                <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-white">{cost.knownRub === null ? "—" : `${cost.knownRub.toFixed(2)} ₽`}</p>
              </div>
              <CircleDollarSign className="h-5 w-5 text-aura-gold" />
            </div>
            <span className={`mt-4 inline-flex rounded-full border px-2.5 py-1 text-[11px] ${costStatus.classes}`}>{costStatus.label}</span>
            <p className="mt-3 text-xs leading-relaxed text-white/55">
              За последние 90 дней: {cost.tracked + cost.untracked} бесплатных генераций — {cost.tracked} со стоимостью, {cost.untracked} без неё.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/55">Действия после результата</p>
            <div className="mt-3 divide-y divide-white/[0.06]">
              {ENGAGEMENT_EVENTS.map(item => (
                <div key={item.event} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <span className="text-white/60">{item.label}</span>
                  <span className="font-semibold tabular-nums text-white/85">{number.format(eventCount(item.event))}</span>
                </div>
              ))}
            </div>
          </div>

          <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-white/60">
              <Info className="h-4 w-4 text-aura-gold" />
              Как считаются показатели
              <ChevronDown className="ml-auto h-3.5 w-3.5 group-open:rotate-180 motion-reduce:transform-none" />
            </summary>
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-white/55">
              <p>{data.definitions.firstPayment}</p>
              <p>{data.definitions.repeatPayment}</p>
              <p>{data.definitions.freeCost}</p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
