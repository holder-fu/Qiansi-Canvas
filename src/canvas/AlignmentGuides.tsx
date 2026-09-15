import { useStore } from '@xyflow/react';
import type { Guide } from './snap';

interface Props {
  guides: Guide[];
}

export function AlignmentGuides({ guides }: Props) {
  const transform = useStore((s) => s.transform);
  const [tx, ty, zoom] = transform;

  if (guides.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {guides.map((g, i) => {
        if (g.direction === 'vertical') {
          const x = g.position * zoom + tx;
          const y = g.start * zoom + ty;
          const h = (g.end - g.start) * zoom;
          return (
            <div
              key={`v-${i}`}
              className="absolute border-l border-dashed border-white/40"
              style={{ left: x, top: y, height: h }}
            />
          );
        }
        const y = g.position * zoom + ty;
        const x = g.start * zoom + tx;
        const w = (g.end - g.start) * zoom;
        return (
          <div
            key={`h-${i}`}
            className="absolute border-t border-dashed border-white/40"
            style={{ left: x, top: y, width: w }}
          />
        );
      })}
    </div>
  );
}
