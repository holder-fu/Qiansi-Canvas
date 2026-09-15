import type { ComposerReference } from './types';

export const COMPOSER_REFERENCE_SUBMISSION_VERSION = 1 as const;

export interface ComposerReferenceSubmission {
  version: typeof COMPOSER_REFERENCE_SUBMISSION_VERSION;
  references: ComposerReference[];
  excludedReferenceIds: string[];
  excludedReferenceUrls: string[];
  /** Direct-upstream text explicitly dismissed from this node's AI context. */
  excludedTextSources: string[];
}

const REFERENCE_TYPES = new Set<ComposerReference['type']>(['image', 'video', 'audio', 'text']);

export function normalizeComposerReferences(value: unknown): ComposerReference[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const references: ComposerReference[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    const type = item.type;
    if (!id || !label || !REFERENCE_TYPES.has(type as ComposerReference['type']) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const role = item.role === 'style' || item.role === 'effect' ? item.role : undefined;
    references.push({
      id,
      label,
      type: type as ComposerReference['type'],
      ...(typeof item.previewUrl === 'string' && item.previewUrl.trim()
        ? { previewUrl: item.previewUrl.trim() }
        : {}),
      ...(typeof item.url === 'string' && item.url.trim() ? { url: item.url.trim() } : {}),
      ...(item.locked === true ? { locked: true } : {}),
      ...(role ? { role } : {}),
      ...(typeof item.stylePrompt === 'string' && item.stylePrompt.trim()
        ? { stylePrompt: item.stylePrompt.trim() }
        : {}),
      ...(role === 'effect' && typeof item.effectPresetId === 'string' && item.effectPresetId.trim()
        ? { effectPresetId: item.effectPresetId.trim() }
        : {}),
      ...(typeof item.effectPrompt === 'string' && item.effectPrompt.trim()
        ? { effectPrompt: item.effectPrompt.trim() }
        : {}),
    });
  }
  return references;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && !!item))];
}

export function parseComposerReferenceSubmission(
  value: unknown,
): ComposerReferenceSubmission | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (item.version !== COMPOSER_REFERENCE_SUBMISSION_VERSION) return null;
  return {
    version: COMPOSER_REFERENCE_SUBMISSION_VERSION,
    references: normalizeComposerReferences(item.references),
    excludedReferenceIds: stringList(item.excludedReferenceIds),
    excludedReferenceUrls: stringList(item.excludedReferenceUrls),
    excludedTextSources: [
      ...new Set(
        stringList(item.excludedTextSources)
          .map((source) => source.trim())
          .filter(Boolean),
      ),
    ],
  };
}

/**
 * Capture the exact reference set visible when the user submits. Previous exclusions are
 * retained so an upstream edge does not silently re-enable a reference on the next render.
 */
export function buildComposerReferenceSubmission(
  initialReferences: unknown,
  submittedReferences: unknown,
  previousSubmission?: unknown,
): ComposerReferenceSubmission {
  const initial = normalizeComposerReferences(initialReferences);
  const submitted = normalizeComposerReferences(submittedReferences);
  const previous = parseComposerReferenceSubmission(previousSubmission);
  const submittedIds = new Set(submitted.map((reference) => reference.id));
  const submittedUrls = new Set(
    submitted.flatMap((reference) => (reference.url ? [reference.url] : [])),
  );
  const removed = initial.filter((reference) => !submittedIds.has(reference.id));

  return {
    version: COMPOSER_REFERENCE_SUBMISSION_VERSION,
    references: submitted,
    excludedReferenceIds: [
      ...new Set([
        ...(previous?.excludedReferenceIds ?? []).filter((id) => !submittedIds.has(id)),
        ...removed.map((reference) => reference.id),
      ]),
    ],
    excludedReferenceUrls: [
      ...new Set([
        ...(previous?.excludedReferenceUrls ?? []).filter((url) => !submittedUrls.has(url)),
        ...removed.flatMap((reference) => (reference.url ? [reference.url] : [])),
      ]),
    ],
    excludedTextSources: previous?.excludedTextSources ?? [],
  };
}

/** Persistently dismiss the currently visible upstream text without deleting its graph edge. */
export function excludeTextSourcesFromSubmission(
  rawSubmission: unknown,
  sources: readonly string[],
): ComposerReferenceSubmission {
  const previous = parseComposerReferenceSubmission(rawSubmission);
  return {
    version: COMPOSER_REFERENCE_SUBMISSION_VERSION,
    references: previous?.references ?? [],
    excludedReferenceIds: previous?.excludedReferenceIds ?? [],
    excludedReferenceUrls: previous?.excludedReferenceUrls ?? [],
    excludedTextSources: [
      ...new Set([
        ...(previous?.excludedTextSources ?? []),
        ...sources.map((source) => source.trim()).filter(Boolean),
      ]),
    ],
  };
}

