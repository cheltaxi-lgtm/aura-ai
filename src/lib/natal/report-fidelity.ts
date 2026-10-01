import type { NatalEvidence } from "./evidence";

const PLANETS = ["(?:солнц(?:е|а|у|ем)|сурь[яеи])", "(?:лун[аыуеой]+|чандр[аыуеой]+)", "(?:меркури[йяюем]+|будх[аыуеой]+)", "(?:венер[аыуеой]+|шукр[аыуеой]+)", "(?:марс(?:а|у|е|ом)?|мангал[аыуеой]+)", "(?:юпитер(?:а|у|е|ом)?|гуру)", "(?:сатурн(?:а|у|е|ом)?|шани)", "уран(?:а|у|е|ом)?", "нептун(?:а|у|е|ом)?", "плутон(?:а|у|е|ом)?", "(?:асцендент(?:а|у|е|ом)?|лагн[аыуеой]+)", "раху", "кету"];
const SIGNS = ["ов(?:ен|на|не|ном)", "тел(?:ец|ьца|ьце|ьцом)", "близнец[ыаоеувх]+", "рак(?:а|е|у|ом)?", "л(?:ев|ьва|ьве|ьвом)", "дев[аыоеу]+", "вес(?:ы|ов|ах|ам|ами)", "скорпион(?:а|е|у|ом)?", "стрел(?:ец|ьца|ьце|ьцом)", "козерог(?:а|е|у|ом)?", "водол(?:ей|ея|ее|еем)", "рыб(?:ы|ах|ам|ами)"];
const planetPattern = PLANETS.map((p, i) => `(?<p${i}>${p})`).join("|");
const signPattern = SIGNS.map((p, i) => `(?<s${i}>${p})`).join("|");
const normalize = (s: string) => s.toLowerCase().replaceAll("ё", "е");
function claimContext(text: string, index: number, length: number) {
  const before = text.slice(Math.max(0, index - 100), index).split(/[.!?;\n]/).at(-1) ?? "";
  const after = text.slice(index + length, index + length + 100).split(/[,.!?;\n]/)[0];
  const modifier = [...before.matchAll(/натальн[а-я]*|транзит[а-я]*|прогресс[а-я]*|соляр[а-я]*/gu)].at(-1);
  const tail = modifier ? before.slice(modifier.index + modifier[0].length) : "";
  // A qualifier belongs to this subject only if another body has not intervened.
  const qualifier = modifier && !PLANETS.some((_, i) => matchesPlanet(tail, i)) ? modifier[0] : "";
  const natalOnly = /натальн/.test(qualifier) || /натальн[а-я]*\s+карт|карт[а-я]*\s+рожд|момент[а-я]*\s+рожд/.test(after);
  return { natalOnly, timed: !natalOnly && /транзит|прогресс|соляр/.test(qualifier) };
}
const matchesPlanet = (label: string, index: number) => index >= 0 && new RegExp(`(?<![а-я])(?:${PLANETS[index]})(?=$|[^а-я])`, "iu").test(normalize(label));
const groupIndex = (groups: Record<string, string | undefined> | undefined, prefix: string) => {
  const key = Object.keys(groups ?? {}).find(key => key.startsWith(prefix) && groups?.[key]);
  return key ? Number(key.slice(1)) : -1;
};

