export const PANORAMA_MIN_FOV = 35;
export const PANORAMA_MAX_FOV = 95;
export const PANORAMA_MAX_PITCH = 85;

export type PanoramaCapture = {
  blob: Blob;
  width: number;
  height: number;
};

export function clampPanoramaPitch(pitch: number) {
  return Math.max(-PANORAMA_MAX_PITCH, Math.min(PANORAMA_MAX_PITCH, pitch));
}

export function clampPanoramaFov(fov: number) {
  return Math.max(PANORAMA_MIN_FOV, Math.min(PANORAMA_MAX_FOV, fov));
}

export function panoramaLookTarget(yawDegrees: number, pitchDegrees: number) {
  const pitch = clampPanoramaPitch(pitchDegrees);
  const phi = ((90 - pitch) * Math.PI) / 180;
  const theta = (yawDegrees * Math.PI) / 180;
  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  };
}

export function capturePanoramaFrame(
  canvas: HTMLCanvasElement,
  renderCurrentView: () => void,
): Promise<PanoramaCapture> {
  renderCurrentView();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('encode-failed'));
          return;
        }
        resolve({ blob, width: canvas.width, height: canvas.height });
      },
      'image/jpeg',
      0.92,
    );
  });
}
