export function buildAppOAuthCompleteUrl(pathAndQuery: string): string {
  const target = new URL(pathAndQuery, "https://zovus.ru");
  if (target.pathname !== "/auth/oauth/complete") {
    throw new Error("invalid_oauth_complete_path");
  }
  return `zovus://open${target.pathname}${target.search}${target.hash}`;
}
