function visibleReferenceTexts(sources: readonly string[]): string[] {
  return sources.map((source) => source.trim()).filter(Boolean);
}

export function hasImageTextContext(sources: readonly string[]): boolean {
  return visibleReferenceTexts(sources).length > 0;
}

/**
 * Keeps connected reference text read-only in the composer while still submitting it
 * together with the user's optional image instruction.
 */
export function buildImagePromptWithTextContext(
  sources: readonly string[],
  instruction: string,
): string {
  return [...visibleReferenceTexts(sources), instruction.trim()].filter(Boolean).join('\n\n');
}
