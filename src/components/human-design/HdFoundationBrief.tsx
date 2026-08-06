"use client";

import {
  AUTHORITY_NAMES_RU,
  CENTER_NAMES_RU,
  DEFINITION_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
  type HdChart,
  type HdCenterKey,
} from "@/lib/human-design";

/** Free deterministic «Опора» — core mechanics without LLM. */
export default function HdFoundationBrief({ chart }: { chart: HdChart }) {
  const type = TYPE_META[chart.type];
  const openCenters = (
    Object.keys(CENTER_NAMES_RU) as HdCenterKey[]
  ).filter((c) => !chart.definedCenters.includes(c));

  return (
    <div className="hd-foundation">
      <p className="hd-panel__title">Опора · механика карты</p>
      <p className="mt-1.5 text-xs text-white/45">Бесплатно · без языковой модели</p>
      <dl className="hd-foundation__grid">
        <div>
          <dt>Тип</dt>
          <dd>
            <strong>{type.nameRu}</strong>
            <span>Стратегия: {type.strategyRu}</span>
          </dd>
        </div>
        <div>
          <dt>Авторитет</dt>
          <dd>
            <strong>{AUTHORITY_NAMES_RU[chart.authority]}</strong>
            <span>Опора для решений</span>
          </dd>
        </div>
        <div>
          <dt>Подпись</dt>
          <dd>
            <strong>{type.signatureRu}</strong>
            <span>Когда вы «на месте»</span>
          </dd>
        </div>
        <div>
          <dt>Ложное «я»</dt>
          <dd>
            <strong>{type.notSelfRu}</strong>
            <span>Сигнал сойти с пути</span>
          </dd>
        </div>
        <div>
          <dt>Профиль</dt>
          <dd>
            <strong>
              {chart.profile} · {PROFILE_NAMES_RU[chart.profile] ?? chart.profile}
            </strong>
            <span>Роль и паттерны</span>
          </dd>
        </div>
        <div>
          <dt>Определённость</dt>
          <dd>
            <strong>{DEFINITION_NAMES_RU[chart.definition] ?? chart.definition}</strong>
            <span>Как вы связываетесь с другими</span>
          </dd>
        </div>
      </dl>
      <div className="hd-foundation__centers">
        <p>
          <span>Определённые центры</span>
          {chart.definedCenters.length
            ? chart.definedCenters.map((c) => CENTER_NAMES_RU[c]).join(" · ")
            : "нет (открытый бодиграф)"}
        </p>
        <p>
          <span>Открытые центры</span>
          {openCenters.length
            ? openCenters.map((c) => CENTER_NAMES_RU[c]).join(" · ")
            : "нет"}
        </p>
      </div>
    </div>
  );
}
