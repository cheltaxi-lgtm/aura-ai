import fs from "fs";
import path from "path";
import iconv from "iconv-lite";

const root = path.resolve(import.meta.dirname, "..");

function looksMojibake(s) {
  return (
    s.includes("Р") &&
    (s.includes("Р°") ||
      s.includes("Рќ") ||
      s.includes("Рё") ||
      s.includes("Рµ") ||
      s.includes("СЃ") ||
      s.includes("вЂ") ||
      s.includes("Рј") ||
      s.includes("Рѕ"))
  );
}

function fixStr(s) {
  if (!looksMojibake(s)) return s;
  try {
    const decoded = iconv.decode(iconv.encode(s, "win1251"), "utf8");
    if (/[\u0400-\u04FF]/.test(decoded) && !decoded.includes("\uFFFD") && decoded !== s) {
      return decoded;
    }
  } catch {
    /* ignore */
  }
  return s;
}

function fixContent(content) {
  let next = content;

  next = next.replace(/"((?:[^"\\]|\\.)*)"/g, (m, inner) => {
    const fixed = fixStr(inner);
    return fixed === inner ? m : JSON.stringify(fixed);
  });

  next = next.replace(/`((?:[^`\\]|\\.)*)`/g, (m, inner) => {
    const fixed = fixStr(inner);
    return fixed === inner ? m : "`" + fixed + "`";
  });

  next = next.replace(/>([^<{}]+)</g, (m, inner) => {
    if (!looksMojibake(inner)) return m;
    const fixed = fixStr(inner);
    return fixed === inner ? m : `>${fixed}<`;
  });

  return next;
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== ".next") walk(p, out);
    } else if (/\.(tsx|ts|jsx|js|mjs)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

let count = 0;
for (const filePath of walk(path.join(root, "src"))) {
  const content = fs.readFileSync(filePath, "utf8");
  if (!looksMojibake(content)) continue;
  const fixed = fixContent(content);
  if (fixed !== content) {
    fs.writeFileSync(filePath, fixed, "utf8");
    console.log("fixed:", path.relative(root, filePath));
    count++;
  }
}

console.log(`done, fixed ${count} file(s)`);
