import { describe, expect, it } from 'vitest';
import source from './ImageNode.tsx?raw';

describe('ImageNode generation status', () => {
  it('renders an accessible in-node loading overlay while generation is active', () => {
    expect(source).toContain('data-image-generation-status="true"');
    expect(source).toContain('role="status"');
    expect(source).toContain("t('imageNode.generatingProgress'");
    expect(source).toContain("t('imageNode.generating', '正在生成图片')");
    expect(source).toContain('Loader2 className="h-7 w-7 animate-spin text-emerald-300"');
  });

  it('uses the store recovery gate for interrupted image and video requests', () => {
    expect(source).toContain('interruptedGenerationRequestId');
    expect(source).toContain('recoverNodeGenerationResult(id)');
    expect(source).toContain('<GenerationRecoveryButton');
    expect(source).toContain("t('imageNode.recovery.check', '检查生成结果')");
    expect(source).not.toContain('recoverGeneratedImageByRequestId');
    expect(source).not.toContain('recoverRecentGeneratedImage');
  });
});
