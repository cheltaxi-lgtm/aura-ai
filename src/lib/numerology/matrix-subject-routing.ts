/** Adult Full Matrix vs child matrix — tool must follow subject kind. */

export function matrixToolForSubjectKind(
  subjectKind: string | null | undefined
): "child_matrix" | "destiny_matrix" {
  return subjectKind === "child" ? "child_matrix" : "destiny_matrix";
}

export function fullMatrixSessionHref(input: {
  subjectId?: string | null;
  subjectKind?: string | null;
  matrixAsOf?: string | null;
} = {}): string {
  const tool = matrixToolForSubjectKind(input.subjectKind);
  let href = `/?numerolog=1&tool=${encodeURIComponent(tool)}`;
  if (input.subjectId) {
    href += `&subjectId=${encodeURIComponent(input.subjectId)}`;
  }
  if (input.matrixAsOf) {
    href += `&matrixAsOf=${encodeURIComponent(input.matrixAsOf)}`;
  }
  return href;
}
