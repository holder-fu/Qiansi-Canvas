export type EdgePoint = { x: number; y: number };

function squaredDistance(left: EdgePoint, right: EdgePoint) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

/**
 * Find the point on an SVG path closest to the pointer. A short coarse scan is
 * followed by a local refinement, keeping pointermove work bounded to one edge.
 */
export function nearestPointOnPath(
  pointer: EdgePoint,
  pathLength: number,
  pointAtLength: (length: number) => EdgePoint,
  sampleCount = 32,
): EdgePoint {
  if (!Number.isFinite(pathLength) || pathLength <= 0) return pointer;
  const samples = Math.max(8, Math.floor(sampleCount));
  const sampleStep = pathLength / samples;
  let bestLength = 0;
  let bestPoint = pointAtLength(0);
  let bestDistance = squaredDistance(pointer, bestPoint);

  for (let index = 1; index <= samples; index += 1) {
    const length = Math.min(pathLength, index * sampleStep);
    const point = pointAtLength(length);
    const distance = squaredDistance(pointer, point);
    if (distance < bestDistance) {
      bestLength = length;
      bestPoint = point;
      bestDistance = distance;
    }
  }

  let low = Math.max(0, bestLength - sampleStep);
  let high = Math.min(pathLength, bestLength + sampleStep);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const firstLength = low + (high - low) / 3;
    const secondLength = high - (high - low) / 3;
    const firstPoint = pointAtLength(firstLength);
    const secondPoint = pointAtLength(secondLength);
    if (squaredDistance(pointer, firstPoint) <= squaredDistance(pointer, secondPoint)) {
      high = secondLength;
    } else {
      low = firstLength;
    }
  }

  const refinedPoint = pointAtLength((low + high) / 2);
  return squaredDistance(pointer, refinedPoint) < bestDistance ? refinedPoint : bestPoint;
}
