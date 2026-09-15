import { describe, expect, it } from 'vitest';
import { workflowFileToString } from '../serialization/workflow';
import { createStoredZip } from './storedZip';
import { detectSmartImport } from './smartImport';

const encoder = new TextEncoder();

function zipWithEntries(entries: Array<{ name: string; value: Record<string, unknown> }>) {
  return new File(
    [
      createStoredZip(
        entries.map((entry) => ({
          name: entry.name,
          bytes: encoder.encode(JSON.stringify(entry.value)),
        })),
      ),
    ],
    'package.zip',
    { type: 'application/zip' },
  );
}

function zipWithManifest(manifest: Record<string, unknown>) {
  return zipWithEntries([{ name: 'manifest.json', value: manifest }]);
}

describe('smart import detection', () => {
  it('recognizes a Qiansi canvas workflow without writing it', async () => {
    const file = new File([workflowFileToString([], [])], 'canvas.json', {
      type: 'application/json',
    });

    await expect(detectSmartImport([file])).resolves.toEqual({
      kind: 'canvas-workflow',
      itemCount: 0,
      edgeCount: 0,
      workflowVersion: 2,
    });
  });

  it('recognizes a node material ZIP from its root manifest', async () => {
    const file = zipWithManifest({
      format: 'qiansi-canvas-material-bundle',
      version: 1,
      entries: [
        { path: 'materials/shot.png', kind: 'image', title: '镜头', mime: 'image/png' },
        { path: 'materials/note.txt', kind: 'text', title: '说明', mime: 'text/plain' },
      ],
    });

    await expect(detectSmartImport([file])).resolves.toEqual({
      kind: 'canvas-material-bundle',
      itemCount: 2,
      materialCounts: { image: 1, video: 0, text: 1 },
    });
  });

  it('recognizes the destination library encoded by a library ZIP', async () => {
    const file = zipWithManifest({
      format: 'qiansi-library',
      version: 2,
      library: 'character',
      scope: 'all',
      exportedAt: '2026-08-26T00:00:00.000Z',
      categories: [],
      modelCategories: [],
      mediaLayout: 'zip-v1',
      items: [{ id: 'character-one', title: '角色一' }],
    });

    await expect(detectSmartImport([file])).resolves.toEqual({
      kind: 'library-package',
      itemCount: 1,
      libraryKind: 'character',
      packageVersion: 2,
    });
  });

  it('recognizes a legacy JSON library package', async () => {
    const file = new File(
      [
        JSON.stringify({
          format: 'qiansi-library',
          version: 1,
          library: 'prompt',
          scope: 'selected',
          items: [{ id: 'prompt-one', title: '提示词一' }],
        }),
      ],
      'prompt.qiansi-library.json',
      { type: 'application/json' },
    );

    await expect(detectSmartImport([file])).resolves.toMatchObject({
      kind: 'library-package',
      itemCount: 1,
      libraryKind: 'prompt',
      packageVersion: 1,
    });
  });

  it('groups ordinary media files as new canvas material nodes', async () => {
    const files = [
      new File(['image'], 'character.png', { type: 'image/png' }),
      new File(['subtitle'], 'line.srt', { type: 'application/x-subrip' }),
    ];

    await expect(detectSmartImport(files)).resolves.toEqual({
      kind: 'canvas-material-files',
      itemCount: 2,
      materialCounts: { image: 1, video: 0, text: 1 },
    });
  });

  it('rejects unknown ZIP packages before any importer is called', async () => {
    const file = zipWithManifest({ format: 'some-other-package', version: 1 });

    await expect(detectSmartImport([file])).rejects.toThrow('无法识别此 ZIP');
  });

  it('uses ZIP content instead of the file extension', async () => {
    const packageFile = zipWithManifest({
      format: 'qiansi-canvas-material-bundle',
      version: 1,
      entries: [],
    });
    const renamed = new File([packageFile], 'renamed.data', { type: 'application/octet-stream' });

    await expect(detectSmartImport([renamed])).resolves.toMatchObject({
      kind: 'canvas-material-bundle',
    });
  });

  it('rejects a ZIP carrying more than one strong package marker', async () => {
    const file = zipWithEntries([
      {
        name: 'manifest.json',
        value: { format: 'qiansi-canvas-material-bundle', version: 1, entries: [] },
      },
      {
        name: 'theme.json',
        value: { kind: 'qiansi-canvas-theme', schemaVersion: 1 },
      },
    ]);

    await expect(detectSmartImport([file])).rejects.toThrow('同时包含多个包标记');
  });

  it('directs a theme ZIP to Appearance without importing it', async () => {
    const file = zipWithEntries([
      {
        name: 'theme.json',
        value: { kind: 'qiansi-canvas-theme', schemaVersion: 1 },
      },
    ]);

    await expect(detectSmartImport([file])).rejects.toThrow('设置 → 外观');
  });

  it('directs ComfyUI JSON to its dedicated settings importer', async () => {
    const file = new File(
      [JSON.stringify({ 1: { class_type: 'KSampler', inputs: {} } })],
      'comfy-api.json',
      { type: 'application/json' },
    );

    await expect(detectSmartImport([file])).rejects.toThrow('ComfyUI API JSON');
  });
});
