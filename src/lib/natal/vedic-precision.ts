/** Rashi/nakshatra metadata adapted from natalengine1.6.0 (MIT). Positions use exact UTC. */
import { computeNatalSkyAtUtc } from "./astronomy-sky";
const RASHIS = [
  { name: 'Mesha', westernName: 'Aries', symbol: '♈', ruler: 'Mars', element: 'Fire', quality: 'Movable' },
  { name: 'Vrishabha', westernName: 'Taurus', symbol: '♉', ruler: 'Venus', element: 'Earth', quality: 'Fixed' },
  { name: 'Mithuna', westernName: 'Gemini', symbol: '♊', ruler: 'Mercury', element: 'Air', quality: 'Dual' },
  { name: 'Karka', westernName: 'Cancer', symbol: '♋', ruler: 'Moon', element: 'Water', quality: 'Movable' },
  { name: 'Simha', westernName: 'Leo', symbol: '♌', ruler: 'Sun', element: 'Fire', quality: 'Fixed' },
  { name: 'Kanya', westernName: 'Virgo', symbol: '♍', ruler: 'Mercury', element: 'Earth', quality: 'Dual' },
  { name: 'Tula', westernName: 'Libra', symbol: '♎', ruler: 'Venus', element: 'Air', quality: 'Movable' },
  { name: 'Vrishchika', westernName: 'Scorpio', symbol: '♏', ruler: 'Mars', element: 'Water', quality: 'Fixed' },
  { name: 'Dhanu', westernName: 'Sagittarius', symbol: '♐', ruler: 'Jupiter', element: 'Fire', quality: 'Dual' },
  { name: 'Makara', westernName: 'Capricorn', symbol: '♑', ruler: 'Saturn', element: 'Earth', quality: 'Movable' },
  { name: 'Kumbha', westernName: 'Aquarius', symbol: '♒', ruler: 'Saturn', element: 'Air', quality: 'Fixed' },
  { name: 'Meena', westernName: 'Pisces', symbol: '♓', ruler: 'Jupiter', element: 'Water', quality: 'Dual' }
] as const;
const NAKSHATRAS = [
  { number: 1, name: 'Ashwini', lord: 'Ketu', deity: 'Ashwini Kumaras', symbol: 'Horse head' },
  { number: 2, name: 'Bharani', lord: 'Venus', deity: 'Yama', symbol: 'Yoni' },
  { number: 3, name: 'Krittika', lord: 'Sun', deity: 'Agni', symbol: 'Razor/flame' },
  { number: 4, name: 'Rohini', lord: 'Moon', deity: 'Brahma', symbol: 'Cart/chariot' },
  { number: 5, name: 'Mrigashira', lord: 'Mars', deity: 'Soma', symbol: 'Deer head' },
  { number: 6, name: 'Ardra', lord: 'Rahu', deity: 'Rudra', symbol: 'Teardrop' },
  { number: 7, name: 'Punarvasu', lord: 'Jupiter', deity: 'Aditi', symbol: 'Bow/quiver' },
  { number: 8, name: 'Pushya', lord: 'Saturn', deity: 'Brihaspati', symbol: 'Flower/circle' },
  { number: 9, name: 'Ashlesha', lord: 'Mercury', deity: 'Nagas', symbol: 'Serpent' },
  { number: 10, name: 'Magha', lord: 'Ketu', deity: 'Pitris', symbol: 'Throne' },
  { number: 11, name: 'Purva Phalguni', lord: 'Venus', deity: 'Bhaga', symbol: 'Hammock' },
  { number: 12, name: 'Uttara Phalguni', lord: 'Sun', deity: 'Aryaman', symbol: 'Bed' },
  { number: 13, name: 'Hasta', lord: 'Moon', deity: 'Savitar', symbol: 'Hand' },
  { number: 14, name: 'Chitra', lord: 'Mars', deity: 'Vishvakarma', symbol: 'Pearl' },
  { number: 15, name: 'Swati', lord: 'Rahu', deity: 'Vayu', symbol: 'Coral' },
  { number: 16, name: 'Vishakha', lord: 'Jupiter', deity: 'Indra-Agni', symbol: 'Archway' },
  { number: 17, name: 'Anuradha', lord: 'Saturn', deity: 'Mitra', symbol: 'Lotus' },
  { number: 18, name: 'Jyeshtha', lord: 'Mercury', deity: 'Indra', symbol: 'Earring/umbrella' },
  { number: 19, name: 'Mula', lord: 'Ketu', deity: 'Nirriti', symbol: 'Roots' },
  { number: 20, name: 'Purva Ashadha', lord: 'Venus', deity: 'Apas', symbol: 'Fan' },
  { number: 21, name: 'Uttara Ashadha', lord: 'Sun', deity: 'Vishvedevas', symbol: 'Elephant tusk' },
  { number: 22, name: 'Shravana', lord: 'Moon', deity: 'Vishnu', symbol: 'Ear/trident' },
  { number: 23, name: 'Dhanishtha', lord: 'Mars', deity: 'Vasus', symbol: 'Drum' },
  { number: 24, name: 'Shatabhisha', lord: 'Rahu', deity: 'Varuna', symbol: 'Circle' },
  { number: 25, name: 'Purva Bhadrapada', lord: 'Jupiter', deity: 'Aja Ekapada', symbol: 'Sword' },
  { number: 26, name: 'Uttara Bhadrapada', lord: 'Saturn', deity: 'Ahir Budhnya', symbol: 'Twins' },
  { number: 27, name: 'Revati', lord: 'Mercury', deity: 'Pushan', symbol: 'Fish/drum' }
] as const;

