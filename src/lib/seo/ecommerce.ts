"use client";

/**
 * Yandex Metrika "Электронная коммерция" reads a `dataLayer` array (name configured
 * in Метрика → Настройки → Счётчик → Электронная коммерция) using the classic
 * Google Analytics Enhanced Ecommerce push format: { ecommerce: { <action>: {...} } }.
 * https://yandex.ru/support/metrica/data/e-commerce.html
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

export type EcommerceProduct = {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  category?: string;
};

function pushDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  } catch {
    /* analytics optional */
  }
}

/** Fires when a user opens the shop/pricing list and sees available items ("detail"). */
export function pushEcommerceDetail(products: EcommerceProduct[]): void {
  if (!products.length) return;
  pushDataLayer({
    ecommerce: {
      currencyCode: "RUB",
      detail: {
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          ...(p.category ? { category: p.category } : {}),
        })),
      },
    },
  });
}

/** Fires when a user starts a purchase (clicks "Купить" → redirected to checkout, "add"). */
export function pushEcommerceAdd(product: EcommerceProduct): void {
  pushDataLayer({
    ecommerce: {
      currencyCode: "RUB",
      add: {
        products: [
          {
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: product.quantity ?? 1,
            ...(product.category ? { category: product.category } : {}),
          },
        ],
      },
    },
  });
}

/** Fires once payment is confirmed — feeds Metrika's revenue/ecommerce reports ("purchase"). */
export function pushEcommercePurchase(params: {
  paymentId: string;
  amountRub: number;
  product: EcommerceProduct;
}): void {
  if (!Number.isFinite(params.amountRub)) return;
  pushDataLayer({
    ecommerce: {
      currencyCode: "RUB",
      purchase: {
        actionField: {
          id: params.paymentId,
          revenue: params.amountRub,
        },
        products: [
          {
            id: params.product.id,
            name: params.product.name,
            price: params.product.price,
            quantity: params.product.quantity ?? 1,
            ...(params.product.category ? { category: params.product.category } : {}),
          },
        ],
      },
    },
  });
}
