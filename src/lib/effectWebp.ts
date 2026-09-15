export interface AnimatedWebpInfo {
  width: number;
  height: number;
  animated: true;
}

const RIFF = 0x46464952;
const WEBP = 0x50424557;

function asciiFourCc(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

function webpCanvasSize(view: DataView) {
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunk = asciiFourCc(view, offset);
    const length = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (dataOffset + length > view.byteLength) break;
    // VP8X stores the canvas size as two 24-bit little-endian values minus one.
    if (chunk === 0x58385056 && length >= 10) {
      const width =
        1 +
        view.getUint8(dataOffset + 4) +
        (view.getUint8(dataOffset + 5) << 8) +
        (view.getUint8(dataOffset + 6) << 16);
      const height =
        1 +
        view.getUint8(dataOffset + 7) +
        (view.getUint8(dataOffset + 8) << 8) +
        (view.getUint8(dataOffset + 9) << 16);
      return { width, height };
    }
    offset = dataOffset + length + (length % 2);
  }
  return;
}

/** Validate the real file signature instead of trusting the extension or MIME. */
export async function inspectAnimatedWebp(file: Blob): Promise<AnimatedWebpInfo> {
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength < 20) throw new Error('文件不是有效的 WebP 图片。');
  const view = new DataView(bytes);
  if (asciiFourCc(view, 0) !== RIFF || asciiFourCc(view, 8) !== WEBP) {
    throw new Error('特效只支持 WebP 文件。');
  }

  let offset = 12;
  let animated = false;
  while (offset + 8 <= view.byteLength) {
    const chunk = asciiFourCc(view, offset);
    const length = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (dataOffset + length > view.byteLength) {
      throw new Error('WebP 文件结构已损坏。');
    }
    if (chunk === 0x4d494e41 || chunk === 0x464d4e41) animated = true; // ANIM / ANMF
    offset = dataOffset + length + (length % 2);
  }
  if (!animated) throw new Error('该文件是静态 WebP；特效库需要包含动画帧的动态 WebP。');

  const size = webpCanvasSize(view);
  if (!size || size.width <= 0 || size.height <= 0) {
    throw new Error('无法读取动态 WebP 的画布尺寸。');
  }
  return { ...size, animated: true };
}
