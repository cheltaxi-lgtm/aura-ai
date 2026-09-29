import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import { HD_PROFILE_SEO, HD_TYPE_SEO } from "@/lib/human-design/seo-content";
import {
  ALL_CHANNEL_SLUGS,
  ALL_GATE_SLUGS,
  CENTER_SEO_SLUGS,
  centerSeo,
  channelSeo,
} from "@/lib/human-design/seo-entities";
import { GATE_NAMES_RU } from "@/lib/human-design";
import HdTransitToday from "@/components/human-design/HdTransitToday";
import HdTransitWeek from "@/components/human-design/HdTransitWeek";
import HdHubHistory from "@/components/human-design/HdHubHistory";

export const metadata: Metadata = buildSeoMetadata({
  title: "Дизайн Человека — что это: типы, ворота, каналы, расчёт карты",
  description:
    "Дизайн Человека простыми словами: тип энергии, стратегия, внутренний авторитет, профиль, 64 ворота и 36 каналов. Бесплатный расчёт бодиграфа по дате, времени и месту рождения — без регистрации, на точных эфемеридах.",
  path: "/dizayn-cheloveka",
});

const HUB_FAQ = [
  {
    q: "Что такое Дизайн Человека?",
    a: "Система самопознания, соединяющая астрологические расчёты момента рождения, 64 гексаграммы И-Цзина и схему из девяти энергетических центров. Результат — бодиграф: карта вашего типа, стратегии решений, авторитета и профиля.",
  },
  {
    q: "Что нужно для расчёта карты?",
    a: "Дата, время и место рождения. Если время неизвестно, калькулятор построит карту на 12:00 и покажет, какие параметры стабильны в течение дня, а какие зависят от времени.",
  },
  {
    q: "Насколько точен расчёт?",
    a: "Позиции планет считаются по точным эфемеридам (сверено с данными NASA JPL), момент Дизайна — ровно 88° солярной дуги до рождения, лунный узел — истинный. Это соответствует канонической методике расчёта рейв-карт.",
  },
  {
    q: "Расчёт бесплатный?",
    a: "Да: тип, стратегия, авторитет, профиль, определённость, крест и интерактивный бодиграф — бесплатно и без регистрации. Полный письменный разбор с Эвелиной и диалог по карте — платные, после входа.",
  },
  {
    q: "Чем Дизайн Человека отличается от натальной карты?",
    a: "Натальная карта описывает психологию через планеты, знаки и дома. Дизайн Человека — практическая механика: как вам принимать решения (авторитет), куда направлять энергию (тип и стратегия) и какую роль вы играете (профиль). Системы дополняют друг друга.",
  },
] as const;

const PREVIEW = [
  { number: "01", title: "Тип и стратегия", text: "Как вы взаимодействуете с миром и куда направлять свою энергию." },
  { number: "02", title: "Внутренний авторитет", text: "На что опираться, когда принимаете решение." },
  { number: "03", title: "Профиль и бодиграф", text: "Какие темы, центры и каналы проявлены в вашей карте." },
] as const;

function BodygraphArtwork() {
  return (
    <div className="hd-hub-art" aria-hidden="true">
      <div className="hd-hub-art__halo" />
      <svg viewBox="0 0 360 470" role="presentation" focusable="false">
        <g className="hd-hub-art__channels">
          <path d="M180 55 L180 112 L180 168 L180 239 L180 294 L180 357 L180 420" />
          <path d="M180 112 L104 174 L180 239 L256 174 L180 112" />
          <path d="M104 174 L84 296 L180 357 L276 296 L256 174" />
          <path d="M180 239 L84 296 M180 239 L276 296 M104 174 L256 174" />
        </g>
        <g className="hd-hub-art__centers">
          <path d="M180 34 L202 70 L158 70 Z" />
          <path d="M180 91 L203 118 L180 145 L157 118 Z" />
          <path d="M180 150 L204 174 L180 198 L156 174 Z" />
          <path d="M104 151 L128 174 L104 197 L80 174 Z" />
          <path d="M256 151 L280 174 L256 197 L232 174 Z" />
          <path d="M180 211 L206 238 L180 265 L154 238 Z" />
          <path d="M84 269 L110 296 L84 323 L58 296 Z" />
          <path d="M276 269 L302 296 L276 323 L250 296 Z" />
          <path d="M180 329 L207 357 L180 385 L153 357 Z" />
          <path d="M180 396 L204 424 L156 424 Z" />
        </g>
      </svg>
      <span className="hd-hub-art__label">ВАША КАРТА · ВАШ РИТМ</span>
    </div>
  );
}

