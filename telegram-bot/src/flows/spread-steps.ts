/**
 * Flow steps where an incoming text message IS the spread question.
 * Both the catalog «Свой вопрос» entry (await_question) and the explicit
 * «написать свой» prompt (await_free_text) must accept free text — the copy
 * invites typing in both.
 */
export const SPREAD_QUESTION_STEPS: ReadonlySet<string> = new Set([
  "await_question",
  "await_free_text",
]);
