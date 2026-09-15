type Point = { x: number; y: number };

type ScreenToFlowPosition = (point: Point) => Point;

let activeScreenToFlowPosition: ScreenToFlowPosition | null = null;

export function registerCanvasScreenToFlowPosition(project: ScreenToFlowPosition) {
  activeScreenToFlowPosition = project;
  return () => {
    if (activeScreenToFlowPosition === project) activeScreenToFlowPosition = null;
  };
}

export function centeredCanvasNodePosition(
  size: { width: number; height: number },
  viewport = { width: window.innerWidth, height: window.innerHeight },
): Point | null {
  if (!activeScreenToFlowPosition) return null;
  const center = activeScreenToFlowPosition({
    x: viewport.width / 2,
    y: viewport.height / 2,
  });
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  };
}
