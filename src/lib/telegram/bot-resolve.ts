import { findUserById, getProfileUserIdForAccount } from "@/lib/accounts";
import { getRuneBalance } from "@/lib/rune-service";
import { getUserById } from "@/lib/users";
import { findTelegramIdentity } from "@/lib/telegram/accounts";

export type BotResolveResult = {
  linked: boolean;
  telegramUserId: number;
  accountId: string | null;
  profileUserId: string | null;
  needsOnboarding: boolean;
  name: string | null;
  email: string | null;
  runeBalance: number | null;
  linkUrl: string;
};

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://zovus.ru").replace(
    /\/$/,
    ""
  );
}

export async function resolveBotUser(telegramUserId: number): Promise<BotResolveResult> {
  // Fallback only: real bind URL is bot-minted `/auth/telegram-link?code=…` after site auth.
  const linkUrl = `${siteBase()}/auth/user/login?returnTo=${encodeURIComponent("/cabinet")}&utm_source=telegram&utm_medium=bot&utm_campaign=account_link`;
  const identity = await findTelegramIdentity(telegramUserId);
  if (!identity) {
    return {
      linked: false,
      telegramUserId,
      accountId: null,
      profileUserId: null,
      needsOnboarding: true,
      name: null,
      email: null,
      runeBalance: null,
      linkUrl,
    };
  }

  const account = await findUserById(identity.user_account_id);
  const profileUserId = await getProfileUserIdForAccount(identity.user_account_id);
  const profile = profileUserId ? await getUserById(profileUserId) : null;
  const runeBalance = profileUserId ? await getRuneBalance(profileUserId) : null;

  return {
    linked: true,
    telegramUserId,
    accountId: identity.user_account_id,
    profileUserId,
    needsOnboarding: !profileUserId || !profile?.birth_date,
    name: profile?.name ?? account?.name ?? null,
    email: account?.email ?? null,
    runeBalance,
    linkUrl: `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=cabinet`,
  };
}
