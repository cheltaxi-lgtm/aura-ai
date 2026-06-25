import fs from "fs";
import path from "path";

const reps = [
  [/платформы Zovus/g, "платформы Zovus"],
  [/платформе Zovus/g, "платформе Zovus"],
  [/на платформе Zovus/g, "на платформе Zovus"],
  [/в Zovus:/g, "в Zovus:"],
  [/валюта Zovus/g, "валюта Zovus"],
  [/канал Zovus/g, "канал Zovus"],
  [/Мастера Zovus/g, "Мастера Zovus"],
  [/Колоды Zovus/g, "Колоды Zovus"],
  [/колодой Zovus/g, "колодой Zovus"],
  [/колоде Zovus/g, "колоде Zovus"],
  [/оракул Zovus/g, "оракул Zovus"],
  [/Почему Zovus/g, "Почему Zovus"],
  [/Подписка Aura\+/g, "Подписка Zovus+"],
  [/подписка Aura\+/g, "подписка Zovus+"],
  [/Aura \+/g, "Zovus+"],
  [/Zovus Admin/g, "Zovus Admin"],
  [/портала Zovus/g, "портала Zovus"],
  [/Расклад Zovus/g, "Расклад Zovus"],
  [/Мой расклад Zovus/g, "Мой расклад Zovus"],
  [/Эксперт Zovus/g, "Эксперт Zovus"],
  [/эксперт Zovus/g, "эксперт Zovus"],
  [/Эзотерик · Zovus/g, "Эзотерик · Zovus"],
  [/Zovus/g, "Zovus"],
  [/Zovus —/g, "Zovus —"],
  [/→ Zovus:/g, "→ Zovus:"],
  [/арта Zovus/g, "арта Zovus"],
  [/Система Zovus:/g, "Система Zovus:"],
  [/расклад Zovus:/g, "расклад Zovus:"],
  [/— Zovus"/g, '— Zovus"'],
  [/lux-heading-accent">Zovus<//g, 'lux-heading-accent">Zovus</'],
  [/Витрина мастеров Zovus/g, "Витрина мастеров Zovus"],
  [/Generic Zovus master/g, "Generic Zovus master"],
  [/на Zovus/g, "на Zovus"],
  [/https:\/\/aura\.ai/g, "https://zovus.ru"],
  [/https:\/\/auraai\.ru/g, "https://zovus.ru"],
  [/https:\/\/aura\.example\.com/g, "https://zovus.ru"],
  [/Zovus mystical/g, "Zovus mystical"],
  [/-- Zovus —/g, "-- Zovus —"],
];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx|sql|md|mjs)$/.test(name)) {
      let c = fs.readFileSync(p, "utf8");
      let n = c;
      for (const [from, to] of reps) n = n.replace(from, to);
      if (n !== c) {
        fs.writeFileSync(p, n);
        console.log("updated", p);
      }
    }
  }
}

walk("src");
walk("scripts");
