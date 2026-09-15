import { imageEditorSourceCandidates, type ImageEditorSourceFields } from './mediaPreview';

export function imageClipboardSource(data: ImageEditorSourceFields): string | undefined {
  return imageEditorSourceCandidates(data)[0];
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The browser could not encode the image as PNG.')),
      'image/png',
    );
  });
}

async function fetchClipboardPng(source: string): Promise<Blob> {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Image request failed with status ${response.status}.`);

  const sourceBlob = await response.blob();
  if (!sourceBlob.type.startsWith('image/')) {
    throw new Error('The selected node does not contain a readable image.');
  }
  if (sourceBlob.type === 'image/png') return sourceBlob;

  const bitmap = await createImageBitmap(sourceBlob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not prepare the image for copying.');
    context.drawImage(bitmap, 0, 0);
    return await canvasToPngBlob(canvas);
  } finally {
    bitmap.close();
  }
}

/** Write image pixels, rather than the source URL, to the operating-system clipboard. */
export function copyImageSourceToClipboard(source: string): Promise<void> {
  if (typeof ClipboardItem !== 'function' || !navigator.clipboard?.write) {
    return Promise.reject(new Error('Image clipboard writing is not supported.'));
  }

  // Pass a pending Blob into ClipboardItem and call write synchronously while
  // the click still owns browser user activation. Fetching/conversion may then
  // complete without losing clipboard permission.
  const pngBlob = fetchClipboardPng(source);
  const item = new ClipboardItem({ 'image/png': pngBlob });
  return navigator.clipboard.write([item]);
}
