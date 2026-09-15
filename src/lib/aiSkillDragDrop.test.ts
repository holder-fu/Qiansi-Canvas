import { describe, expect, it } from 'vitest';
import {
  parseAiSkillImageDrag,
  parseAiSkillNodeDrag,
  sanitizeAiSkillPromptValue,
  serializeAiSkillImageDrag,
  serializeAiSkillNodeDrag,
} from './aiSkillDragDrop';

describe('AI SKILL drag payloads', () => {
  it('round-trips a generated image payload', () => {
    const raw = serializeAiSkillImageDrag({ url: 'data:image/png;base64,abc', name: '镜头草图' });
    expect(parseAiSkillImageDrag(raw)).toEqual({
      url: 'data:image/png;base64,abc',
      name: '镜头草图',
    });
  });

  it('rejects non-image payloads', () => {
    expect(parseAiSkillImageDrag('{"url":"javascript:alert(1)"}')).toBeNull();
  });

  it('round-trips a canvas node payload', () => {
    expect(parseAiSkillNodeDrag(serializeAiSkillNodeDrag({ nodeId: 'node-text-1' }))).toEqual({
      nodeId: 'node-text-1',
    });
  });

  it('rejects empty canvas node payloads', () => {
    expect(parseAiSkillNodeDrag('{"nodeId":"  "}')).toBeNull();
  });

  it('omits a standalone inline image from prompt text', () => {
    expect(sanitizeAiSkillPromptValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg')).toBe('');
  });

  it('redacts inline media nested inside structured node output', () => {
    const value = sanitizeAiSkillPromptValue(
      '{"caption":"人物参考","image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUg"}',
    );
    expect(value).toContain('人物参考');
    expect(value).toContain('[媒体数据已作为附件添加]');
    expect(value).not.toContain('iVBORw0KGgoAAAANSUhEUg');
  });
});
