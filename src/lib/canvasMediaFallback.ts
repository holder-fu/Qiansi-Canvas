const DEFAULT_DATABASE_NAME = 'kitty-canvas-media-fallback';
const DEFAULT_DATABASE_VERSION = 1;
const DEFAULT_OBJECT_STORE_NAME = 'canvas-media';
const RECORD_SCHEMA_VERSION = 1;
const CONTENT_ID_PREFIX = 'canvas-media:sha256:';
const ORIGINAL_REFERENCE_URL_PREFIX = 'qiansi-canvas-media://indexeddb/';
const PREVIEW_REFERENCE_URL_PREFIX = 'qiansi-canvas-media://indexeddb-preview/';
const REFERENCE_SCHEME_PREFIX = 'qiansi-canvas-media:';

export type CanvasMediaFallbackUrlRole = 'original' | 'preview';

export type CanvasMediaFallbackErrorCode =
  | 'indexeddb-unavailable'
  | 'invalid-stable-id'
  | 'invalid-data-url'
  | 'hash-unavailable'
  | 'storage-open-failed'
  | 'storage-read-failed'
  | 'storage-write-failed'
  | 'storage-delete-failed'
  | 'stable-id-conflict'
  | 'media-missing'
  | 'object-url-unavailable'
  | 'verification-failed';

export class CanvasMediaFallbackError extends Error {
  readonly code: CanvasMediaFallbackErrorCode;

  constructor(code: CanvasMediaFallbackErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CanvasMediaFallbackError';
    this.code = code;
  }
}

export interface CanvasMediaFallbackStoredRecord {
  schemaVersion: 1;
  stableId: string;
  blob: Blob;
  byteLength: number;
  mimeType: string;
  sha256: string;
  savedAt: number;
}

export interface CanvasMediaFallbackPointer {
  kind: 'canvas-media-fallback';
  schemaVersion: 1;
  stableId: string;
  byteLength: number;
  mimeType: string;
  sha256: string;
}

export interface CanvasMediaFallbackExpectedMedia {
  byteLength?: number;
  mimeType?: string;
  sha256?: string;
}

export type CanvasMediaFallbackVerificationFailure =
  'missing' | 'invalid-record' | 'size-mismatch' | 'type-mismatch' | 'hash-mismatch';

export type CanvasMediaFallbackVerification =
  | ({ ok: true } & CanvasMediaFallbackPointer)
  | {
      ok: false;
      stableId: string;
      reason: CanvasMediaFallbackVerificationFailure;
    };

/**
 * Small persistence boundary used by the canvas media migrator. Implementations
 * must store the complete record outside localStorage and keep keys isolated by
 * their exact stable id.
 */
export interface CanvasMediaFallbackBackend {
  get(stableId: string): Promise<unknown>;
  put(stableId: string, record: CanvasMediaFallbackStoredRecord): Promise<void>;
  delete(stableId: string): Promise<void>;
}

export type CanvasMediaFallbackDigest = (blob: Blob) => Promise<string>;

export interface CanvasMediaFallbackStoreOptions {
  backend?: CanvasMediaFallbackBackend;
  digest?: CanvasMediaFallbackDigest;
  now?: () => number;
}

export interface CanvasMediaFallbackIndexedDbOptions {
  /** `null` explicitly disables IndexedDB; `undefined` resolves the browser global lazily. */
  factory?: IDBFactory | null;
  databaseName?: string;
  objectStoreName?: string;
}

export interface CanvasMediaFallbackObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface CanvasMediaFallbackObjectUrlLease {
  stableId: string;
  role: CanvasMediaFallbackUrlRole;
  stableUrl: string;
  objectUrl: string;
  release(): void;
}

function fallbackError(
  code: CanvasMediaFallbackErrorCode,
  message: string,
  cause: unknown,
): CanvasMediaFallbackError {
  return cause instanceof CanvasMediaFallbackError
    ? cause
    : new CanvasMediaFallbackError(code, message, cause);
}

