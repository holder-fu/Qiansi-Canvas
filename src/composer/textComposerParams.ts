/** Remove retired text-composer controls from both new and persisted node state. */
export function sanitizeTextComposerParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = { ...params };
  delete sanitized.maxLength;
  delete sanitized.temperature;
  return sanitized;
}
