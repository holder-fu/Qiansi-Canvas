import { readFile } from 'node:fs/promises';

const CANVAS_VERSION_RE = /^\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?$/;

function validCanvasVersion(value) {
  const version = typeof value === 'string' ? value.trim() : '';
  return CANVAS_VERSION_RE.test(version) ? version : '';
}

/**
 * Resolve the Canvas version that plugin engine ranges target.
 *
 * A Bridge process can remain alive while an atomic application update replaces
 * package.json and the web build. Reading the package on every compatibility
 * decision prevents the Bridge's startup snapshot from becoming a false plugin
 * requirement. Invalid or temporarily unavailable package data fails safely to
 * the version the Bridge started with.
 */
export function createCanvasHostVersionReader(packageFile, startupVersion) {
  const fallback = validCanvasVersion(startupVersion) || '0.0.0';
  return async function readCanvasHostVersion() {
    try {
      const value = JSON.parse(await readFile(packageFile, 'utf8'));
      return validCanvasVersion(value?.version) || fallback;
    } catch {
      return fallback;
    }
  };
}
