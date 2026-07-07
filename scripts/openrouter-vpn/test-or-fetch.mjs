import { openRouterFetch } from "../../src/lib/openrouter-fetch.ts";

const res = await openRouterFetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://zovus.ru",
    "X-Title": "Zovus",
  },
  body: JSON.stringify({
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "Say OK" }],
    max_tokens: 5,
  }),
});
console.log("http", res.status);
console.log((await res.text()).slice(0, 250));
