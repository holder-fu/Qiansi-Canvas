import { describe, expect, it } from 'vitest';
import type { FlowNode } from '../canvas/nodeTypes';
import composerContextSource from './ComposerContext.tsx?raw';
import floatingComposerSource from './FloatingAIComposer.tsx?raw';
import { composerPromptPatch, composerPromptValue } from './promptPersistence';

function node(kind: FlowNode['data']['kind'], data: Partial<FlowNode['data']> = {}): FlowNode {
  return {
    id: `node-${kind}`,
    type: kind,
    position: { x: 0, y: 0 },
    data: { kind, title: '测试节点', description: '', ...data },
  } as FlowNode;
}

describe('composer prompt persistence', () => {
  it('stores text instructions separately from generated text content', () => {
    expect(composerPromptPatch('text', '续写下一幕')).toEqual({
      textInstruction: '续写下一幕',
    });
    expect(
      composerPromptValue(node('text', { prompt: '旧正文', textInstruction: '续写下一幕' })),
    ).toBe('续写下一幕');
  });

  it('stores image and video instructions in the shared prompt field', () => {
    expect(composerPromptPatch('image', '生成雨夜街景')).toEqual({ prompt: '生成雨夜街景' });
    expect(composerPromptPatch('video', '镜头缓慢推进')).toEqual({ prompt: '镜头缓慢推进' });
    expect(composerPromptValue(node('image', { prompt: '生成雨夜街景' }))).toBe('生成雨夜街景');
  });

  it('clears the persisted field when the instruction box is emptied', () => {
    expect(composerPromptPatch('text', '')).toEqual({ textInstruction: undefined });
    expect(composerPromptPatch('image', '')).toEqual({ prompt: undefined });
  });

  it('wires every prompt edit to the selected node without remounting on each keystroke', () => {
    expect(composerContextSource).toContain('onPromptChange?.(prompt)');
    expect(floatingComposerSource).toContain('onPromptChange={handlePromptChange}');
    expect(floatingComposerSource).toContain(
      'updateNodeData(selectedPrimaryNodeId, composerPromptPatch(node.data.kind, prompt))',
    );
    expect(floatingComposerSource).not.toContain(".join(':')}|${initialPrompt}");
  });
});
