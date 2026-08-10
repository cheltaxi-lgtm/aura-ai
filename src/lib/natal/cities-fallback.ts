/** Offline fallback for major birth cities (RU/CIS + capitals). */
export type FallbackCity = {
  label: string;
  query: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export const FALLBACK_CITIES: FallbackCity[] = [
  { query: "москва", label: "Moscow, Moscow, Russia", latitude: 55.7558, longitude: 37.6173, timezone: "Europe/Moscow" },
  { query: "moscow", label: "Moscow, Moscow, Russia", latitude: 55.7558, longitude: 37.6173, timezone: "Europe/Moscow" },
  { query: "санкт-петербург", label: "Saint Petersburg, St.-Petersburg, Russia", latitude: 59.9311, longitude: 30.3609, timezone: "Europe/Moscow" },
  { query: "петербург", label: "Saint Petersburg, St.-Petersburg, Russia", latitude: 59.9311, longitude: 30.3609, timezone: "Europe/Moscow" },
  { query: "новосибирск", label: "Novosibirsk, Novosibirsk Oblast, Russia", latitude: 55.0084, longitude: 82.9357, timezone: "Asia/Novosibirsk" },
  { query: "екатеринбург", label: "Yekaterinburg, Sverdlovsk Oblast, Russia", latitude: 56.8389, longitude: 60.6057, timezone: "Asia/Yekaterinburg" },
  { query: "казань", label: "Kazan, Tatarstan, Russia", latitude: 55.7887, longitude: 49.1221, timezone: "Europe/Moscow" },
  { query: "минск", label: "Minsk, Minsk City, Belarus", latitude: 53.9006, longitude: 27.559, timezone: "Europe/Minsk" },
  { query: "алматы", label: "Almaty, Almaty, Kazakhstan", latitude: 43.222, longitude: 76.8512, timezone: "Asia/Almaty" },
  { query: "almaty", label: "Almaty, Almaty, Kazakhstan", latitude: 43.222, longitude: 76.8512, timezone: "Asia/Almaty" },
  { query: "астана", label: "Astana, Astana, Kazakhstan", latitude: 51.1694, longitude: 71.4491, timezone: "Asia/Almaty" },
  { query: "астана нур", label: "Astana, Astana, Kazakhstan", latitude: 51.1694, longitude: 71.4491, timezone: "Asia/Almaty" },
  { query: "нур-султан", label: "Astana, Astana, Kazakhstan", latitude: 51.1694, longitude: 71.4491, timezone: "Asia/Almaty" },
  { query: "ташкент", label: "Tashkent, Tashkent, Uzbekistan", latitude: 41.2995, longitude: 69.2401, timezone: "Asia/Tashkent" },
  { query: "киев", label: "Kyiv, Kyiv City, Ukraine", latitude: 50.4501, longitude: 30.5234, timezone: "Europe/Kyiv" },
  { query: "kyiv", label: "Kyiv, Kyiv City, Ukraine", latitude: 50.4501, longitude: 30.5234, timezone: "Europe/Kyiv" },
  { query: "одесса", label: "Odesa, Odesa Oblast, Ukraine", latitude: 46.4825, longitude: 30.7233, timezone: "Europe/Kyiv" },
  { query: "харьков", label: "Kharkiv, Kharkiv Oblast, Ukraine", latitude: 49.9935, longitude: 36.2304, timezone: "Europe/Kyiv" },
  { query: "баку", label: "Baku, Baku City, Azerbaijan", latitude: 40.4093, longitude: 49.8671, timezone: "Asia/Baku" },
  { query: "ереван", label: "Yerevan, Yerevan, Armenia", latitude: 40.1792, longitude: 44.4991, timezone: "Asia/Yerevan" },
  { query: "тбилиси", label: "Tbilisi, Tbilisi, Georgia", latitude: 41.7151, longitude: 44.8271, timezone: "Asia/Tbilisi" },
  { query: "рига", label: "Riga, Riga, Latvia", latitude: 56.9496, longitude: 24.1052, timezone: "Europe/Riga" },
  { query: "вильнюс", label: "Vilnius, Vilnius County, Lithuania", latitude: 54.6872, longitude: 25.2797, timezone: "Europe/Vilnius" },
  { query: "таллин", label: "Tallinn, Harju County, Estonia", latitude: 59.437, longitude: 24.7536, timezone: "Europe/Tallinn" },
  { query: "лондон", label: "London, England, United Kingdom", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London" },
  { query: "london", label: "London, England, United Kingdom", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London" },
  { query: "berlin", label: "Berlin, Berlin, Germany", latitude: 52.52, longitude: 13.405, timezone: "Europe/Berlin" },
  { query: "берлин", label: "Berlin, Berlin, Germany", latitude: 52.52, longitude: 13.405, timezone: "Europe/Berlin" },
  { query: "potsdam", label: "Potsdam, Brandenburg, Germany", latitude: 52.3989, longitude: 13.0657, timezone: "Europe/Berlin" },
  { query: "потсдам", label: "Potsdam, Brandenburg, Germany", latitude: 52.3989, longitude: 13.0657, timezone: "Europe/Berlin" },
  { query: "paris", label: "Paris, Île-de-France, France", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris" },
  { query: "париж", label: "Paris, Île-de-France, France", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris" },
  { query: "new york", label: "New York, New York, United States", latitude: 40.7128, longitude: -74.006, timezone: "America/New_York" },
  { query: "los angeles", label: "Los Angeles, California, United States", latitude: 34.0522, longitude: -118.2437, timezone: "America/Los_Angeles" },
];

export function searchFallbackCities(query: string, limit = 8): FallbackCity[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = FALLBACK_CITIES.filter(
    (c) => c.query.includes(q) || c.label.toLowerCase().includes(q)
  );
  const unique = new Map<string, FallbackCity>();
  for (const hit of hits) {
    if (!unique.has(hit.label)) unique.set(hit.label, hit);
  }
  return [...unique.values()].slice(0, limit);
}

export function resolveFallbackCity(query: string): FallbackCity | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = FALLBACK_CITIES.find((c) => c.query === q);
  if (exact) return exact;
  const starts = FALLBACK_CITIES.find((c) => c.query.startsWith(q) || q.startsWith(c.query));
  return starts ?? null;
}
