/**
 * QA / synthetic test accounts created by smoke scripts and guest teaser probes.
 * Excluded from admin/public user counters and default admin lists.
 */

export function isTestAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return e.endsWith("@zovus.test") || e.startsWith("zovus-qa+") || e.startsWith("teaser.qa.");
}

/** SQL boolean expression over a user_accounts email column alias. */
export function testAccountEmailSql(alias = "email"): string {
  const col = alias.includes(".") ? `lower(${alias})` : `lower(${alias})`;
  return `(
    ${col} LIKE '%@zovus.test'
    OR ${col} LIKE 'zovus-qa+%'
    OR ${col} LIKE 'teaser.qa.%'
  )`;
}

/** Profiles that look like QA leftovers (often without a linked account). */
export function testProfileNameSql(alias = "name"): string {
  return `(
    ${alias} IN ('QA Test', 'Test User', 'Teaser QA', 'QA Guest', 'New User', 'Anigilyator')
    OR ${alias} ILIKE 'QA %'
    OR ${alias} ILIKE 'Teaser QA%'
  )`;
}