/** Reject concrete contradictions, independently from prose depth and citations. */
export function natalClaimFactErrors(text: string, evidence: readonly NatalEvidence[], cited: readonly NatalEvidence[] = evidence): string[] {
  const errors: string[] = [];
  const normalized = normalize(text);
  const positions = evidence.filter(item => item.type === "position");
  const signFact = new RegExp(`(?:${planetPattern})\\s+(?:(?:находится|стоит|расположен[ао]?)\\s+)?(?:в|во|—|:)\\s+(?:знаке\\s+)?(?:${signPattern})(?=$|[^а-я])`, "giu");
  for (const match of normalized.matchAll(signFact)) {
    const planet = groupIndex(match.groups, "p");
    const sign = groupIndex(match.groups, "s");
    const { timed, natalOnly } = claimContext(normalized, match.index ?? 0, match[0].length);
    const timingFacts = cited.filter(item => item.tradition === "timing" && matchesPlanet(item.value, planet)).map(item => ({ ...item, value: item.value.includes("→") ? item.value.split("→")[1] : item.value }));
    const facts = timed ? timingFacts : [...positions.filter(item => matchesPlanet(item.label, planet)), ...(natalOnly ? [] : timingFacts)];
    if (!facts.some(item => new RegExp(`(?:${SIGNS[sign]})(?=$|[^а-я])`, "iu").test(normalize(item.value)))) errors.push(`Положение «${match[0]}» не совпадает с расчётом.`);
  }
  const houseFact = new RegExp(`(?:${planetPattern})\\s+(?:в|во)\\s+(?<house>1[0-2]|[1-9])(?:[-‑]?(?:м|й|ом))?\\s+дом[еау]?`, "giu");
  for (const match of normalized.matchAll(houseFact)) {
    const planet = groupIndex(match.groups, "p");
    const house = Number(match.groups?.house);
    if (!evidence.some(item => item.type === "house" && matchesPlanet(item.label, planet) && Number.parseInt(item.value, 10) === house)) errors.push(`Дом «${match[0]}» не совпадает с расчётом.`);
  }
  // Explicit degrees belong to the named planet's sign, never to its total longitude.
  const degreeFact = new RegExp('(?:' + planetPattern + ')\\s+(?:в|во)\\s+(?:знаке\\s+)?(?:' + signPattern + ')(?:\\s+на)?\\s+(?<deg>\\d{1,3}(?:[.,]\\d+)?)\\s*°(?:\\s*(?<min>\\d{1,2})[′\\x27’](?:\\s*(?<sec>\\d{1,2}(?:[.,]\\d+)?)[″"”])?)?', 'giu');
  for (const match of normalized.matchAll(degreeFact)) {
    const planet = groupIndex(match.groups, 'p');
    const claimed = Number(match.groups?.deg?.replace(',', '.')) + Number(match.groups?.min ?? 0) / 60 + Number(match.groups?.sec?.replace(',', '.') ?? 0) / 3600;
    const nearby = normalized.slice(Math.max(0, (match.index ?? 0) - 35), match.index);
    const timed = /транзит|прогресс|соляр/.test(nearby);
    const facts = timed ? cited.filter(item => item.tradition === 'timing' && matchesPlanet(item.label + ' ' + item.value, planet)) : positions.filter(item => matchesPlanet(item.label, planet));
    const tolerance = match.groups?.sec ? 0.0005 : match.groups?.min ? 0.009 : match.groups?.deg?.match(/[.,]/) ? 0.05 : 0.51;
    if (!facts.some(item => {
      const value = item.value.includes('→') ? item.value.split('→')[1] : item.value;
      const raw = value.match(/(?:[·(]|^)\s*(\d{1,2}(?:[.,]\d+)?)\s*°(?:\s*(\d{1,2})[′'’](?:\s*(\d{1,2}(?:[.,]\d+)?)[″"”])?)?/);
      if (!raw) return false;
      const actual = Number(raw[1].replace(',', '.')) + Number(raw[2] ?? 0) / 60 + Number(raw[3]?.replace(',', '.') ?? 0) / 3600;
      return Number(match.groups?.min ?? 0) < 60 && Number(match.groups?.sec?.replace(',', '.') ?? 0) < 60 && Math.abs(actual - claimed) <= tolerance;
    })) errors.push('Градус «' + match[0] + '» не совпадает с расчётом.');
  }
  const retroFact = new RegExp('(?<neg>не\\s+)?ретроградн[а-я]*\\s+(?:' + planetPattern + ')|(?:' + planetPattern.replaceAll('p', 'q') + ')\\s+(?<negAfter>не\\s+)?ретроградн[а-я]*', 'giu');
  for (const match of normalized.matchAll(retroFact)) {
    const planet = Math.max(groupIndex(match.groups, 'p'), groupIndex(match.groups, 'q'));
    const timed = /транзит|прогресс/.test(normalized.slice(Math.max(0,(match.index ?? 0)-35),match.index));
    const facts = timed ? cited.filter(item => item.tradition === 'timing' && item.type === 'position' && matchesPlanet(item.label,planet)) : positions.filter(item => item.tradition === 'western' && matchesPlanet(item.label, planet));
    if (timed && !facts.length) errors.push('Текущая ретроградность не подтверждена указанными факторами.');
    const wanted = !(match.groups?.neg || match.groups?.negAfter);
    if (facts.length && !facts.some(item => /ретроград/.test(item.value) === wanted)) errors.push('Ретроградность «' + match[0] + '» не совпадает с расчётом.');
  }
  const aspectWords = ['соединени[еяи]', 'секстил[ьеяю]', '(?:квадрат[аеу]?|квадратур[аыуе])', '(?:тригон[аеу]?|трин[аеу]?)', 'оппозици[яиюе]', 'квинконс[аеу]?'];
  const aspectPattern = aspectWords.map((word, index) => '(?<a' + index + '>' + word + ')').join('|');
  const pairPattern = planetPattern.replaceAll('p', 'q');
  const aspectFact = new RegExp('(?:' + planetPattern + ')\\s+(?:(?:в|во|образует)\\s+)?(?:' + aspectPattern + ')\\s+(?:(?:с|со|к|к натальному|к натальной)\\s+)?(?:' + pairPattern + ')(?=$|[^а-я])', 'giu');
  for (const match of normalized.matchAll(aspectFact)) {
    // Transit and progressed bodies must not be confused with natal positions.
    const { timed, natalOnly } = claimContext(normalized, match.index ?? 0, match[0].length);
    const first = groupIndex(match.groups, 'p'), second = groupIndex(match.groups, 'q'), kind = groupIndex(match.groups, 'a');
    const timingFacts = cited.filter(item => {
      const parts = item.value.split("·");
      return item.tradition === "timing" && matchesPlanet(parts[0] ?? "", first) && matchesPlanet(parts[2] ?? "", second);
    });
    const facts = timed ? timingFacts : [...evidence.filter(item => item.type === "aspect" && matchesPlanet(item.label, first) && matchesPlanet(item.label, second)), ...(natalOnly ? [] : timingFacts)];
    if (!facts.some(item => new RegExp(aspectWords[kind], 'iu').test(normalize(item.value)))) errors.push('Аспект «' + match[0] + '» отсутствует в расчёте.');
  }
  // An arbitrary calendar date cannot establish grounding for a timing claim.
  const knownDates = new Set(cited.flatMap(item => [...item.value.matchAll(/\d{4}-\d{2}-\d{2}/g)].map(m => m[0])));
  const mentions = [...normalized.matchAll(/\d{4}-\d{2}-\d{2}/g)].map(match => match[0]);
  for (const match of normalized.matchAll(/(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/g)) mentions.push(match[3] + '-' + match[2].padStart(2,'0') + '-' + match[1].padStart(2,'0'));
  const months = ['январ[ья]', 'феврал[ья]', 'март[а]?', 'апрел[ья]', 'ма[йя]', 'июн[ья]', 'июл[ья]', 'август[а]?', 'сентябр[ья]', 'октябр[ья]', 'ноябр[ья]', 'декабр[ья]'];
  for (const [month, name] of months.entries()) {
    const pattern = new RegExp('(?<!\\d)(\\d{1,2})\\s+' + name + '\\s+(\\d{4})(?=$|[^\\d])', 'gu');
    for (const match of normalized.matchAll(pattern)) mentions.push(match[2] + '-' + String(month + 1).padStart(2,'0') + '-' + match[1].padStart(2,'0'));
  }
  for (const date of mentions) if (!knownDates.has(date)) errors.push('Дата ' + date + ' отсутствует в указанных расчётных факторах.');
  return [...new Set(errors)];
}
