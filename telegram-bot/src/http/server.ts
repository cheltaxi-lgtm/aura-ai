import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { webhookCallback } from "grammy";
import type { Bot } from "grammy";
import { botConfig } from "../config.js";
import {
  findSessionByTokenHash,
  trackEvent,
} from "../db/repos.js";
import { buildFinalCtaUrl, hashSessionToken, isSessionToken } from "../domain/session/token.js";

const redirectHits = new Map<string, { n: number; reset: number }>();

function rateOk(ip: string): boolean {
  const now = Date.now();
  const slot = redirectHits.get(ip);
  if (!slot || slot.reset < now) {
    redirectHits.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  slot.n += 1;
  return slot.n <= 60;
}

function handleRedirect(req: IncomingMessage, res: ServerResponse): void {
  const ip = req.socket.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    res.writeHead(302, { Location: botConfig.siteUrl });
    res.end();
    return;
  }
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const token = decodeURIComponent(url.pathname.replace(/^\/r\//, ""));
  if (!isSessionToken(token)) {
    res.writeHead(302, { Location: botConfig.siteUrl });
    res.end();
    return;
  }
  const session = findSessionByTokenHash(hashSessionToken(token));
  if (session) {
    trackEvent("cta_click", session.telegram_user_id, {
      session_id: session.id,
      source: "redirect",
      ts: new Date().toISOString(),
    });
  }
  res.writeHead(302, { Location: buildFinalCtaUrl(token) });
  res.end();
}

export function startHttpServer(bot?: Bot): void {
  const handleUpdate = bot ? webhookCallback(bot, "http") : null;

  const server = createServer(async (req, res) => {
    const path = req.url?.split("?")[0] || "/";

    if (path === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "zovus-telegram-bot" }));
      return;
    }

    if (req.method === "GET" && path.startsWith("/r/")) {
      handleRedirect(req, res);
      return;
    }

    if (handleUpdate && req.method === "POST" && path === "/telegram/webhook") {
      const secret = req.headers["x-telegram-bot-api-secret-token"];
      if (botConfig.webhookSecret && secret !== botConfig.webhookSecret) {
        res.writeHead(401);
        res.end("unauthorized");
        return;
      }
      try {
        await handleUpdate(req, res);
      } catch (err) {
        console.error("[webhook]", err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("error");
        }
      }
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  server.listen(botConfig.webhookPort, () => {
    console.log(`[http] :${botConfig.webhookPort} health+/r/:token${bot ? "+webhook" : ""}`);
  });
}

/** @deprecated use startHttpServer */
export const startWebhookServer = startHttpServer;