const wrap = (n: number) => (n % 360 + 360) % 360;
function position(tropicalLongitude: number, ayanamsa: number) {
  const longitude = wrap(tropicalLongitude - ayanamsa);
  const signIndex = Math.floor(longitude / 30);
  const degreeInSign = longitude - signIndex * 30;
  const nakshatraIndex = Math.min(26, Math.floor(longitude / (360 / 27)));
  const startDegree = nakshatraIndex * (360 / 27);
  const degreeInNakshatra = longitude - startDegree;
  const totalSeconds = Math.floor(degreeInSign * 3600);
  const degree = Math.floor(totalSeconds / 3600) + '°' + String(Math.floor(totalSeconds / 60) % 60).padStart(2,'0') + '′' + String(totalSeconds % 60).padStart(2,'0') + '″';
  return { longitude, tropicalLongitude, degree,
    rashi: { ...RASHIS[signIndex], index: signIndex + 1, degreeInSign },
    nakshatra: { ...NAKSHATRAS[nakshatraIndex], pada: Math.min(4, Math.floor(degreeInNakshatra / (10 / 3)) + 1), degreeInNakshatra, startDegree, endDegree: startDegree + 360 / 27 } };
}

/** Retains the configured Lahiri approximation and node/angle calculation, with precise planets. */
export function canonicalVedicEnginePayload(payload: unknown): unknown {
  const raw = payload as Record<string, unknown>;
  const jd = raw.julianDay as number;
  const centuries = (jd - 2451545) / 36525;
  const ayanamsa = 23.856944 + (50.291 / 3600) * centuries * 100 + (1.11161 / 3600 / 100) * centuries * centuries;
  const sky = computeNatalSkyAtUtc(new Date((jd - 2440587.5) * 86_400_000));
  const nativePositions = raw.positions as Record<string, { tropicalLongitude: number }>;
  const positions = Object.fromEntries(Object.entries(nativePositions).map(([key, native]) => [key, position(sky[key]?.longitude ?? native.tropicalLongitude, ayanamsa)]));
  const moon = positions.moon;
  const ascendant = positions.ascendant;
  const houses: Record<number, { sign: typeof RASHIS[number]; planets: { name: string; degree: string; nakshatra: string }[] }> = {};
  if (ascendant) {
    for (let house = 1; house <= 12; house++) houses[house] = { sign: RASHIS[(ascendant.rashi.index + house - 2) % 12], planets: [] };
    for (const [key, body] of Object.entries(positions)) {
      if (key === 'ascendant' || key === 'midheaven') continue;
      const house = (body.rashi.index - ascendant.rashi.index + 12) % 12 + 1;
      houses[house].planets.push({ name: key, degree: body.degree, nakshatra: body.nakshatra.name });
    }
  }
  return { ...raw, positions, moonSign: { rashi: moon.rashi, nakshatra: moon.nakshatra, summary: '' }, houses: ascendant ? houses : null };
}
