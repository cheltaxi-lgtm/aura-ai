/** Max user questions per consultation session (chips + free text + photo in chat). */
export const SESSION_CHAT_QUESTION_LIMIT = 6;

export function sessionChatQuestionsUsed(used: number | null | undefined): number {
  return Math.max(0, used ?? 0);
}

export function isSessionChatQuestionCapReached(used: number | null | undefined): boolean {
  return sessionChatQuestionsUsed(used) >= SESSION_CHAT_QUESTION_LIMIT;
}

export function sessionChatQuestionsRemaining(used: number | null | undefined): number {
  return Math.max(0, SESSION_CHAT_QUESTION_LIMIT - sessionChatQuestionsUsed(used));
}

export const SESSION_CHAT_LIMIT_MESSAGE =
  "В этом сеансе уже задано максимум вопросов. Завершите сеанс и начните новый расклад — так ответы будут точнее.";
