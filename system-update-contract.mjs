const VERSION_RE = /^v?\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/i;

export function safeUpdateUrl(value, label = '更新地址') {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error(`${label}不是有效 URL。`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label}必须使用 HTTPS。`);
  if (url.username || url.password) throw new Error(`${label}不能包含用户名或密码。`);
  return url;
}

export function compareUpdateVersions(left, right) {
  const parse = (value) => {
    const normalized = String(value || '')
      .trim()
      .replace(/^v/i, '')
      .split('+', 1)[0];
    const separator = normalized.indexOf('-');
    const core = separator >= 0 ? normalized.slice(0, separator) : normalized;
    const prerelease = separator >= 0 ? normalized.slice(separator + 1).split('.') : [];
    return {
      core: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
      prerelease,
    };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index += 1) {
    if ((a.core[index] || 0) !== (b.core[index] || 0)) {
      return (a.core[index] || 0) - (b.core[index] || 0);
    }
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length === 0 ? 1 : -1;
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined || bPart === undefined) {
      return aPart === bPart ? 0 : aPart === undefined ? -1 : 1;
    }
    if (aPart === bPart) continue;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) return Number(aPart) - Number(bPart);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return aPart.localeCompare(bPart, 'en');
  }
  return 0;
}

export function normalizeUpdateSources(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const items = Array.isArray(source.sources) ? source.sources : [];
  return {
    version: 1,
    sources: items
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .flatMap((item) => {
        const id = String(item.id || '').trim();
        const name = String(item.name || '').trim();
        const manifestUrl = String(item.manifestUrl || '').trim();
        const homepageUrl = String(item.homepageUrl || '').trim();
        if (!/^[a-z][a-z0-9-]{1,30}$/.test(id) || !name || name.length > 60) return [];
        if (manifestUrl) safeUpdateUrl(manifestUrl, `${name} 清单地址`);
        if (homepageUrl) safeUpdateUrl(homepageUrl, `${name} 项目主页`);
        return [{ id, name, manifestUrl, homepageUrl, enabled: item.enabled !== false }];
      })
      .slice(0, 8),
  };
}

/** Merge the source-owned defaults with an optional machine-local override.
 * Empty legacy URLs inherit their current defaults, while explicit URLs and
 * disabled states remain under the user's control. */
export function mergeUpdateSourceConfigs(defaultValue, overrideValue) {
  const defaults = normalizeUpdateSources(defaultValue);
  const overrides = normalizeUpdateSources(overrideValue);
  const overridesById = new Map(overrides.sources.map((source) => [source.id, source]));
  const defaultIds = new Set(defaults.sources.map((source) => source.id));
  const mergedDefaults = defaults.sources.map((source) => {
    const override = overridesById.get(source.id);
    if (!override) return source;
    return {
      ...source,
      name: override.name || source.name,
      manifestUrl: override.manifestUrl || source.manifestUrl,
      homepageUrl: override.homepageUrl || source.homepageUrl,
      enabled: override.enabled,
    };
  });
  return {
    version: 1,
    sources: [
      ...mergedDefaults,
      ...overrides.sources.filter((source) => !defaultIds.has(source.id)),
    ].slice(0, 8),
  };
}

function parseUpdateRelease(value, label = '更新') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}版本不是有效对象。`);
  }
  const version = String(value.version || '').trim();
  if (!VERSION_RE.test(version)) throw new Error(`${label}版本号格式不正确。`);
  const rawNotes = Array.isArray(value.notes)
    ? value.notes.map((item) => String(item || '').trim())
    : String(value.notes || '')
        .split(/\r?\n/)
        .map((item) => item.trim());
  const notes = [...new Set(rawNotes.filter(Boolean))].slice(0, 20);
  const packageInfo =
    value.package && typeof value.package === 'object' && !Array.isArray(value.package)
      ? value.package
      : {};
  const url = safeUpdateUrl(packageInfo.url, `${label}包地址`).toString();
  const sha256 = String(packageInfo.sha256 || '')
    .trim()
    .toLowerCase();
  if (!SHA256_RE.test(sha256)) throw new Error(`${label}包 SHA-256 格式不正确。`);
  const size = Number(packageInfo.size || 0);
  if (!Number.isSafeInteger(size) || size <= 0 || size > 1024 * 1024 * 1024) {
    throw new Error(`${label}包大小必须在 1 B 到 1 GB 之间。`);
  }
  return {
    version,
    publishedAt: String(value.publishedAt || '')
      .trim()
      .slice(0, 40),
    notes,
    package: { url, sha256, size },
  };
}

export function parseUpdateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('更新清单不是有效对象。');
  }
  if (value.schemaVersion !== 1) throw new Error('更新清单版本不受支持。');
  const latest = parseUpdateRelease(value, '更新');
  const seenVersions = new Set([latest.version]);
  const releases = (Array.isArray(value.releases) ? value.releases : [])
    .slice(0, 40)
    .map((release, index) => parseUpdateRelease(release, `历史版本 ${index + 1}`))
    .filter((release) => {
      if (seenVersions.has(release.version)) return false;
      seenVersions.add(release.version);
      return true;
    })
    .slice(0, 20);
  return { schemaVersion: 1, ...latest, releases };
}

/** Select the newest release strictly below the running version. The top-level
 * release participates too, so a mirror pinned to an older release can still
 * serve as a rollback source without a history array. */
export function findPreviousUpdateRelease(manifest, currentVersion) {
  const releases = [manifest, ...(Array.isArray(manifest?.releases) ? manifest.releases : [])]
    .filter((release) => compareUpdateVersions(release.version, currentVersion) < 0)
    .sort((left, right) => compareUpdateVersions(right.version, left.version));
  if (!releases[0]) return null;
  const { version, publishedAt, notes, package: packageInfo } = releases[0];
  return { version, publishedAt, notes, package: packageInfo };
}