function hasControlCharacter(value: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function validateStableId(stableId: string): string {
  if (
    typeof stableId !== 'string' ||
    stableId.length === 0 ||
    stableId.length > 1024 ||
    stableId !== stableId.trim() ||
    hasControlCharacter(stableId)
  ) {
    throw new CanvasMediaFallbackError(
      'invalid-stable-id',
      '画布媒体的稳定 ID 无效，无法安全保存或读取素材。',
    );
  }
  return stableId;
}

function normalizeMimeType(type: string) {
  return type.trim().toLowerCase();
}

function hexFromBytes(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += byte.toString(16).padStart(2, '0');
  return value;
}

export async function digestCanvasMediaBlob(blob: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new CanvasMediaFallbackError(
      'hash-unavailable',
      '当前环境缺少安全摘要能力，无法为画布媒体生成稳定 ID。',
    );
  }

  try {
    const digest = await subtle.digest('SHA-256', await blob.arrayBuffer());
    return hexFromBytes(new Uint8Array(digest));
  } catch (error) {
    throw fallbackError('hash-unavailable', '无法计算画布媒体的内容摘要，媒体尚未迁移。', error);
  }
}

export async function createCanvasMediaStableId(blob: Blob): Promise<string> {
  return `${CONTENT_ID_PREFIX}${await digestCanvasMediaBlob(blob)}`;
}

/** Stable serializable URL. It identifies media but never embeds or exposes its bytes. */
export function createCanvasMediaFallbackUrl(
  stableId: string,
  role: CanvasMediaFallbackUrlRole = 'original',
): string {
  const prefix = role === 'preview' ? PREVIEW_REFERENCE_URL_PREFIX : ORIGINAL_REFERENCE_URL_PREFIX;
  return `${prefix}${encodeURIComponent(validateStableId(stableId))}`;
}

export function createCanvasMediaFallbackPreviewUrl(stableId: string): string {
  return createCanvasMediaFallbackUrl(stableId, 'preview');
}

export interface CanvasMediaFallbackUrlReference {
  stableId: string;
  role: CanvasMediaFallbackUrlRole;
}

