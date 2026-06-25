/** Detect who an assistant reply is addressed to (e.g. "Anigilyator, ..."). */
export function chatAddressee(content: string): string | null {
  const first = content.trim().slice(0, 120);
  const commaMatch = first.match(/^([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_\s-]{0,40}),\s*/u);
  if (commaMatch) return commaMatch[1].trim();

  const punctMatch = first.match(/^([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_\s-]{0,40})[.!]\s*/u);
  return punctMatch ? punctMatch[1].trim() : null;
}

export function normalizePersonName(name: string): string {
  return name.trim().toLocaleLowerCase("ru-RU");
}

export function messageBelongsToProfile(
  msg: { role: string; content: string; owner_user_id?: string | null },
  profileUserId: string,
  profileName: string
): boolean {
  if (msg.owner_user_id) {
    return msg.owner_user_id === profileUserId;
  }
  if (msg.role === "user") {
    const addressee = chatAddressee(msg.content);
    if (addressee && normalizePersonName(addressee) !== normalizePersonName(profileName)) {
      return false;
    }
    return true;
  }

  const addressee = chatAddressee(msg.content);
  if (!addressee) return true;

  return normalizePersonName(addressee) === normalizePersonName(profileName);
}
