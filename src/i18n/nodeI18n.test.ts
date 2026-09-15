import { describe, expect, it } from 'vitest';
import { getPorts } from '../graph/nodeSpecs';
import {
  getNodeDisplayTitle,
  getNodeKindDisplayDescription,
  getNodeKindDisplayLabel,
  getPortAriaLabel,
  getPortDisplayLabel,
  type NodeTranslator,
} from './nodeI18n';

const translations: Record<string, string> = {
  'node.kind.video.label': 'Video',
  'node.kind.video.description': 'Text or image to video',
  'node.kind.video.defaultTitle': 'Video',
  'node.port.prompt': 'Prompt',
  'node.port.direction.input': 'Input',
  'node.port.aria': '{direction} port: {label}',
};

const t: NodeTranslator = (key, fallback, params) => {
  const message = translations[key] ?? fallback ?? key;
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
    params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
};

describe('node display i18n', () => {
  it('translates type metadata without changing its stable identity', () => {
    expect(getNodeKindDisplayLabel('video', t)).toBe('Video');
    expect(getNodeKindDisplayDescription('video', t)).toBe('Text or image to video');
  });

  it('translates only built-in default titles and preserves user titles', () => {
    expect(getNodeDisplayTitle('video', '视频', t)).toBe('Video');
    expect(getNodeDisplayTitle('video', '未命名视频', t)).toBe('Video');
    expect(getNodeDisplayTitle('video', '我的第一支短片', t)).toBe('我的第一支短片');
  });

  it('translates built-in port labels at render time without mutating the port registry', () => {
    const promptPort = getPorts('video', 'in')[0];
    expect(promptPort).toBeDefined();
    if (!promptPort) return;
    const originalLabel = promptPort.label;

    expect(getPortDisplayLabel(promptPort, t)).toBe('Prompt');
    expect(getPortAriaLabel(promptPort, 'target', t)).toBe('Input port: Prompt');
    expect(promptPort.label).toBe(originalLabel);
  });

  it('leaves unknown plugin labels untouched', () => {
    const pluginPort = {
      id: 'custom',
      direction: 'in' as const,
      assetType: 'any' as const,
      label: 'Acme Signal',
    };
    expect(getPortDisplayLabel(pluginPort, t)).toBe('Acme Signal');
  });
});
