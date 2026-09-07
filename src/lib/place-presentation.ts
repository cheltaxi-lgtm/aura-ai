type PlaceLike = { label: string; latitude: number; longitude: number };

const COUNTRY_LABELS: Record<string, string> = {
  RU: "Россия",
  US: "США",
  BY: "Беларусь",
  KZ: "Казахстан",
  UA: "Украина",
};

const regionNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["ru"], { type: "region" })
  : null;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

export function formatBirthPlaceLabel(label: string): string {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  const last = parts.at(-1)?.toUpperCase() ?? "";
  const country = COUNTRY_LABELS[last]
    ?? (/^[A-Z]{2}$/.test(last) ? regionNames?.of(last) : null);
  if (country && country !== last) parts[parts.length - 1] = country;
  return parts
    .filter((part, index) => index === 0 || index === parts.length - 1 || !/^\d{1,3}$/.test(part))
    .join(", ");
}

export function rankBirthPlaces<T extends PlaceLike>(places: T[], query: string): T[] {
  const q = normalize(query.split(",")[0] ?? query);
  const cyrillicQuery = /[а-яё]/i.test(query);
  return [...places].sort((a, b) => {
    const score = (place: T) => {
      const label = normalize(place.label);
      const primary = normalize(place.label.split(",")[0] ?? place.label);
      let value = primary === q ? 1000 : primary.startsWith(q) ? 600 : label.includes(q) ? 200 : 0;
      if (/россия|russia|,\s*ru$/i.test(place.label)) value += 120;
      if (cyrillicQuery && /[а-яё]/i.test(place.label)) value += 80;
      return value;
    };
    return score(b) - score(a);
  });
}
