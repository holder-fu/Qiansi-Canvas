import { BRIDGE_BASE_URL, resolveBridgeUrl } from '../lib/bridgeUrl';
import type { GenerationSoundKind } from '../store/canvasPreferences';

export type GenerationSoundItem = {
  name: string;
  size: number;
  modifiedAt: number;
};

export type GenerationSoundCatalog = {
  directory: string;
  items: GenerationSoundItem[];
};

export async function loadGenerationSoundCatalog(): Promise<GenerationSoundCatalog> {
  const response = await fetch(`${BRIDGE_BASE_URL}/notification-sounds`);
  const body = (await response.json().catch(() => ({}))) as {
    directory?: unknown;
    items?: unknown;
    error?: { message?: unknown };
  };
  if (!response.ok || typeof body.directory !== 'string' || !Array.isArray(body.items)) {
    throw new Error(
      typeof body.error?.message === 'string' ? body.error.message : '提示音目录读取失败。',
    );
  }
  return {
    directory: body.directory,
    items: body.items.filter(
      (item): item is GenerationSoundItem =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as GenerationSoundItem).name === 'string' &&
        typeof (item as GenerationSoundItem).size === 'number' &&
        typeof (item as GenerationSoundItem).modifiedAt === 'number',
    ),
  };
}

function fileUrl(name: string) {
  return resolveBridgeUrl(`/notification-sounds/file?name=${encodeURIComponent(name)}`);
}

export async function playGenerationCompleteSound(name: string, volume: number) {
  if (typeof Audio === 'undefined' || !name || volume <= 0) return false;
  const audio = new Audio(fileUrl(name));
  audio.volume = Math.min(1, Math.max(0, volume));
  try {
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export function soundPreferenceKey(kind: GenerationSoundKind) {
  if (kind === 'video') return 'videoGenerationSound' as const;
  if (kind === 'audio') return 'audioGenerationSound' as const;
  if (kind === 'text') return 'textGenerationSound' as const;
  return 'imageGenerationSound' as const;
}

export function soundEnabledPreferenceKey(kind: GenerationSoundKind) {
  if (kind === 'video') return 'videoGenerationSoundEnabled' as const;
  if (kind === 'audio') return 'audioGenerationSoundEnabled' as const;
  if (kind === 'text') return 'textGenerationSoundEnabled' as const;
  return 'imageGenerationSoundEnabled' as const;
}
