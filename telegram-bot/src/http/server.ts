import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { webhookCallback } from "grammy";
import type { Bot } from "grammy";
import { botConfig } from "../config.js";
import { getDb } from "../db/client.js";
import {
  findSessionByTokenHash,
  trackEvent,
} from "../db/repos.js";
import { buildFinalCtaUrl, hashSessionToken, isSessionToken } from "../domain/session/token.js";
import { pruneRateMap } from "../ops/rate-maps.js";
import { handleAccountLinked } from "./account-linked.js";
import { handleAdminApi } from "./admin-api.js";
import { handleInternalReceipt } from "./internal-receipt.js";
import { handleReportReadyNotify } from "./report-ready.js";
import { handleSupportReplyNotify } from "./support-reply.js";

const redirectHits = new Map<string, { n: number; reset: number }>();
let lastRedirectPrune = 0;

function rateOk(ip: string): boolean {
  const now = Date.now();
  if (now - lastRedirectPrune > 60_000) {
    pruneRateMap(redirectHits, now);
    lastRedirectPrune = now;
  }
  const slot = redirectHits.get(ip);
  if (!slot || slot.reset < now) {
    redirectHits.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  slot.n += 1;
  return slot.n <= 60;
}

function healthPayload(): { ok: boolean; service: string; db: "ok" | "error"; ts: string } {
  let db: "ok" | "error" = "ok";
  try {
    getDb().prepare(`SELECT 1 AS ok`).get();
  } catch {
    db = "error";
  }
  return {
    ok: db === "ok",
    service: "zovus-telegram-bot",
    db,
    ts: new Date().toISOString(),
  };
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
      const body = healthPayload();
      res.writeHead(body.ok ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }

    if (req.method === "GET" && path.startsWith("/r/")) {
      handleRedirect(req, res);
      return;
    }

    if (await handleInternalReceipt(req, res, path)) {
      return;
    }

    if (await handleAccountLinked(req, res, path)) {
      return;
    }

    if (await handleSupportReplyNotify(req, res, path)) {
      return;
    }

    if (await handleReportReadyNotify(req, res, path)) {
      return;
    }

    if (await handleAdminApi(req, res, path)) {
      return;
    }

    if (handleUpdate && req.method === "POST" && path === "/telegram/webhook") {
      // Webhook mode requires a non-empty secret (assertBotRuntimeGuards). Never skip.
      const secret = req.headers["x-telegram-bot-api-secret-token"];
      if (
        !botConfig.webhookSecret ||
        typeof secret !== "string" ||
        secret !== botConfig.webhookSecret
      ) {
        console.warn("[webhook] unauthorized update rejected");
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

  // Default loopback: site calls http://127.0.0.1:8787. Override with BOT_HTTP_HOST if needed.
  const host = (process.env.BOT_HTTP_HOST?.trim() || "127.0.0.1");
  server.listen(botConfig.webhookPort, host, () => {
    console.log(`[http] ${host}:${botConfig.webhookPort} health+/r/:token${bot ? "+webhook" : ""}`);
  });
}

/** @deprecated use startHttpServer */
export const startWebhookServer = startHttpServer;