export default function HumanDesignHubPage() {
  const structuredData = buildForecastStructuredData({
    title: "Дизайн Человека — что это и как работает",
    description:
      "Типы, профили, ворота, каналы и центры Дизайна Человека простыми словами + бесплатный расчёт бодиграфа по точным эфемеридам.",
    path: "/dizayn-cheloveka",
    faq: HUB_FAQ.map((item) => ({ q: item.q, a: item.a })),
  });

  return (
    <SeoPageShell wide breadcrumbs={[{ name: "Zovus", path: "/" }, { name: "Дизайн Человека", path: "/dizayn-cheloveka" }]}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SeoPageTracker goal="hd_hub_view" params={{}} />
      <div className="hd-hub">
        <section className="hd-hub-hero" aria-labelledby="hd-hub-title">
          <div className="hd-hub-hero__copy">
            <p className="hd-hub-eyebrow">Дизайн Человека · Ваш бодиграф</p>
            <h1 id="hd-hub-title">Познакомьтесь со своей <em>внутренней механикой</em></h1>
            <p className="hd-hub-hero__lead">
              Рассчитайте карту по данным рождения и узнайте свой тип, стратегию решений и профиль.
              Начните с главного, а детали изучайте в своём темпе.
            </p>
            <div className="hd-hub-hero__actions">
              <SeoTrackedCta href="/dizayn-cheloveka/rasschitat" trackGoal="hd_calc_start" trackParams={{ from: "hub" }}>
                Рассчитать карту бесплатно <ArrowUpRight size={17} aria-hidden="true" />
              </SeoTrackedCta>
              <a href="#hd-my-charts" className="hd-hub-hero__secondary">Мои карты ↓</a>
            </div>
            <p className="hd-hub-hero__fine">Дата, время и место рождения · Можно без точного времени · Регистрация не нужна</p>
          </div>
          <BodygraphArtwork />
        </section>

        <HdHubHistory />

        <section className="hd-hub-preview" aria-labelledby="hd-preview-title">
          <div className="hd-hub-heading">
            <div>
              <p className="hd-hub-eyebrow">Сначала главное</p>
              <h2 id="hd-preview-title">Что вы узнаете</h2>
              <p>Основная карта и интерактивный бодиграф доступны бесплатно.</p>
            </div>
          </div>
          <div className="hd-hub-preview__grid">
            {PREVIEW.map((item) => (
              <article key={item.number}>
                <span>{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
          <p className="hd-hub-preview__note">Полный письменный разбор и диалог по карте доступны отдельно после входа. Цена показывается до заказа.</p>
        </section>

        <section className="hd-hub-transits" aria-labelledby="hd-transits-title">
          <div className="hd-hub-heading">
            <div>
              <p className="hd-hub-eyebrow">Небесная механика</p>
              <h2 id="hd-transits-title">Транзиты сейчас</h2>
              <p>Текущие активации и неделя впереди — контекст к вашей личной карте.</p>
            </div>
          </div>
          <div className="hd-hub-transits__grid"><HdTransitToday /><HdTransitWeek /></div>
        </section>

        <section className="hd-hub-compat" aria-labelledby="hd-compat-title">
          <div>
            <p className="hd-hub-eyebrow">Два бодиграфа</p>
            <h2 id="hd-compat-title">Как вы влияете друг на друга</h2>
            <p>Сопоставьте карты и увидьте каналы взаимодействия. Изучите <Link href="/dizayn-cheloveka/sovmestimost">совместимость</Link> типов или <Link href="/dizayn-cheloveka/sovmestimost/manifestor-i-proektor">пример Проектора и Манифестора</Link>.</p>
          </div>
          <Link href="/dizayn-cheloveka/sovmestimost/rasschitat" className="hd-hub-compat__link">Рассчитать совместимость <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </section>

        <section className="hd-hub-library" aria-labelledby="hd-library-title">
          <div className="hd-hub-heading">
            <div>
              <p className="hd-hub-eyebrow">После расчёта</p>
              <h2 id="hd-library-title">Библиотека вашей карты</h2>
              <p>Когда увидите свои параметры, здесь можно спокойно разобраться в каждом из них.</p>
            </div>
          </div>
          <div className="hd-hub-library__grid">
            <section aria-labelledby="hd-types-title" className="hd-hub-library__card">
              <span className="hd-hub-library__index">01 / ТИП</span>
              <h3 id="hd-types-title">Пять типов энергии</h3>
              <p>Тип описывает взаимодействие вашей ауры с миром и связанную с ним стратегию.</p>
              <ul>{HD_TYPE_SEO.map((item) => <li key={item.slug}><Link href={`/dizayn-cheloveka/tipy/${item.slug}`}>{item.title} <ArrowUpRight size={14} aria-hidden="true" /></Link></li>)}</ul>
              <Link className="hd-hub-library__all" href="/dizayn-cheloveka/tipy">Все типы →</Link>
            </section>
            <section aria-labelledby="hd-profiles-title" className="hd-hub-library__card">
              <span className="hd-hub-library__index">02 / ПРОФИЛЬ</span>
              <h3 id="hd-profiles-title">Двенадцать профилей</h3>
              <p>Профиль сочетает сознательную и бессознательную линии вашего опыта.</p>
              <ul className="hd-hub-library__compact">{HD_PROFILE_SEO.map((item) => <li key={item.slug}><Link href={`/dizayn-cheloveka/profili/${item.slug}`}>{item.profile}</Link></li>)}</ul>
              <Link className="hd-hub-library__all" href="/dizayn-cheloveka/profili">Все профили →</Link>
            </section>
            <section aria-labelledby="hd-centers-title" className="hd-hub-library__card">
              <span className="hd-hub-library__index">03 / ЦЕНТРЫ</span>
              <h3 id="hd-centers-title">Девять центров</h3>
              <p>Определённые и открытые центры показывают устойчивые и восприимчивые области.</p>
              <ul className="hd-hub-library__compact">{CENTER_SEO_SLUGS.map((slug) => {
                const item = centerSeo(slug);
                return item ? <li key={slug}><Link href={`/dizayn-cheloveka/centry/${slug}`}>{item.name}</Link></li> : null;
              })}</ul>
              <Link className="hd-hub-library__all" href="/dizayn-cheloveka/centry">Все центры →</Link>
            </section>
          </div>
          <div className="hd-hub-library__indexes">
            <details>
              <summary>64 ворот <span>Темы человеческого опыта <ArrowUpRight size={15} aria-hidden="true" /></span></summary>
              <p><Link href="/dizayn-cheloveka/vorota">Открыть справочник ворот</Link></p>
              <ul>{ALL_GATE_SLUGS.map((gate) => <li key={gate}><Link href={`/dizayn-cheloveka/vorota/${gate}`}>{gate} · {GATE_NAMES_RU[Number(gate)]}</Link></li>)}</ul>
            </details>
            <details>
              <summary>36 каналов <span>Связи между центрами <ArrowUpRight size={15} aria-hidden="true" /></span></summary>
              <p><Link href="/dizayn-cheloveka/kanaly">Открыть справочник каналов</Link></p>
              <ul>{ALL_CHANNEL_SLUGS.map((key) => {
                const item = channelSeo(key);
                return item ? <li key={key}><Link href={`/dizayn-cheloveka/kanaly/${key}`}>{key} · {item.name}</Link></li> : null;
              })}</ul>
            </details>
          </div>
        </section>

        <div className="hd-hub-bottom">
          <section aria-labelledby="hd-read-title">
            <p className="hd-hub-eyebrow">Ваш маршрут</p>
            <h2 id="hd-read-title">Как читать свою карту</h2>
            <ol>
              <li><span>01</span> Начните с типа и стратегии — как двигаться с меньшим сопротивлением.</li>
              <li><span>02</span> Посмотрите авторитет — на что опираться в решениях.</li>
              <li><span>03</span> Изучите профиль, затем определённые и открытые центры.</li>
              <li><span>04</span> Вернитесь к бодиграфу позже: не нужно разбирать всё за один раз.</li>
            </ol>
          </section>
          <section aria-labelledby="hd-faq-title">
            <p className="hd-hub-eyebrow">Перед началом</p>
            <h2 id="hd-faq-title">Частые вопросы</h2>
            {HUB_FAQ.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
          </section>
        </div>

        <nav className="hd-hub-related" aria-label="Другие инструменты Zovus">
          <span>Ещё исследовать</span>
          <Link href="/natal-ili-matrica">Натальная карта или матрица судьбы</Link>
          <Link href="/natalnaya-karta">Натальная карта</Link>
          <Link href="/numerology/destiny-matrix">Матрица судьбы</Link>
          <Link href="/photo-rasklad">Таро по фото</Link>
        </nav>
        <div className="hd-hub-final"><SeoTrackedCta href="/dizayn-cheloveka/rasschitat" trackGoal="hd_calc_start" trackParams={{ from: "hub_bottom" }}>Рассчитать свою карту <ArrowUpRight size={17} aria-hidden="true" /></SeoTrackedCta></div>
      </div>
    </SeoPageShell>
  );
}