export function parseCanvasMediaFallbackReferenceUrl(
  value: string,
): CanvasMediaFallbackUrlReference | null {
  if (typeof value !== 'string') return null;
  const role: CanvasMediaFallbackUrlRole | undefined = value.startsWith(
    PREVIEW_REFERENCE_URL_PREFIX,
  )
    ? 'preview'
    : value.startsWith(ORIGINAL_REFERENCE_URL_PREFIX)
      ? 'original'
      : undefined;
  if (!role) return null;
  const prefix = role === 'preview' ? PREVIEW_REFERENCE_URL_PREFIX : ORIGINAL_REFERENCE_URL_PREFIX;
  const encodedStableId = value.slice(prefix.length);
  if (!encodedStableId || /[?#]/u.test(encodedStableId)) return null;
  try {
    const stableId = decodeURIComponent(encodedStableId);
    return createCanvasMediaFallbackUrl(stableId, role) === value ? { stableId, role } : null;
  } catch {
    return null;
  }
}

export function parseCanvasMediaFallbackUrl(value: string): string | null {
  const reference = parseCanvasMediaFallbackReferenceUrl(value);
  return reference?.role === 'original' ? reference.stableId : null;
}

export function parseCanvasMediaFallbackPreviewUrl(value: string): string | null {
  const reference = parseCanvasMediaFallbackReferenceUrl(value);
  return reference?.role === 'preview' ? reference.stableId : null;
}

export function isCanvasMediaFallbackUrl(value: string): boolean {
  return parseCanvasMediaFallbackReferenceUrl(value) !== null;
}

export function isCanvasMediaFallbackPreviewUrl(value: string): boolean {
  return parseCanvasMediaFallbackPreviewUrl(value) !== null;
}

function bytesFromPercentEncodedData(payload: string) {
  const bytes: number[] = [];
  const encoder = new TextEncoder();

  for (let index = 0; index < payload.length;) {
    if (payload[index] === '%') {
      const encodedByte = payload.slice(index + 1, index + 3);
      if (!/^[0-9a-f]{2}$/iu.test(encodedByte)) {
        throw new CanvasMediaFallbackError(
          'invalid-data-url',
          'Data URL 包含无效的百分号编码，媒体尚未迁移。',
        );
      }
      bytes.push(Number.parseInt(encodedByte, 16));
      index += 3;
      continue;
    }

    const codePoint = payload.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    bytes.push(...encoder.encode(character));
    index += character.length;
  }

  return new Uint8Array(bytes);
}

/** Converts both Base64 and percent-encoded Data URLs without fetching them. */
export function canvasMediaDataUrlToBlob(dataUrl: string): Blob {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new CanvasMediaFallbackError(
      'invalid-data-url',
      '画布媒体不是有效的 Data URL，无法迁移到 IndexedDB。',
    );
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 5) {
    throw new CanvasMediaFallbackError(
      'invalid-data-url',
      'Data URL 缺少媒体内容分隔符，无法迁移。',
    );
  }

  const metadata = dataUrl.slice(5, commaIndex);
  const segments = metadata.split(';');
  const base64Index = segments.findIndex((segment) => segment.toLowerCase() === 'base64');
  if (base64Index >= 0 && base64Index !== segments.length - 1) {
    throw new CanvasMediaFallbackError(
      'invalid-data-url',
      'Data URL 的 Base64 标记位置无效，无法迁移。',
    );
  }

  const isBase64 = base64Index >= 0;
  const mediaTypeSegments = isBase64 ? segments.slice(0, -1) : segments;
  const mimeType = mediaTypeSegments.join(';') || 'application/octet-stream';
  const payload = dataUrl.slice(commaIndex + 1);

  try {
    if (!isBase64) return new Blob([bytesFromPercentEncodedData(payload)], { type: mimeType });

    const decodeBase64 = globalThis.atob;
    if (typeof decodeBase64 !== 'function') {
      throw new CanvasMediaFallbackError(
        'invalid-data-url',
        '当前环境无法解码 Base64 Data URL，媒体尚未迁移。',
      );
    }
    const decoded = decodeBase64(payload.replace(/[\t\n\f\r ]/gu, ''));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  } catch (error) {
    throw fallbackError('invalid-data-url', '无法解码画布媒体 Data URL，媒体尚未迁移。', error);
  }
}

function pointerFromRecord(record: CanvasMediaFallbackStoredRecord): CanvasMediaFallbackPointer {
  return {
    kind: 'canvas-media-fallback',
    schemaVersion: RECORD_SCHEMA_VERSION,
    stableId: record.stableId,
    byteLength: record.byteLength,
    mimeType: record.mimeType,
    sha256: record.sha256,
  };
}

function readStoredRecord(
  value: unknown,
  stableId: string,
): CanvasMediaFallbackStoredRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CanvasMediaFallbackStoredRecord>;
  if (
    candidate.schemaVersion !== RECORD_SCHEMA_VERSION ||
    candidate.stableId !== stableId ||
    !(candidate.blob instanceof Blob) ||
    !Number.isSafeInteger(candidate.byteLength) ||
    (candidate.byteLength ?? -1) < 0 ||
    candidate.blob.size !== candidate.byteLength ||
    typeof candidate.mimeType !== 'string' ||
    normalizeMimeType(candidate.blob.type) !== normalizeMimeType(candidate.mimeType) ||
    typeof candidate.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(candidate.sha256) ||
    typeof candidate.savedAt !== 'number' ||
    !Number.isFinite(candidate.savedAt) ||
    candidate.savedAt < 0
  ) {
    return null;
  }
  return candidate as CanvasMediaFallbackStoredRecord;
}

export class CanvasMediaFallbackIndexedDbBackend implements CanvasMediaFallbackBackend {
  private readonly configuredFactory: IDBFactory | null | undefined;
  private readonly databaseName: string;
  private readonly objectStoreName: string;

  constructor(options: CanvasMediaFallbackIndexedDbOptions = {}) {
    this.configuredFactory = options.factory;
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.objectStoreName = options.objectStoreName ?? DEFAULT_OBJECT_STORE_NAME;
  }

  private resolveFactory() {
    const factory =
      this.configuredFactory === undefined ? globalThis.indexedDB : this.configuredFactory;
    if (!factory) {
      throw new CanvasMediaFallbackError(
        'indexeddb-unavailable',
        '当前浏览器不支持 IndexedDB，无法安全迁移画布中的大型媒体。',
      );
    }
    return factory;
  }

