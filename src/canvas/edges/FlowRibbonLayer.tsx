import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FLOW_RIBBON_SLICE_COUNT, getFlowRibbonMetrics, getRibbonSliceOpacity } from './flowRibbon';

export const FLOW_EDGE_BASE_COLOR = 'rgba(204, 214, 228, 0.78)';
export const FLOW_EDGE_FLOW_COLOR = '#6fb6fa';

const RIBBON_SLICE_INDICES = Array.from({ length: FLOW_RIBBON_SLICE_COUNT }, (_, index) => index);

let reducedMotionStyleInjected = false;
function injectReducedMotionStyle() {
  if (reducedMotionStyleInjected) return;
  reducedMotionStyleInjected = true;
  const style = document.createElement('style');
  style.id = 'flow-edge-motion-style';
  style.textContent = `
    @media (prefers-reduced-motion: reduce) {
      .flow-edge-motion { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

type FlowRibbonLayerProps = {
  path: string;
  fallbackLength: number;
};

/** Shared comet renderer for committed edges and both connection previews. */
export function FlowRibbonLayer({ path, fallbackLength }: FlowRibbonLayerProps) {
  useEffect(() => {
    injectReducedMotionStyle();
  }, []);

  const measurementPathRef = useRef<SVGPathElement>(null);
  const safeFallbackLength = Math.max(1, fallbackLength);
  const [pathLength, setPathLength] = useState(safeFallbackLength);

  useLayoutEffect(() => {
    const measurementPath = measurementPathRef.current;
    let measuredLength = safeFallbackLength;

    if (measurementPath && typeof measurementPath.getTotalLength === 'function') {
      const nextLength = measurementPath.getTotalLength();
      if (Number.isFinite(nextLength) && nextLength > 0) measuredLength = nextLength;
    }

    setPathLength((currentLength) =>
      Math.abs(currentLength - measuredLength) > 0.05 ? measuredLength : currentLength,
    );
  }, [path, safeFallbackLength]);

  const ribbonMetrics = getFlowRibbonMetrics(pathLength);
  const movingFlowDuration = `${ribbonMetrics.cycleSeconds}s`;
  const sliceOverlap = Math.min(0.24, ribbonMetrics.sliceLength * 0.12);
  const sliceDashLength = ribbonMetrics.sliceLength + sliceOverlap;
  const sliceDashGap = ribbonMetrics.pitch - sliceDashLength;

  return (
    <>
      <path ref={measurementPathRef} d={path} fill="none" stroke="none" />
      <g className="flow-edge-motion" style={{ pointerEvents: 'none' }}>
        {RIBBON_SLICE_INDICES.map((index) => {
          const opacity = getRibbonSliceOpacity(index, FLOW_RIBBON_SLICE_COUNT);
          const offsetStart = ribbonMetrics.ribbonLength - index * ribbonMetrics.sliceLength;
          const offsetEnd = offsetStart - ribbonMetrics.pitch;

          return (
            <g key={index} strokeDashoffset={offsetStart}>
              <path
                d={path}
                fill="none"
                stroke="#439bf0"
                strokeWidth={9.5}
                strokeOpacity={opacity * 0.09}
                strokeLinecap="butt"
                strokeDasharray={`${sliceDashLength} ${sliceDashGap}`}
              />
              <path
                d={path}
                fill="none"
                stroke={FLOW_EDGE_FLOW_COLOR}
                strokeWidth={2.7}
                strokeOpacity={opacity}
                strokeLinecap="butt"
                strokeDasharray={`${sliceDashLength} ${sliceDashGap}`}
              />
              <animate
                attributeName="stroke-dashoffset"
                from={offsetStart}
                to={offsetEnd}
                dur={movingFlowDuration}
                calcMode="linear"
                repeatCount="indefinite"
              />
            </g>
          );
        })}

        <g strokeDashoffset={0}>
          <path
            d={path}
            fill="none"
            stroke="#439bf0"
            strokeWidth={9.5}
            strokeOpacity={0.1}
            strokeLinecap="round"
            strokeDasharray={`0 ${ribbonMetrics.pitch}`}
          />
          <path
            d={path}
            fill="none"
            stroke={FLOW_EDGE_FLOW_COLOR}
            strokeWidth={2.7}
            strokeOpacity={0.98}
            strokeLinecap="round"
            strokeDasharray={`0 ${ribbonMetrics.pitch}`}
          />
          <animate
            attributeName="stroke-dashoffset"
            from={0}
            to={-ribbonMetrics.pitch}
            dur={movingFlowDuration}
            calcMode="linear"
            repeatCount="indefinite"
          />
        </g>
      </g>
    </>
  );
}

/** Neutral guide line plus the exact same comet used by FlowEdge. */
export function FlowConnectionPreview({ path, fallbackLength }: FlowRibbonLayerProps) {
  return (
    <>
      <path
        d={path}
        fill="none"
        stroke={FLOW_EDGE_BASE_COLOR}
        strokeWidth={1.35}
        strokeOpacity={0.82}
        style={{ pointerEvents: 'none' }}
      />
      <FlowRibbonLayer path={path} fallbackLength={fallbackLength} />
    </>
  );
}
