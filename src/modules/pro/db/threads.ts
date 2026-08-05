import { proQuery } from "../db";
import { detectCrisis, filterPractitionerOutput } from "../safety";
import { getProDialogModeMax, isProAiEnabled } from "../config";
import { generateValidatedAiText } from "@/lib/validated-ai-generation";
import { chargeProAction, refundProAction } from "./billing";

export type ThreadMessageRow = {
  id: string;
  thread_id: string;
  author: string;
  body: string;
  moderation_state: string;
  safety_flags: string[];
  created_at: Date;
  sent_at: Date | null;
};

export async function listInbox(accountId: string | number): Promise<
  {
    threadId: string;
    caseId: string;
    clientId: string;
    pendingCount: number;
    status: string;
  }[]
> {
  const { rows } = await proQuery<{
    thread_id: string;
    case_id: string;
    client_id: string;
    status: string;
    pending: string;
  }>(
    `SELECT t.id AS thread_id, t.case_id, t.client_id, t.status,
            COUNT(m.id) FILTER (WHERE m.moderation_state = 'pending' AND m.author = 'ai_draft')::text AS pending
     FROM pro.client_threads t
     LEFT JOIN pro.thread_messages m ON m.thread_id = t.id
     WHERE t.account_id = $1 AND t.status = 'open'
     GROUP BY t.id
     ORDER BY t.created_at DESC
     LIMIT 50`,
    [accountId]
  );
  return rows.map((r) => ({
    threadId: r.thread_id,
    caseId: r.case_id,
    clientId: r.client_id,
    pendingCount: Number(r.pending),
    status: r.status,
  }));
}

export async function listThreadMessages(
  accountId: string | number,
  threadId: string | number
): Promise<ThreadMessageRow[]> {
  const { rows } = await proQuery<ThreadMessageRow>(
    `SELECT m.* FROM pro.thread_messages m
     JOIN pro.client_threads t ON t.id = m.thread_id
     WHERE t.id = $1 AND t.account_id = $2
     ORDER BY m.created_at ASC`,
    [threadId, accountId]
  );
  return rows;
}

