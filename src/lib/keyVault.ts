// Client-side AES-256-GCM vault for API keys.
//
// Faithful port of the old canvas "本机加密保险箱" (local-bridge.mjs): the
// provider config stored on disk no longer contains plaintext keys; only a
// sealed vault (per-provider { iv, tag, data }) lives in localStorage,
// encrypted with a device-bound 32-byte master key.
//
// Trust boundary = the local machine, exactly like the old local-bridge key
// file: anyone who can read this browser's localStorage can also read the
// master key, but the provider-config blob by itself is clean ciphertext and
// cannot be grepped for secrets, copied around, or exported in clear text.

const MASTER_KEY_STORAGE = 'kitty-canvas-vault-master-v1';
const VAULT_STORAGE_KEY = 'kitty-canvas-api-vault-v1';
const LEGACY_MASTER_KEY_STORAGE = 'libtv-vault-master-v1';
const LEGACY_VAULT_STORAGE_KEY = 'libtv-api-vault-v1';

type Sealed = { iv: string; tag: string; data: string };
type VaultBlob = Record<string, Sealed>;

// Web Crypto operations are asynchronous. Serializing writes prevents rapid
// input changes from completing out of order and overwriting the newest key.
let vaultWriteTail: Promise<void> = Promise.resolve();

function queueVaultWrite(operation: () => Promise<void>): Promise<void> {
  const queued = vaultWriteTail.then(operation);
  vaultWriteTail = queued.catch(() => {});
  return queued;
}

function subtle(): SubtleCrypto | null {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c && c.subtle ? c.subtle : null;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin);
}

function migrateLegacyStorage(key: string, legacyKey: string) {
  if (localStorage.getItem(key) !== null) return;
  const legacyValue = localStorage.getItem(legacyKey);
  if (legacyValue !== null) localStorage.setItem(key, legacyValue);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out as Uint8Array<ArrayBuffer>;
}

async function masterKey(): Promise<CryptoKey> {
  const s = subtle();
  if (!s) throw new Error('当前环境不支持 Web Crypto，无法加密密钥。');
  migrateLegacyStorage(MASTER_KEY_STORAGE, LEGACY_MASTER_KEY_STORAGE);
  let raw = localStorage.getItem(MASTER_KEY_STORAGE);
  const existing = raw ? b64ToBytes(raw) : null;
  if (!existing || existing.length !== 32) {
    const bytes = (globalThis as { crypto: Crypto }).crypto.getRandomValues(new Uint8Array(32));
    raw = bytesToB64(bytes);
    localStorage.setItem(MASTER_KEY_STORAGE, raw);
  }
  const keyBytes = b64ToBytes(raw as string);
  return s.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function readBlob(): VaultBlob {
  try {
    migrateLegacyStorage(VAULT_STORAGE_KEY, LEGACY_VAULT_STORAGE_KEY);
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as VaultBlob) : {};
  } catch {
    return {};
  }
}

function writeBlob(blob: VaultBlob) {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(blob));
}

export async function sealKey(providerId: string, plaintext: string): Promise<void> {
  return queueVaultWrite(async () => {
    if (!plaintext) {
      removeKeyNow(providerId);
      return;
    }
    const s = subtle();
    if (!s) throw new Error('当前环境不支持 Web Crypto，无法加密密钥。');
    const key = await masterKey();
    const iv = (globalThis as { crypto: Crypto }).crypto.getRandomValues(new Uint8Array(12));
    const buf = await s.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
    const all = new Uint8Array(buf);
    const tag = all.slice(all.length - 16);
    const data = all.slice(0, all.length - 16);
    const blob = readBlob();
    blob[providerId] = { iv: bytesToB64(iv), tag: bytesToB64(tag), data: bytesToB64(data) };
    writeBlob(blob);
  });
}

export async function revealKey(providerId: string): Promise<string> {
  await vaultWriteTail;
  const blob = readBlob();
  const sealed = blob[providerId];
  if (!sealed) return '';
  const s = subtle();
  if (!s) return '';
  try {
    const key = await masterKey();
    const iv = b64ToBytes(sealed.iv);
    const tag = b64ToBytes(sealed.tag);
    const data = b64ToBytes(sealed.data);
    const merged = new Uint8Array(data.length + tag.length) as Uint8Array<ArrayBuffer>;
    merged.set(data, 0);
    merged.set(tag, data.length);
    const plain = await s.decrypt({ name: 'AES-GCM', iv }, key, merged);
    return new TextDecoder().decode(plain);
  } catch {
    return '';
  }
}

function removeKeyNow(providerId: string): void {
  const blob = readBlob();
  if (providerId in blob) {
    delete blob[providerId];
    writeBlob(blob);
  }
}

export function removeKey(providerId: string): Promise<void> {
  return queueVaultWrite(async () => {
    removeKeyNow(providerId);
  });
}

// Fill the in-memory apiKey from the vault. Any legacy plaintext key left in
// the provider config (from before encryption was enabled) is migrated into
// the vault so existing configs are never silently lost.
export async function hydrateApiKeys<T extends { id: string; apiKey: string }>(
  connections: T[],
): Promise<T[]> {
  const s = subtle();
  if (!s) return connections; // no Web Crypto → keep plaintext as-is
  return Promise.all(
    connections.map(async (connection) => {
      const vaultKey = await revealKey(connection.id);
      if (vaultKey) return { ...connection, apiKey: vaultKey };
      if (connection.apiKey) {
        await sealKey(connection.id, connection.apiKey);
        return { ...connection, apiKey: connection.apiKey };
      }
      return { ...connection, apiKey: '' };
    }),
  );
}

export function isVaultSupported(): boolean {
  return subtle() !== null;
}
