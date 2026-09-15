import type { NodeKind } from './nodeTypes';

export function svgDataUrl(content: string) {
  return `data:image/svg+xml,${encodeURIComponent(content)}`;
}

export interface PlaceholderResult {
  imageUrl?: string;
  images?: string[];
}

export function placeholderImage(kind: NodeKind): PlaceholderResult {
  if (kind === 'views') {
    const panel = (c1: string, c2: string) =>
      svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="93" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="93" height="160" fill="url(#g)"/><circle cx="46" cy="55" r="14" fill="rgba(255,255,255,0.15)"/><path d="M28 140 Q46 100 65 140" fill="rgba(255,255,255,0.12)"/></svg>`,
      );
    return {
      images: [
        panel('#5a7c5a', '#3d5c3d'),
        panel('#6b8e6b', '#4a6a4a'),
        panel('#5a7c5a', '#3d5c3d'),
      ],
    };
  }
  if (kind === 'front-frame') {
    return {
      imageUrl: svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6b8e6b"/><stop offset="60%" stop-color="#4a6a4a"/><stop offset="100%" stop-color="#3d5c3d"/></linearGradient></defs><rect width="280" height="160" fill="url(#g)"/><circle cx="140" cy="60" r="26" fill="rgba(255,255,255,0.12)"/><path d="M80 155 Q140 90 200 155" fill="rgba(255,255,255,0.1)"/></svg>`,
      ),
    };
  }
  if (kind === 'audio') {
    return {
      imageUrl: svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5a6e8c"/><stop offset="100%" stop-color="#3d4a5c"/></linearGradient></defs><rect width="280" height="160" fill="url(#g)"/><path d="M40 120 L80 80 L120 110 L160 50 L200 90 L240 60" stroke="rgba(255,255,255,0.2)" stroke-width="3" fill="none"/></svg>`,
      ),
    };
  }
  if (kind === 'video' || kind === 'video-comp') {
    return {};
  }
  if (kind === 'director' || kind === 'director-2d' || kind === 'director-3d') {
    return {};
  }
  if (kind === 'text') {
    return {
      imageUrl: svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6b6b6b"/><stop offset="100%" stop-color="#4a4a4a"/></linearGradient></defs><rect width="280" height="160" fill="url(#g)"/><rect x="60" y="70" width="160" height="8" rx="4" fill="rgba(255,255,255,0.15)"/><rect x="90" y="88" width="100" height="6" rx="3" fill="rgba(255,255,255,0.1)"/></svg>`,
      ),
    };
  }
  if (
    kind === 'generator' ||
    kind === 'comfy' ||
    kind === 'midjourney' ||
    kind === 'msgen' ||
    kind === 'rh'
  ) {
    const c =
      kind === 'comfy'
        ? '#22d3ee'
        : kind === 'midjourney'
          ? '#a78bfa'
          : kind === 'msgen'
            ? '#f59e0b'
            : kind === 'rh'
              ? '#fb7185'
              : '#34d399';
    return {
      imageUrl: svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c}"/><stop offset="100%" stop-color="#1c1c1f"/></linearGradient></defs><rect width="280" height="160" fill="url(#g)" opacity="0.5"/><circle cx="140" cy="70" r="26" fill="rgba(255,255,255,0.18)"/></svg>`,
      ),
    };
  }
  if (kind === 'loop') {
    return {
      imageUrl: svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#1c1c1f"/></linearGradient></defs><rect width="280" height="160" fill="url(#g)" opacity="0.45"/><path d="M110 80 a30 30 0 1 1 30 30" stroke="rgba(255,255,255,0.25)" stroke-width="6" fill="none"/></svg>`,
      ),
    };
  }
  if (kind === 'output') {
    return {
      imageUrl: svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#1c1c1f"/></linearGradient></defs><rect width="280" height="160" fill="url(#g)" opacity="0.4"/><rect x="100" y="60" width="80" height="40" rx="6" fill="rgba(255,255,255,0.15)"/></svg>`,
      ),
    };
  }
  return {};
}

export const KIND_DEFAULTS: Record<
  NodeKind,
  { title: string; description: string; aiTag?: boolean; providerId?: string; model?: string }
> = {
  image: { title: '角色图', description: '角色参考图片', aiTag: true },
  'image-compare': { title: '图片对比', description: '拖动分隔线对比图1与图2' },
  views: { title: '角色三视图', description: '正面、侧面、背面三视图', aiTag: true },
  video: { title: '视频', description: '视频输入', aiTag: true },
  'video-comp': { title: '视频合成', description: '多源视频合成', aiTag: true },
  director: { title: '导演台', description: '镜头与节奏导演', aiTag: true },
  'director-2d': { title: '2D导演台', description: '平面分镜与构图约束', aiTag: true },
  'director-3d': { title: '3D导演台', description: '3D角色、机位与动作预演', aiTag: true },
  'model-3d': { title: '3D 模型', description: '生成或导入 3D 模型', aiTag: true },
  script: { title: '脚本', description: '自动生成故事脚本与分镜', aiTag: true },
  text: { title: '提示词', description: '文本提示词输入', aiTag: true },
  audio: { title: '音频素材', description: '上传、录制或生成音频', aiTag: true },
  group: { title: '分组', description: '' },
  'front-frame': { title: '首帧图', description: '视频第一帧参考', aiTag: true },
  // ── 复刻旧版节点模块 ──
  generator: {
    title: '生图',
    description: '文生图 / 图生图',
    aiTag: true,
    providerId: '',
    model: '',
  },
  llm: { title: '对话', description: 'LLM 对话 / 改写', aiTag: true, providerId: '', model: '' },
  comfy: {
    title: 'ComfyUI',
    description: 'ComfyUI 工作流',
    aiTag: true,
    providerId: '',
    model: '',
  },
  midjourney: {
    title: 'Midjourney',
    description: 'Midjourney 生图',
    aiTag: true,
    providerId: '',
    model: '',
  },
  msgen: {
    title: 'ModelScope',
    description: 'Z-Image 生图',
    aiTag: true,
    providerId: '',
    model: '',
  },
  rh: {
    title: 'RunningHub',
    description: 'RunningHub 工作流',
    aiTag: true,
    providerId: '',
    model: '',
  },
  loop: { title: '循环', description: '循环批处理', aiTag: false },
  output: { title: '结果收集', description: '聚合上游生成结果', aiTag: false },
  plugin: { title: '插件节点', description: '第三方声明式插件节点', aiTag: false },
};

const PLACEHOLDER_MEDIA_URLS = new Set(
  (Object.keys(KIND_DEFAULTS) as NodeKind[]).flatMap((kind) => {
    const placeholder = placeholderImage(kind);
    return [placeholder.imageUrl, ...(placeholder.images ?? [])].filter((url): url is string =>
      Boolean(url),
    );
  }),
);

/** Legacy green/pink SVG cards were stored as media even though they only represented empty UI. */
export function isLegacyMediaPlaceholder(url: string | undefined) {
  return Boolean(
    url &&
    url.startsWith('data:image/svg+xml') &&
    /(?:%23|#)(?:6b8e6b|4a6a4a|3d5c3d|8c5a6e|5c3d4a)/i.test(url),
  );
}

/** True only for built-in empty-state artwork, never for user or generated media. */
export function isPlaceholderMediaUrl(url: string | undefined) {
  return Boolean(url && (PLACEHOLDER_MEDIA_URLS.has(url) || isLegacyMediaPlaceholder(url)));
}

export function thumbUrl(url: string | undefined): string | undefined {
  return url;
}
