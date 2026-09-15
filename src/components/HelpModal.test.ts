import { describe, expect, it } from 'vitest';
import source from './HelpModal.tsx?raw';

describe('Help modal support truthfulness', () => {
  it('stores feedback only as a clearly labelled browser-local draft', () => {
    expect(source).toContain('意见反馈（本机草稿）');
    expect(source).toContain('保存本机草稿');
    expect(source).toContain('尚未发送给任何人');
    expect(source).toContain('当前版本没有在线反馈后端');
    expect(source).toContain('浏览器本地存储不可用，草稿尚未保存');
    expect(source).toContain('setFeedbackSaved(true)');
    expect(source).not.toContain('Send');
    expect(source).not.toContain('QrCode');
    expect(source).not.toContain('公众号');
    expect(source).not.toContain("case 'wechat'");
  });
});
