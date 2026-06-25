import assert from "node:assert/strict";

const NUMEROLOG_MASTER_ID = "numerolog";

function isNumerologMaster(masterId) {
  return masterId === NUMEROLOG_MASTER_ID;
}

function buildNumerologWelcomeMessage(input) {
  const name = (input.userName || "").trim() || "друг";
  const lines = [`${name}, рада тебя видеть.`, "", "Твоё число жизненного пути — 7. Лидер.", ""];

  if (input.spreadNumbers?.length === 3) {
    lines.push(
      `Три числа расклада: ${input.spreadNumbers.join(" · ")} — путь, энергия периода и совет.`,
      ""
    );
  }

  lines.push(
    "Выбери расчёт кнопками под полем ввода или напиши свой вопрос — отдельную «тему» выбирать не нужно."
  );

  return lines.join("\n");
}

assert.equal(NUMEROLOG_MASTER_ID, "numerolog");
assert.equal(isNumerologMaster("numerolog"), true);
assert.equal(isNumerologMaster("veronika"), false);

const welcome = buildNumerologWelcomeMessage({
  userName: "Анна",
  birthDate: "1990-05-15",
  spreadNumbers: ["7", "3", "9"],
});

assert.match(welcome, /Анна, рада тебя видеть/);
assert.match(welcome, /число жизненного пути/i);
assert.match(welcome, /кнопками под полем ввода/i);
assert.doesNotMatch(welcome, /выберите тему/i);
assert.doesNotMatch(welcome, /О чём поговорим/i);

console.log("test-numerolog-welcome: ok");
