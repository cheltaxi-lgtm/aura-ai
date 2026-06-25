/** Транскрипция слова силы: из БД или эвристика для латиницы/рун. */
export function resolveWordOfPowerTranscription(
  word: string | null | undefined,
  stored: string | null | undefined
): string | null {
  if (stored?.trim()) return stored.trim();
  if (!word?.trim()) return null;
  return fallbackWordOfPowerTranscription(word);
}

/** Приблизительное русское произношение для латинских/скандинских слов. */
export function fallbackWordOfPowerTranscription(word: string): string | null {
  const w = word.trim();
  if (!w) return null;

  if (/^[а-яА-ЯёЁ\s-]+$/u.test(w)) {
    const lower = w.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  const lower = w.toLowerCase();
  let i = 0;
  let out = "";

  while (i < lower.length) {
    const rest = lower.slice(i);
    if (rest.startsWith("skj")) {
      out += "скь";
      i += 3;
      continue;
    }
    if (rest.startsWith("sk")) {
      out += "ск";
      i += 2;
      continue;
    }
    if (rest.startsWith("th") || rest.startsWith("þ")) {
      out += "т";
      i += rest.startsWith("th") ? 2 : 1;
      continue;
    }
    if (rest.startsWith("ch")) {
      out += "ч";
      i += 2;
      continue;
    }
    if (rest.startsWith("sh")) {
      out += "ш";
      i += 2;
      continue;
    }
    if (rest.startsWith("zh")) {
      out += "ж";
      i += 2;
      continue;
    }
    if (rest.startsWith("ts")) {
      out += "ц";
      i += 2;
      continue;
    }
    if (rest.startsWith("ya")) {
      out += "я";
      i += 2;
      continue;
    }
    if (rest.startsWith("yo")) {
      out += "ё";
      i += 2;
      continue;
    }
    if (rest.startsWith("yu") || rest.startsWith("ju")) {
      out += "ю";
      i += 2;
      continue;
    }
    if (rest.startsWith("ye") || rest.startsWith("ja")) {
      out += "е";
      i += 2;
      continue;
    }

    const c = lower[i];
    i += 1;
    switch (c) {
      case "ö":
      case "ø":
        out += "ё";
        break;
      case "ä":
      case "æ":
        out += "э";
        break;
      case "å":
        out += "о";
        break;
      case "a":
        out += "а";
        break;
      case "b":
        out += "б";
        break;
      case "c":
      case "k":
        out += "к";
        break;
      case "d":
        out += "д";
        break;
      case "e":
        out += "е";
        break;
      case "f":
        out += "ф";
        break;
      case "g":
        out += "г";
        break;
      case "h":
        out += "х";
        break;
      case "i":
      case "y":
        out += "и";
        break;
      case "j":
        out += "й";
        break;
      case "l":
        out += "л";
        break;
      case "m":
        out += "м";
        break;
      case "n":
        out += "н";
        break;
      case "o":
        out += "о";
        break;
      case "p":
        out += "п";
        break;
      case "q":
        out += "к";
        break;
      case "r":
        out += "р";
        break;
      case "s":
        out += "с";
        break;
      case "t":
        out += "т";
        break;
      case "u":
        out += "у";
        break;
      case "v":
      case "w":
        out += "в";
        break;
      case "x":
        out += "кс";
        break;
      case "z":
        out += "з";
        break;
      default:
        break;
    }
  }

  if (!out) return null;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