export function filterExcludedTextSources(
  sources: readonly unknown[] | undefined,
  rawSubmission: unknown,
): string[] {
  const normalized = (sources ?? [])
    .filter((source): source is string => typeof source === 'string')
    .map((source) => source.trim())
    .filter(Boolean);
  const submission = parseComposerReferenceSubmission(rawSubmission);
  if (!submission?.excludedTextSources.length) return normalized;
  const excluded = new Set(submission.excludedTextSources);
  return normalized.filter((source) => !excluded.has(source));
}

export function buildComposerReferencePatch(
  initialReferences: unknown,
  submittedReferences: unknown,
  previousSubmission?: unknown,
): {
  composerReferences: ComposerReference[];
  composerReferenceSubmission: ComposerReferenceSubmission;
} {
  const submission = buildComposerReferenceSubmission(
    initialReferences,
    submittedReferences,
    previousSubmission,
  );
  return {
    composerReferences: submission.references,
    composerReferenceSubmission: submission,
  };
}

/** Filter automatically connected references for Composer display; explicit manual refs can be merged after. */
export function filterExcludedComposerReferences(
  references: unknown,
  rawSubmission: unknown,
): ComposerReference[] {
  const normalized = normalizeComposerReferences(references);
  const submission = parseComposerReferenceSubmission(rawSubmission);
  if (!submission) return normalized;
  const excludedIds = new Set(submission.excludedReferenceIds);
  const excludedUrls = new Set(submission.excludedReferenceUrls);
  return normalized.filter(
    (reference) =>
      !excludedIds.has(reference.id) && (!reference.url || !excludedUrls.has(reference.url)),
  );
}

/** Restore the last explicit thumbnail order while appending newly connected references. */
export function orderComposerReferences(references: unknown, rawSubmission: unknown) {
  const normalized = normalizeComposerReferences(references);
  const preferred = parseComposerReferenceSubmission(rawSubmission)?.references ?? [];
  if (preferred.length === 0) return normalized;
  const ranks = new Map(preferred.map((reference, index) => [reference.id, index]));
  return normalized
    .map((reference, index) => ({ reference, index, rank: ranks.get(reference.id) }))
    .sort((left, right) => {
      if (left.rank == null && right.rank == null) return left.index - right.index;
      if (left.rank == null) return 1;
      if (right.rank == null) return -1;
      return left.rank - right.rank;
    })
    .map(({ reference }) => reference);
}

/** Store-side compatibility helper: preserve every supplied image, except references explicitly removed. */
export function resolveSubmittedReferenceImages(
  upstreamImages: readonly string[],
  rawSubmission: unknown,
  explicitReferences?: unknown,
): string[] {
  const submission = parseComposerReferenceSubmission(rawSubmission);
  const explicit = normalizeComposerReferences(explicitReferences ?? submission?.references);
  const explicitImages = explicit.flatMap((reference) =>
    reference.type === 'image' && reference.url ? [reference.url] : [],
  );
  if (!submission) return [...new Set([...upstreamImages, ...explicitImages])];
  const explicitSet = new Set(explicitImages);
  const excludedUrls = new Set(submission.excludedReferenceUrls);
  return [
    ...new Set([
      ...explicitImages,
      ...upstreamImages.filter((url) => explicitSet.has(url) || !excludedUrls.has(url)),
    ]),
  ];
}

/** Resolve the exact video set visible at submit time, including manual references and removals. */
export function resolveSubmittedReferenceVideos(
  upstreamVideos: readonly string[],
  rawSubmission: unknown,
  explicitReferences?: unknown,
): string[] {
  const submission = parseComposerReferenceSubmission(rawSubmission);
  const explicit = normalizeComposerReferences(explicitReferences ?? submission?.references);
  const explicitVideos = explicit.flatMap((reference) =>
    reference.type === 'video' && reference.url ? [reference.url] : [],
  );
  if (!submission) return [...new Set([...upstreamVideos, ...explicitVideos])];
  const explicitSet = new Set(explicitVideos);
  const excludedUrls = new Set(submission.excludedReferenceUrls);
  return [
    ...new Set([
      ...upstreamVideos.filter((url) => explicitSet.has(url) || !excludedUrls.has(url)),
      ...explicitVideos,
    ]),
  ];
}

/** Resolve the exact audio set visible at submit time, including manual references and removals. */
export function resolveSubmittedReferenceAudios(
  upstreamAudios: readonly string[],
  rawSubmission: unknown,
  explicitReferences?: unknown,
): string[] {
  const submission = parseComposerReferenceSubmission(rawSubmission);
  const explicit = normalizeComposerReferences(explicitReferences ?? submission?.references);
  const explicitAudios = explicit.flatMap((reference) =>
    reference.type === 'audio' && reference.url ? [reference.url] : [],
  );
  if (!submission) return [...new Set([...upstreamAudios, ...explicitAudios])];
  const explicitSet = new Set(explicitAudios);
  const excludedUrls = new Set(submission.excludedReferenceUrls);
  return [
    ...new Set([
      ...upstreamAudios.filter((url) => explicitSet.has(url) || !excludedUrls.has(url)),
      ...explicitAudios,
    ]),
  ];
}