  private async openDatabase(): Promise<IDBDatabase> {
    const factory = this.resolveFactory();
    try {
      return await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(this.databaseName, DEFAULT_DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(this.objectStoreName)) {
            database.createObjectStore(this.objectStoreName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error('IndexedDB upgrade is blocked by another application window.'));
      });
    } catch (error) {
      throw fallbackError(
        'storage-open-failed',
        '无法打开画布媒体 IndexedDB，媒体尚未迁移。',
        error,
      );
    }
  }

  async get(stableId: string): Promise<unknown> {
    const database = await this.openDatabase();
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const request = database
          .transaction(this.objectStoreName, 'readonly')
          .objectStore(this.objectStoreName)
          .get(stableId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      throw fallbackError(
        'storage-read-failed',
        '无法读取 IndexedDB 中的画布媒体，原始媒体引用保持不变。',
        error,
      );
    } finally {
      database.close();
    }
  }

  async put(stableId: string, record: CanvasMediaFallbackStoredRecord): Promise<void> {
    const database = await this.openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(this.objectStoreName, 'readwrite');
        const request = transaction.objectStore(this.objectStoreName).put(record, stableId);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } catch (error) {
      throw fallbackError(
        'storage-write-failed',
        '无法把画布媒体写入 IndexedDB，原始 Data URL 尚未删除。',
        error,
      );
    } finally {
      database.close();
    }
  }

  async delete(stableId: string): Promise<void> {
    const database = await this.openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(this.objectStoreName, 'readwrite');
        const request = transaction.objectStore(this.objectStoreName).delete(stableId);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } catch (error) {
      throw fallbackError('storage-delete-failed', '无法删除 IndexedDB 中的画布媒体。', error);
    } finally {
      database.close();
    }
  }
}

export class CanvasMediaFallbackStore {
  private readonly backend: CanvasMediaFallbackBackend;
  private readonly digest: CanvasMediaFallbackDigest;
  private readonly now: () => number;

  constructor(options: CanvasMediaFallbackStoreOptions = {}) {
    this.backend = options.backend ?? new CanvasMediaFallbackIndexedDbBackend();
    this.digest = options.digest ?? digestCanvasMediaBlob;
    this.now = options.now ?? Date.now;
  }

  async persist(blob: Blob, requestedStableId?: string): Promise<CanvasMediaFallbackPointer> {
    const sha256 = await this.digest(blob);
    const stableId = validateStableId(
      requestedStableId ?? `${CONTENT_ID_PREFIX}${sha256.toLowerCase()}`,
    );
    const mimeType = normalizeMimeType(blob.type);
    const record: CanvasMediaFallbackStoredRecord = {
      schemaVersion: RECORD_SCHEMA_VERSION,
      stableId,
      blob,
      byteLength: blob.size,
      mimeType,
      sha256: sha256.toLowerCase(),
      savedAt: this.now(),
    };

    let existing: unknown;
    try {
      existing = await this.backend.get(stableId);
    } catch (error) {
      throw fallbackError(
        'storage-read-failed',
        '保存前无法检查画布媒体的稳定 ID，媒体尚未迁移。',
        error,
      );
    }

    const existingRecord = readStoredRecord(existing, stableId);
    if (existingRecord) {
      const existingVerification = await this.verify(stableId);
      if (existingVerification.ok && existingVerification.sha256 === record.sha256) {
        return pointerFromRecord(existingRecord);
      }
      if (existingVerification.ok) {
        throw new CanvasMediaFallbackError(
          'stable-id-conflict',
          '该画布媒体稳定 ID 已指向另一份原始文件，已阻止覆盖以避免参考图错位。',
        );
      }
    }

    try {
      await this.backend.put(stableId, record);
    } catch (error) {
      throw fallbackError(
        'storage-write-failed',
        '无法保存画布媒体，原始 Data URL 尚未删除。',
        error,
      );
    }

    const verification = await this.verify(stableId, pointerFromRecord(record));
    if (!verification.ok) {
      throw new CanvasMediaFallbackError(
        'verification-failed',
        `画布媒体写入后校验失败（${verification.reason}），原始 Data URL 尚未删除。`,
      );
    }
    return pointerFromRecord(record);
  }

