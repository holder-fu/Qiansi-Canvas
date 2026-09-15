const AUDIO_MIME_EXTENSION_ENTRIES = [
  ['audio/mpeg', '.mp3'],
  ['audio/mp3', '.mp3'],
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
  ['audio/ogg', '.ogg'],
  ['audio/mp4', '.m4a'],
  ['audio/webm', '.webm'],
  ['audio/flac', '.flac'],
  ['audio/x-flac', '.flac'],
];

export const AUDIO_ASSET_MIME_EXTENSIONS = new Map(AUDIO_MIME_EXTENSION_ENTRIES);
export const AUDIO_FILE_SIGNATURE_SCAN_BYTES = 1024 * 1024;

const EBML_HEADER_ID = 0x1a45dfa3;
const EBML_DOC_TYPE_ID = 0x4282;
const EBML_SEGMENT_ID = 0x18538067;
const EBML_TRACKS_ID = 0x1654ae6b;
const EBML_TRACK_ENTRY_ID = 0xae;
const EBML_TRACK_TYPE_ID = 0x83;

function normalizedMimeType(value) {
  return String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

export function audioExtensionForMime(mime) {
  return AUDIO_ASSET_MIME_EXTENSIONS.get(normalizedMimeType(mime)) || '';
}

/**
 * Read the end timestamp from one `ffprobe -of csv=p=0` packet row.
 * MediaRecorder WebM files commonly omit container and stream duration metadata,
 * while their packet timestamps remain authoritative.
 */
export function ffprobePacketEndSeconds(line) {
  const [timestampRaw = '', durationRaw = ''] = String(line || '')
    .trim()
    .split(',', 2);
  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) return 0;
  const packetDuration = Number(durationRaw);
  const end =
    timestamp + (Number.isFinite(packetDuration) && packetDuration > 0 ? packetDuration : 0);
  return Number.isFinite(end) && end > 0 ? end : 0;
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function byteView(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array();
}

function readEbmlId(bytes, offset) {
  const first = bytes[offset];
  if (!first) return null;
  let length = 1;
  let marker = 0x80;
  while (!(first & marker) && length <= 4) {
    marker >>= 1;
    length += 1;
  }
  if (length > 4 || offset + length > bytes.length) return null;
  let value = 0;
  for (let index = 0; index < length; index += 1) value = value * 256 + bytes[offset + index];
  return { length, value };
}

function readEbmlSize(bytes, offset) {
  const first = bytes[offset];
  if (!first) return null;
  let length = 1;
  let marker = 0x80;
  while (!(first & marker) && length <= 8) {
    marker >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > bytes.length) return null;
  let value = BigInt(first & (marker - 1));
  let unknown = (first & (marker - 1)) === marker - 1;
  for (let index = 1; index < length; index += 1) {
    const byte = bytes[offset + index];
    value = value * 256n + BigInt(byte);
    unknown = unknown && byte === 0xff;
  }
  return {
    length,
    value: unknown
      ? null
      : value > BigInt(Number.MAX_SAFE_INTEGER)
        ? Number.MAX_SAFE_INTEGER
        : Number(value),
  };
}

function readEbmlElement(bytes, offset, limit = bytes.length) {
  const id = readEbmlId(bytes, offset);
  if (!id) return null;
  const size = readEbmlSize(bytes, offset + id.length);
  if (!size) return null;
  const dataStart = offset + id.length + size.length;
  if (dataStart > limit) return null;
  const dataEnd = size.value === null ? limit : Math.min(limit, dataStart + size.value);
  return { id: id.value, dataStart, dataEnd, nextOffset: dataEnd };
}

function directEbmlChildren(bytes, start, end) {
  const children = [];
  let offset = start;
  while (offset < end) {
    const element = readEbmlElement(bytes, offset, end);
    if (!element || element.nextOffset <= offset) break;
    children.push(element);
    offset = element.nextOffset;
  }
  return children;
}

function ebmlUnsignedInteger(bytes, start, end) {
  if (end <= start || end - start > 8) return null;
  let value = 0;
  for (let offset = start; offset < end; offset += 1) value = value * 256 + bytes[offset];
  return value;
}

function webmTrackKinds(value) {
  const bytes = byteView(value);
  const header = readEbmlElement(bytes, 0);
  if (!header || header.id !== EBML_HEADER_ID) return null;
  const docType = directEbmlChildren(bytes, header.dataStart, header.dataEnd).find(
    (element) => element.id === EBML_DOC_TYPE_ID,
  );
  const docTypeLength = docType ? docType.dataEnd - docType.dataStart : 0;
  if (
    !docType ||
    docTypeLength !== 4 ||
    ascii(bytes, docType.dataStart, docTypeLength).toLowerCase() !== 'webm'
  ) {
    return null;
  }

  const segment = directEbmlChildren(bytes, header.nextOffset, bytes.length).find(
    (element) => element.id === EBML_SEGMENT_ID,
  );
  if (!segment) return null;
  const tracks = directEbmlChildren(bytes, segment.dataStart, segment.dataEnd).find(
    (element) => element.id === EBML_TRACKS_ID,
  );
  if (!tracks) return { audio: false, video: false };

  const trackTypes = directEbmlChildren(bytes, tracks.dataStart, tracks.dataEnd)
    .filter((element) => element.id === EBML_TRACK_ENTRY_ID)
    .flatMap((entry) =>
      directEbmlChildren(bytes, entry.dataStart, entry.dataEnd)
        .filter((element) => element.id === EBML_TRACK_TYPE_ID)
        .map((element) => ebmlUnsignedInteger(bytes, element.dataStart, element.dataEnd)),
    );
  return {
    audio: trackTypes.includes(2),
    video: trackTypes.includes(1),
  };
}

export function hasWebmFileSignature(value) {
  const bytes = byteView(value);
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  );
}

