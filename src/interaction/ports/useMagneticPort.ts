import { useEffect, useRef, useState, useCallback } from 'react';
import type { Position } from '@xyflow/react';
import { calculateMagnet, getRestPosition, type MagnetResult } from './portMagnet';

interface UseMagneticPortOptions {
  nodeRef: React.RefObject<HTMLElement | null>;
  position: Position;
  offset?: number;
  /** Distance outside the node border used as the magnetic rest point. */
  outsideOffsetPx?: number;
  enabled: boolean;
  zoom: number;
}

export function useMagneticPort({
  nodeRef,
  position,
  offset,
  outsideOffsetPx,
  enabled,
  zoom,
}: UseMagneticPortOptions) {
  const [result, setResult] = useState<MagnetResult>({
    state: 'idle',
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    visible: false,
  });

  const rafRef = useRef<number | null>(null);
  const wasVisibleRef = useRef(false);

  const update = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const rest = getRestPosition(
      position,
      rect.width / zoom,
      rect.height / zoom,
      zoom,
      offset,
      outsideOffsetPx,
    );
    const restScreenX = rect.left + rest.x * zoom;
    const restScreenY = rect.top + rest.y * zoom;

    const mouse = getLatestMouse();
    const next = calculateMagnet(restScreenX, restScreenY, mouse.x, mouse.y, wasVisibleRef.current);

    wasVisibleRef.current = next.visible;
    setResult(next);
  }, [nodeRef, position, offset, outsideOffsetPx, zoom]);

  useEffect(() => {
    if (!enabled) {
      setResult({ state: 'idle', offsetX: 0, offsetY: 0, scale: 1, visible: false });
      wasVisibleRef.current = false;
      return;
    }

    const onMove = (e: MouseEvent) => {
      setMouse(e.clientX, e.clientY);
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        update();
      });
    };

    const onLeave = () => {
      setMouse(-Infinity, -Infinity);
      update();
    };

    update();

    window.addEventListener('mousemove', onMove);
    window.addEventListener('blur', onLeave);
    document.addEventListener('mouseleave', onLeave);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('blur', onLeave);
      document.removeEventListener('mouseleave', onLeave);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, update]);

  return result;
}

// Simple global mouse tracker so every magnetic port reads the same value
// without re-rendering the whole tree.
let latestMouse = { x: -Infinity, y: -Infinity };

function setMouse(x: number, y: number) {
  latestMouse = { x, y };
}

function getLatestMouse() {
  return latestMouse;
}