  async load(stableId: string): Promise<Blob | null> {
    const validStableId = validateStableId(stableId);
    let value: unknown;
    try {
      value = await this.backend.get(validStableId);
    } catch (error) {
      throw fallbackError('storage-read-failed', '无法读取 IndexedDB 中的画布媒体。', error);
    }
    if (value === undefined || value === null) return null;

    const record = readStoredRecord(value, validStableId);
    if (!record) {
      throw new CanvasMediaFallbackError(
        'verification-failed',
        'IndexedDB 中的画布媒体记录不完整，已阻止使用错误素材。',
      );
    }
    return record.blob;
  }

  async verify(
    stableId: string,
    expected: CanvasMediaFallbackExpectedMedia = {},
  ): Promise<CanvasMediaFallbackVerification> {
    const validStableId = validateStableId(stableId);
    let value: unknown;
    try {
      value = await this.backend.get(validStableId);
    } catch (error) {
      throw fallbackError('storage-read-failed', '无法验证 IndexedDB 中的画布媒体。', error);
    }
    if (value === undefined || value === null) {
      return { ok: false, stableId: validStableId, reason: 'missing' };
    }

    const record = readStoredRecord(value, validStableId);
    if (!record) return { ok: false, stableId: validStableId, reason: 'invalid-record' };
    if (expected.byteLength !== undefined && record.byteLength !== expected.byteLength) {
      return { ok: false, stableId: validStableId, reason: 'size-mismatch' };
    }
    if (
      expected.mimeType !== undefined &&
      record.mimeType !== normalizeMimeType(expected.mimeType)
    ) {
      return { ok: false, stableId: validStableId, reason: 'type-mismatch' };
    }

    const actualSha256 = (await this.digest(record.blob)).toLowerCase();
    if (
      actualSha256 !== record.sha256 ||
      (expected.sha256 !== undefined && actualSha256 !== expected.sha256.toLowerCase())
    ) {
      return { ok: false, stableId: validStableId, reason: 'hash-mismatch' };
    }
    return { ok: true, ...pointerFromRecord(record) };
  }

  async delete(stableId: string): Promise<boolean> {
    const validStableId = validateStableId(stableId);
    let existing: unknown;
    try {
      existing = await this.backend.get(validStableId);
    } catch (error) {
      throw fallbackError('storage-read-failed', '删除前无法读取 IndexedDB 中的画布媒体。', error);
    }
    if (existing === undefined || existing === null) return false;

    try {
      await this.backend.delete(validStableId);
    } catch (error) {
      throw fallbackError('storage-delete-failed', '无法删除 IndexedDB 中的画布媒体。', error);
    }

    let remaining: unknown;
    try {
      remaining = await this.backend.get(validStableId);
    } catch (error) {
      throw fallbackError('storage-read-failed', '删除后无法验证 IndexedDB 中的画布媒体。', error);
    }
    if (remaining !== undefined && remaining !== null) {
      throw new CanvasMediaFallbackError(
        'verification-failed',
        'IndexedDB 报告删除完成，但媒体记录仍然存在。',
      );
    }
    return true;
  }
}

const defaultStore = new CanvasMediaFallbackStore();

interface RuntimeObjectUrlEntry {
  objectUrl: string;
  references: number;
}

/**
 * Resolves serializable fallback URLs to session-only Blob URLs. Blob URLs are
 * deliberately kept inside this registry and must never be written to a canvas
 * snapshot. A lease revokes the URL after its last consumer releases it.
 */
export class CanvasMediaFallbackObjectUrlRegistry {
  private readonly store: CanvasMediaFallbackStore;
  private readonly urlApi: CanvasMediaFallbackObjectUrlApi;
  private readonly entries = new Map<string, RuntimeObjectUrlEntry>();
  private readonly pending = new Map<string, Promise<RuntimeObjectUrlEntry>>();
  private readonly objectUrlToStableUrl = new Map<string, string>();

  constructor(
    store: CanvasMediaFallbackStore = defaultStore,
    urlApi: CanvasMediaFallbackObjectUrlApi | null = typeof URL.createObjectURL === 'function' &&
    typeof URL.revokeObjectURL === 'function'
      ? URL
      : null,
  ) {
    if (!urlApi) {
      throw new CanvasMediaFallbackError(
        'object-url-unavailable',
        '当前环境无法创建媒体预览地址，IndexedDB 原始文件保持不变。',
      );
    }
    this.store = store;
    this.urlApi = urlApi;
  }

