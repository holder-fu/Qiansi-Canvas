import antigravityIcon from '@lobehub/icons-static-svg/icons/antigravity-color.svg?url';
import bailianIcon from '@lobehub/icons-static-svg/icons/bailian-color.svg?url';
import codeBuddyIcon from '@lobehub/icons-static-svg/icons/codebuddy-color.svg?url';
import comfyUiIcon from '@lobehub/icons-static-svg/icons/comfyui-color.svg?url';
import deepSeekIcon from '@lobehub/icons-static-svg/icons/deepseek-color.svg?url';
import doubaoIcon from '@lobehub/icons-static-svg/icons/doubao-color.svg?url';
import fluxIcon from '@lobehub/icons-static-svg/icons/flux.svg?url';
import grokIcon from '@lobehub/icons-static-svg/icons/grok.svg?url';
import ideogramIcon from '@lobehub/icons-static-svg/icons/ideogram.svg?url';
import jimengIcon from '@lobehub/icons-static-svg/icons/jimeng-color.svg?url';
import klingIcon from '@lobehub/icons-static-svg/icons/kling-color.svg?url';
import midjourneyIcon from '@lobehub/icons-static-svg/icons/midjourney.svg?url';
import minimaxIcon from '@lobehub/icons-static-svg/icons/minimax-color.svg?url';
import modelScopeIcon from '@lobehub/icons-static-svg/icons/modelscope-color.svg?url';
import openAiIcon from '@lobehub/icons-static-svg/icons/openai.svg?url';
import recraftIcon from '@lobehub/icons-static-svg/icons/recraft.svg?url';
import vertexAiIcon from '@lobehub/icons-static-svg/icons/vertexai-color.svg?url';
import volcengineIcon from '@lobehub/icons-static-svg/icons/volcengine-color.svg?url';
import xAiIcon from '@lobehub/icons-static-svg/icons/xai.svg?url';

type BrandAsset =
  | { mode: 'color'; src: string }
  | { mode: 'mask'; src: string; background: string; foreground: string };

const OPENAI_ASSET: BrandAsset = {
  mode: 'mask',
  src: openAiIcon,
  background: '#202123',
  foreground: '#ffffff',
};

const BRAND_ASSETS: Record<string, BrandAsset> = {
  api: OPENAI_ASSET,
  codex: OPENAI_ASSET,
  'img-gptimage': OPENAI_ASSET,
  xai: { mode: 'mask', src: xAiIcon, background: '#111111', foreground: '#ffffff' },
  'img-grok': { mode: 'mask', src: grokIcon, background: '#111111', foreground: '#ffffff' },
  deepseek: { mode: 'color', src: deepSeekIcon },
  modelscope: { mode: 'color', src: modelScopeIcon },
  volcengine: { mode: 'color', src: volcengineIcon },
  'volcengine-cli': { mode: 'color', src: volcengineIcon },
  'comfyui-local': { mode: 'color', src: comfyUiIcon },
  'comfyui-remote': { mode: 'color', src: comfyUiIcon },
  jimeng: { mode: 'color', src: jimengIcon },
  workbuddy: { mode: 'color', src: codeBuddyIcon },
  gemini: { mode: 'color', src: antigravityIcon },
  bailian: { mode: 'color', src: bailianIcon },
  'img-midjourney': {
    mode: 'mask',
    src: midjourneyIcon,
    background: '#ffffff',
    foreground: '#111111',
  },
  'img-recraft': {
    mode: 'mask',
    src: recraftIcon,
    background: '#ffffff',
    foreground: '#111111',
  },
  'img-ideogram': {
    mode: 'mask',
    src: ideogramIcon,
    background: '#ffffff',
    foreground: '#111111',
  },
  'img-flux': {
    mode: 'mask',
    src: fluxIcon,
    background: '#ffffff',
    foreground: '#111111',
  },
  'img-imagen': { mode: 'color', src: vertexAiIcon },
  'img-doubao': { mode: 'color', src: doubaoIcon },
  'img-kling': { mode: 'color', src: klingIcon },
  'img-minimax': { mode: 'color', src: minimaxIcon },
};

function fallbackMark(providerName: string) {
  const words = providerName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'AI';
  if (words.length > 1)
    return words
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  return words[0]?.slice(0, 2).toUpperCase() || 'AI';
}

export function ProviderBrandIcon({
  providerId,
  providerName,
  mark,
  accent,
  className = '',
}: {
  providerId: string;
  providerName: string;
  mark?: string;
  accent?: string;
  className?: string;
}) {
  const shellClass = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[4px] ${className}`;
  const asset =
    BRAND_ASSETS[providerId] ??
    (providerId.startsWith('comfyui-remote-') ? BRAND_ASSETS['comfyui-remote'] : undefined);

  if (asset?.mode === 'color') {
    return (
      <span aria-hidden="true" title={providerName} className={`${shellClass} bg-white/[0.06]`}>
        <img src={asset.src} alt="" className="h-[88%] w-[88%] object-contain" />
      </span>
    );
  }

  if (asset?.mode === 'mask') {
    return (
      <span
        aria-hidden="true"
        title={providerName}
        className={shellClass}
        style={{ background: asset.background }}
      >
        <span
          className="h-[74%] w-[74%]"
          style={{
            background: asset.foreground,
            maskImage: `url("${asset.src}")`,
            maskPosition: 'center',
            maskRepeat: 'no-repeat',
            maskSize: 'contain',
            WebkitMaskImage: `url("${asset.src}")`,
            WebkitMaskPosition: 'center',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskSize: 'contain',
          }}
        />
      </span>
    );
  }

  if (providerId === 'lightx2v') {
    return (
      <span aria-hidden="true" title={providerName} className={`${shellClass} bg-[#172033]`}>
        <svg viewBox="0 0 20 20" className="h-[82%] w-[82%]" fill="none">
          <path d="M11.7 1.5 4.5 11h4.3l-.6 7.5 7.3-10H11l.7-7Z" fill="#ffd84d" />
        </svg>
      </span>
    );
  }

  const brandMark = mark?.trim() || fallbackMark(providerName);
  return (
    <span
      aria-hidden="true"
      title={providerName}
      className={`${shellClass} border border-white/10 font-semibold leading-none text-white shadow-sm`}
      style={{ background: accent?.trim() || '#4b5563' }}
    >
      <span className="text-[10px]">{brandMark}</span>
    </span>
  );
}
