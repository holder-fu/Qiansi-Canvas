import { useState } from 'react';
import { ImageOff } from 'lucide-react';

export interface EffectWebpPreviewProps {
  src?: string;
  fallback?: string;
  /** @deprecated Legacy name retained for source compatibility. */
  poster?: string;
  title: string;
  className?: string;
}

/** Animated WebP playback is native to <img>; no video decoder or hover lifecycle is needed. */
export function EffectWebpPreview({
  src,
  fallback,
  poster,
  title,
  className,
}: EffectWebpPreviewProps) {
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set());
  const primarySource = src?.trim();
  const fallbackSource = fallback?.trim() || poster?.trim();
  const imageSource = [primarySource, fallbackSource].find((candidate): candidate is string =>
    Boolean(candidate && !failedSources.has(candidate)),
  );
  const rootClassName = ['relative isolate h-full w-full overflow-hidden bg-black', className]
    .filter(Boolean)
    .join(' ');

  if (!imageSource) {
    return (
      <div className={rootClassName} role="img" aria-label={title}>
        <div
          className="flex h-full w-full items-center justify-center bg-white/[0.03] text-white/25"
          aria-hidden="true"
        >
          <ImageOff className="h-9 w-9" />
        </div>
      </div>
    );
  }

  return (
    <div className={rootClassName}>
      <img
        src={imageSource}
        alt={title}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover"
        onError={() =>
          setFailedSources((current) => {
            const next = new Set(current);
            next.add(imageSource);
            return next;
          })
        }
      />
    </div>
  );
}

/** @deprecated Compatibility export for callers outside the app bundle. */
export const EffectVideoPreview = EffectWebpPreview;