export async function clientAskOnDelivery(input: {
  deliveryId: string | number;
  accountId: string | number;
  caseId: string | number;
  clientId: string | number;
  userIdForBilling: string;
  question: string;
  dialogMode: "a" | "b" | "c";
  dialogQuota: number;
}): Promise<{ status: string; message?: string }> {
  const crisis = detectCrisis(input.question);
  const { rows: threads } = await proQuery<{
    id: string;
    questions_used: number;
    status: string;
  }>(
    `SELECT id, questions_used, status FROM pro.client_threads
     WHERE delivery_id = $1 LIMIT 1`,
    [input.deliveryId]
  );
  const thread = threads[0];
  if (!thread || thread.status !== "open") {
    return { status: "closed" };
  }
  if (thread.questions_used >= input.dialogQuota) {
    return { status: "quota_exceeded" };
  }

  await proQuery(
    `INSERT INTO pro.thread_messages (thread_id, author, body, moderation_state, safety_flags, sent_at)
     VALUES ($1, 'client', $2, 'auto', $3, NOW())`,
    [thread.id, input.question.slice(0, 4000), crisis.crisis ? ["crisis"] : []]
  );
  await proQuery(
    `UPDATE pro.client_threads SET questions_used = questions_used + 1 WHERE id = $1`,
    [thread.id]
  );

  if (crisis.crisis) {
    await proQuery(
      `UPDATE pro.client_threads SET status = 'escalated' WHERE id = $1`,
      [thread.id]
    );
    await proQuery(
      `INSERT INTO pro.thread_messages (thread_id, author, body, moderation_state, sent_at)
       VALUES ($1, 'system', $2, 'auto', NOW())`,
      [
        thread.id,
        "Вопрос передан практику. Если вам плохо — обратитесь к специалистам экстренной помощи.",
      ]
    );
    return { status: "escalated" };
  }

  if (input.dialogMode === "a") {
    return { status: "awaiting_practitioner" };
  }

  const maxMode = getProDialogModeMax();
  if (input.dialogMode === "c" && maxMode === "c" && isProAiEnabled()) {
    // Direct AI — still filter; rare until S4.
    const draft = await draftDialogAnswer(input.question);
    const filtered = filterPractitionerOutput(draft);
    await proQuery(
      `INSERT INTO pro.thread_messages (thread_id, author, body, moderation_state, safety_flags, sent_at)
       VALUES ($1, 'ai_direct', $2, 'auto', $3, NOW())`,
      [thread.id, filtered.text, filtered.blocked]
    );
    return { status: "answered", message: filtered.text };
  }

  // Mode B: AI draft pending approval
  const idem = `pro-dialog-${thread.id}-${thread.questions_used + 1}`;
  const charge = await chargeProAction({
    accountId: input.accountId,
    userId: input.userIdForBilling,
    action: "client_dialog_draft",
    caseId: input.caseId,
    idempotencyKey: idem,
  });
  try {
    const draft = isProAiEnabled()
      ? await draftDialogAnswer(input.question)
      : `Черновик ответа (AI выключен): кратко и бережно отреагируйте на вопрос клиента «${input.question.slice(0, 200)}».`;
    const filtered = filterPractitionerOutput(draft);
    await proQuery(
      `INSERT INTO pro.thread_messages
         (thread_id, author, body, moderation_state, safety_flags, ai_cost_runes)
       VALUES ($1, 'ai_draft', $2, 'pending', $3, $4)`,
      [thread.id, filtered.text, filtered.blocked, charge.runes]
    );
    return { status: "draft_pending" };
  } catch (e) {
    await refundProAction({
      userId: input.userIdForBilling,
      idempotencyKey: idem,
      transactionId: charge.ledgerTxnRef,
      spentRunes: charge.runes,
      shadow: charge.shadow,
    });
    throw e;
  }
}

async function draftDialogAnswer(question: string): Promise<string> {
  const result = await generateValidatedAiText({
    messages: [
      {
        role: "system",
        content:
          "Ты помощник практика. Короткий бережный ответ клиенту по отчёту. Без гарантий и медицины. JSON: {\"answer\":\"...\"}",
      },
      { role: "user", content: question.slice(0, 2000) },
    ],
    inputParts: ["pro-dialog", question.slice(0, 200)],
    modelFamily: "paid",
    jsonObject: true,
    maxTokens: 600,
    validate: (text) => {
      try {
        const j = JSON.parse(text) as { answer?: string };
        if (!j.answer?.trim()) {
          return { ok: false as const, code: "invalid_structure" as const };
        }
        return { ok: true as const };
      } catch {
        return { ok: false as const, code: "invalid_structure" as const };
      }
    },
  });
  if (!result.ok || !result.content) {
    return "Практик скоро ответит лично.";
  }
  try {
    return String((JSON.parse(result.content) as { answer: string }).answer);
  } catch {
    return result.content.slice(0, 1500);
  }
}

export async function approveDraftMessage(
  accountId: string | number,
  messageId: string | number,
  bodyOverride?: string
): Promise<boolean> {
  const { rows } = await proQuery<{ id: string; body: string }>(
    `SELECT m.id, m.body FROM pro.thread_messages m
     JOIN pro.client_threads t ON t.id = m.thread_id
     WHERE m.id = $1 AND t.account_id = $2 AND m.author = 'ai_draft'
       AND m.moderation_state = 'pending'`,
    [messageId, accountId]
  );
  if (!rows[0]) return false;
  const body = bodyOverride?.trim() || rows[0].body;
  const filtered = filterPractitionerOutput(body);
  await proQuery(
    `UPDATE pro.thread_messages SET
       body = $2, moderation_state = 'approved', author = 'practitioner', sent_at = NOW()
     WHERE id = $1`,
    [messageId, filtered.text]
  );
  return true;
}