export function isAudioOnlyWebmFile(value) {
  const tracks = webmTrackKinds(value);
  return Boolean(tracks?.audio && !tracks.video);
}

export function detectedAudioFileFormat(value) {
  const bytes = byteView(value);
  if (bytes.byteLength < 4) return null;
  if (hasWebmFileSignature(bytes)) {
    return isAudioOnlyWebmFile(bytes) ? { extension: '.weba', mime: 'audio/webm' } : null;
  }
  if (ascii(bytes, 0, 4) === 'OggS') return { extension: '.ogg', mime: 'audio/ogg' };
  if (ascii(bytes, 0, 4) === 'fLaC') return { extension: '.flac', mime: 'audio/flac' };
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') {
    return { extension: '.wav', mime: 'audio/wav' };
  }
  if (bytes.byteLength >= 8 && ascii(bytes, 4, 4) === 'ftyp') {
    return { extension: '.m4a', mime: 'audio/mp4' };
  }
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { extension: '.mp3', mime: 'audio/mpeg' };
  }
  return null;
}

export function detectedAudioFileExtension(value) {
  return detectedAudioFileFormat(value)?.extension || '';
}

/**
 * Resolve an explicitly audio-bound asset upload. Byte signatures win over browser MIME labels;
 * video/webm is accepted only when the WebM track table proves that no video track is present.
 */
export function resolveAudioAssetUploadFormat(declaredMime, value) {
  const detected = detectedAudioFileFormat(value);
  if (detected) return detected;
  if (hasWebmFileSignature(value)) return null;

  const mimeExtension = audioExtensionForMime(declaredMime);
  if (!mimeExtension) return null;
  const extension = mimeExtension === '.webm' ? '.weba' : mimeExtension;
  return { extension, mime: generatedOutputAudioMime(extension) };
}

/**
 * Generated audio uses .weba for WebM so /output can distinguish it from video WebM
 * and return audio/webm without relying on mutable sidecar metadata.
 */
export function generatedAudioFileExtension(source, mime, bytes) {
  const detectedExtension = detectedAudioFileExtension(bytes);
  if (detectedExtension) return detectedExtension;
  const mimeExtension = audioExtensionForMime(mime);
  if (mimeExtension === '.webm') return '.weba';
  if (mimeExtension) return mimeExtension;

  try {
    const pathname = new URL(source).pathname;
    const fileName = pathname.slice(pathname.lastIndexOf('/') + 1);
    const sourceExtension = fileName.includes('.')
      ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
      : '';
    if (sourceExtension === '.webm' || sourceExtension === '.weba') return '.weba';
    if (sourceExtension === '.mp4') return '.m4a';
    if (sourceExtension === '.mpeg') return '.mp3';
    if (sourceExtension === '.wave') return '.wav';
    if (sourceExtension === '.oga') return '.ogg';
    if (['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(sourceExtension)) {
      return sourceExtension;
    }
  } catch {
    /* use the established audio fallback when neither MIME nor URL identifies the format */
  }
  return '.mp3';
}

export function generatedOutputAudioMime(extension) {
  return (
    {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.weba': 'audio/webm',
      '.flac': 'audio/flac',
    }[String(extension || '').toLowerCase()] || ''
  );
}