  private referenceFromInput(stableIdOrUrl: string) {
    const parsed = parseCanvasMediaFallbackReferenceUrl(stableIdOrUrl);
    if (parsed)
      return { ...parsed, stableUrl: createCanvasMediaFallbackUrl(parsed.stableId, parsed.role) };
    if (stableIdOrUrl.startsWith(REFERENCE_SCHEME_PREFIX)) {
      throw new CanvasMediaFallbackError(
        'invalid-stable-id',
        '画布媒体引用地址无效，已停止读取以避免原图和缩略图错位。',
      );
    }
    const stableId = validateStableId(stableIdOrUrl);
    return {
      stableId,
      role: 'original' as const,
      stableUrl: createCanvasMediaFallbackUrl(stableId),
    };
  }

  private async createEntry(reference: ReturnType<typeof this.referenceFromInput>) {
    const blob = await this.store.load(reference.stableId);
    if (!blob) {
      throw new CanvasMediaFallbackError(
        'media-missing',
        'IndexedDB 中找不到该画布媒体，已阻止用缩略图替代原始文件。',
      );
    }
    const objectUrl = this.urlApi.createObjectURL(blob);
    const entry = { objectUrl, references: 0 };
    this.entries.set(reference.stableUrl, entry);
    this.objectUrlToStableUrl.set(objectUrl, reference.stableUrl);
    return entry;
  }

  async acquire(stableIdOrUrl: string): Promise<CanvasMediaFallbackObjectUrlLease> {
    const reference = this.referenceFromInput(stableIdOrUrl);
    let entry = this.entries.get(reference.stableUrl);
    if (!entry) {
      let pendingEntry = this.pending.get(reference.stableUrl);
      if (!pendingEntry) {
        pendingEntry = this.createEntry(reference).finally(() =>
          this.pending.delete(reference.stableUrl),
        );
        this.pending.set(reference.stableUrl, pendingEntry);
      }
      entry = await pendingEntry;
    }
    entry.references += 1;

    let released = false;
    return {
      stableId: reference.stableId,
      role: reference.role,
      stableUrl: reference.stableUrl,
      objectUrl: entry.objectUrl,
      release: () => {
        if (released) return;
        released = true;
        this.release(reference.stableUrl);
      },
    };
  }

  stableUrlForObjectUrl(objectUrl: string): string | null {
    return this.objectUrlToStableUrl.get(objectUrl) ?? null;
  }

  release(stableIdOrUrl: string): void {
    const reference = this.referenceFromInput(stableIdOrUrl);
    const entry = this.entries.get(reference.stableUrl);
    if (!entry) return;
    entry.references = Math.max(0, entry.references - 1);
    if (entry.references > 0) return;

    this.entries.delete(reference.stableUrl);
    this.objectUrlToStableUrl.delete(entry.objectUrl);
    this.urlApi.revokeObjectURL(entry.objectUrl);
  }

  dispose(): void {
    for (const entry of this.entries.values()) this.urlApi.revokeObjectURL(entry.objectUrl);
    this.entries.clear();
    this.pending.clear();
    this.objectUrlToStableUrl.clear();
  }
}

export function isCanvasMediaFallbackAvailable(factory = globalThis.indexedDB): boolean {
  return Boolean(factory && typeof factory.open === 'function');
}

export function persistCanvasMediaFallback(
  blob: Blob,
  stableId?: string,
): Promise<CanvasMediaFallbackPointer> {
  return defaultStore.persist(blob, stableId);
}

export function loadCanvasMediaFallback(stableId: string): Promise<Blob | null> {
  return defaultStore.load(stableId);
}

export function verifyCanvasMediaFallback(
  stableId: string,
  expected: CanvasMediaFallbackExpectedMedia = {},
): Promise<CanvasMediaFallbackVerification> {
  return defaultStore.verify(stableId, expected);
}

export function deleteCanvasMediaFallback(stableId: string): Promise<boolean> {
  return defaultStore.delete(stableId);
}
