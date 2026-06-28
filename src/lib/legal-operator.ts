import { BRAND_NAME, BRAND_URL } from "@/lib/brand";

const CONTACT_EMAIL = "cheldriver@yandex.ru";

/** Реквизиты самозанятого — оператора платформы Zovus (152-ФЗ, оферта, ЗоЗПП). */
export const LEGAL_OPERATOR = {
  /** Полное наименование для юридических документов */
  legalName: "Харитонов Геннадий Викторович",
  /** Краткая форма с указанием статуса */
  displayName: "Самозанятый Харитонов Геннадий Викторович",
  status: "Плательщик налога на профессиональный доход (НПД, самозанятый)",
  inn: "740304275788",
  region: "Челябинская область, Российская Федерация",
  siteName: BRAND_NAME,
  siteUrl: BRAND_URL,
  /** Единый контактный email оператора */
  contactEmail: CONTACT_EMAIL,
  privacyEmail: CONTACT_EMAIL,
  supportEmail: CONTACT_EMAIL,
  claimsEmail: CONTACT_EMAIL,
} as const;

export interface LegalPaymentDetail {
  label: string;
  value: string;
}

/** Банковские реквизиты для возвратов и претензий (ЗоЗПП). */
export const LEGAL_PAYMENT_DETAILS: readonly LegalPaymentDetail[] = [
  { label: "Валюта", value: "Российский рубль (RUB)" },
  { label: "Получатель", value: "ХАРИТОНОВ ГЕННАДИЙ ВИКТОРОВИЧ" },
  { label: "ИНН получателя", value: LEGAL_OPERATOR.inn },
  { label: "Номер счёта", value: "40817810072320135785" },
  { label: "Банк получателя", value: "ЧЕЛЯБИНСКОЕ ОТДЕЛЕНИЕ N8597 ПАО СБЕРБАНК" },
  { label: "БИК", value: "047501602" },
  { label: "Корр. счёт", value: "30101810700000000602" },
] as const;

export function operatorShortLabel(): string {
  return `${LEGAL_OPERATOR.displayName} · ИНН ${LEGAL_OPERATOR.inn}`;
}
