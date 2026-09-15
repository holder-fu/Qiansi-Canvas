import { create } from 'zustand';
import {
  applyTextModeCatalog,
  normalizeTextModeDefinitions,
  TEXT_MODE_CATALOG_VERSION,
  type TextModeDefinition,
} from '../lib/textModeCatalog';
import {
  applyLoadedTextModeCatalog,
  loadTextModeCatalog,
  saveTextModeCatalog,
  TextModeCatalogConflictError,
  type TextModeCatalogSnapshot,
} from '../services/textModeCatalog';
import { TEXT_MODE_DEFINITIONS } from '../lib/textGeneration';

const STORAGE_KEY = 'qiansi-canvas-text-modes-v1';
const defaultDefinitions = normalizeTextModeDefinitions(TEXT_MODE_DEFINITIONS);

type TextModeCatalogStore = {
  definitions: TextModeDefinition[];
  revision: number;
  writable: boolean;
  loaded: boolean;
  setSnapshot: (snapshot: TextModeCatalogSnapshot) => void;
};

function readLocal(): { definitions: TextModeDefinition[]; revision: number } | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, unknown>;
    if (raw.version !== TEXT_MODE_CATALOG_VERSION || !Array.isArray(raw.definitions))
      return undefined;
    return {
      definitions: normalizeTextModeDefinitions(raw.definitions),
      revision:
        Number.isSafeInteger(raw.revision) && Number(raw.revision) >= 0 ? Number(raw.revision) : 0,
    };
  } catch {
    return undefined;
  }
}

function writeLocal(definitions: readonly TextModeDefinition[], revision: number) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: TEXT_MODE_CATALOG_VERSION, revision, definitions }),
    );
  } catch {
    // Bridge remains authoritative when browser storage is unavailable.
  }
}

function applySnapshot(snapshot: TextModeCatalogSnapshot) {
  const definitions = applyLoadedTextModeCatalog(snapshot.catalog.modes);
  writeLocal(definitions, snapshot.catalog.revision);
  useTextModeCatalogStore.setState({
    definitions,
    revision: snapshot.catalog.revision,
    writable: snapshot.writable,
    loaded: true,
  });
  return definitions;
}

export const useTextModeCatalogStore = create<TextModeCatalogStore>((set) => ({
  definitions: applyTextModeCatalog(defaultDefinitions),
  revision: 0,
  writable: false,
  loaded: false,
  setSnapshot: (snapshot) => {
    const definitions = applyLoadedTextModeCatalog(snapshot.catalog.modes);
    writeLocal(definitions, snapshot.catalog.revision);
    set({
      definitions,
      revision: snapshot.catalog.revision,
      writable: snapshot.writable,
      loaded: true,
    });
  },
}));

let startupPromise: Promise<void> | undefined;

export function startTextModeCatalogSync(): Promise<void> {
  if (startupPromise) return startupPromise;
  const local = readLocal();
  if (local) {
    const definitions = applyTextModeCatalog(local.definitions);
    useTextModeCatalogStore.setState({ definitions, revision: local.revision });
  }
  startupPromise = loadTextModeCatalog()
    .then(async (snapshot) => {
      const localDefinitions = useTextModeCatalogStore.getState().definitions;
      const localHasEdits =
        Boolean(local) && JSON.stringify(localDefinitions) !== JSON.stringify(defaultDefinitions);
      if (snapshot.catalog.revision === 0 && localHasEdits && snapshot.writable) {
        try {
          const saved = await saveTextModeCatalog(localDefinitions, 0);
          applySnapshot(saved);
          return;
        } catch {
          // Fall through to the Bridge defaults if the first migration loses a race.
        }
      }
      applySnapshot(snapshot);
    })
    .catch(() => {
      useTextModeCatalogStore.setState({ loaded: true });
    });
  return startupPromise;
}

export async function persistTextModeCatalog(
  definitions: readonly TextModeDefinition[],
): Promise<boolean> {
  const normalized = applyTextModeCatalog(definitions);
  writeLocal(normalized, useTextModeCatalogStore.getState().revision);
  useTextModeCatalogStore.setState({ definitions: normalized });
  try {
    const state = useTextModeCatalogStore.getState();
    const snapshot = await saveTextModeCatalog(normalized, state.revision);
    applySnapshot(snapshot);
    return true;
  } catch (error) {
    if (error instanceof TextModeCatalogConflictError && error.catalog) {
      applySnapshot({
        catalog: error.catalog,
        writable: useTextModeCatalogStore.getState().writable,
      });
    }
    return false;
  }
}
