/** Login hints disabled to prevent account role enumeration. */
export async function resolveLoginHint(
  _email: string,
  _role: "user" | "expert"
): Promise<string | null> {
  return null;
}
