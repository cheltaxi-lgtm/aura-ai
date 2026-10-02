/** A single bounded mailbox, never an RFC address list or display-name string. */
export function normalizeSingleMailbox(raw: unknown): string | null {
  // Bound before trimming/parsing, including inputs from historical account rows.
  if (typeof raw !== "string" || raw.length > 320 || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  const email = raw.trim();
  if (email.length > 254) return null;
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !/^[a-z0-9!#$%&'*+/=?^_\x60{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_\x60{|}~-]+)*$/i.test(local)) return null;
  if (!/^[\p{L}\p{N}.-]+$/u.test(domain)) return null;
  let host: string;
  try { host = new URL(`http://${domain}`).hostname.toLowerCase(); }
  catch { return null; }
  // Do not let URL's IPv4 shorthand rewrite an ASCII mailbox's domain.
  if (/^[\x00-\x7f]+$/.test(domain) && host !== domain.toLowerCase()) return null;
  const labels = host.split(".");
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
  if (local.length + host.length + 1 > 254) return null;
  return `${local.toLowerCase()}@${host}`;
}
