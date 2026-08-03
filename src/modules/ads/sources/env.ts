/**
 * Resolve Yandex API credentials for Ads Sources.
 * Accepts both ADS-prefixed names and existing product Metrika env vars.
 */

export function metrikaToken(): string | null {
  return (
    process.env.METRIKA_TOKEN ||
    process.env.YANDEX_METRIKA_OAUTH_TOKEN ||
    null
  );
}

export function metrikaCounterId(): string | null {
  return (
    process.env.METRIKA_COUNTER_ID ||
    process.env.YANDEX_METRIKA_COUNTER_ID ||
    null
  );
}

/** Webmaster often shares the same OAuth app as Metrika/Direct. */
export function webmasterToken(): string | null {
  return (
    process.env.WEBMASTER_TOKEN ||
    process.env.METRIKA_TOKEN ||
    process.env.YANDEX_METRIKA_OAUTH_TOKEN ||
    process.env.ADS_DIRECT_TOKEN ||
    null
  );
}

export function webmasterHostId(): string | null {
  return process.env.WEBMASTER_HOST_ID || "https:zovus.ru:443";
}

export function adsSourceTokenFlags() {
  return {
    ADS_DIRECT_TOKEN: Boolean(process.env.ADS_DIRECT_TOKEN),
    METRIKA_TOKEN: Boolean(metrikaToken()),
    WEBMASTER_TOKEN: Boolean(webmasterToken()),
    WEBMASTER_HOST_ID: Boolean(webmasterHostId()),
    WORDSTAT_TOKEN: Boolean(process.env.WORDSTAT_TOKEN),
    ADS_GOAL_REGISTRATION: Boolean(process.env.ADS_GOAL_REGISTRATION),
  };
}
