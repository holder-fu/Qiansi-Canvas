import { describe, expect, it } from 'vitest';
import imageCompareNodeSource from './ImageCompareNode.tsx?raw';

describe('image comparison node dragging', () => {
  it('keeps the node body draggable while isolating divider interaction', () => {
    const stageStart = imageCompareNodeSource.indexOf('ref={stageRef}');
    const dividerStart = imageCompareNodeSource.indexOf(
      'data-image-comparison-divider="true"',
      stageStart,
    );
    const stageSource = imageCompareNodeSource.slice(stageStart, dividerStart);
    const dividerSource = imageCompareNodeSource.slice(dividerStart);

    expect(stageStart).toBeGreaterThan(-1);
    expect(dividerStart).toBeGreaterThan(stageStart);
    expect(stageSource).toContain('cursor-grab touch-none');
    expect(stageSource).toContain('active:cursor-grabbing');
    expect(stageSource).not.toContain('nodrag nopan');
    expect(stageSource).not.toContain('onPointerDown={handlePointerDown}');
    expect(dividerSource).toContain('nodrag nopan');
    expect(dividerSource).toContain('onPointerDown={handlePointerDown}');
    expect(dividerSource).toContain('onPointerMove={(event) =>');
    expect(dividerSource).toContain('onPointerUp={finishPointerDrag}');
  });

  it('advertises the title strip as an always-available drag surface', () => {
    expect(imageCompareNodeSource).toContain('data-image-comparison-drag-handle="true"');
    expect(imageCompareNodeSource).toContain('cursor-grab select-none items-center');
    expect(imageCompareNodeSource).toContain('active:cursor-grabbing');
  });

  it('keeps a slim divider without an image-obscuring center handle', () => {
    const dividerSource = imageCompareNodeSource.slice(
      imageCompareNodeSource.indexOf('data-image-comparison-divider="true"'),
    );
    expect(imageCompareNodeSource).toContain(
      'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white',
    );
    expect(imageCompareNodeSource).not.toContain('MoveHorizontal');
    expect(dividerSource).not.toContain('h-9 w-9');
  });

  it('fills the comparison node without a letterbox or inset frame', () => {
    expect(imageCompareNodeSource).toContain(
      'pointer-events-none h-full w-full select-none object-cover object-center',
    );
    expect(imageCompareNodeSource).not.toContain("alignedCrop ? 'object-cover' : 'object-contain'");
    expect(imageCompareNodeSource).not.toContain('bg-[#18181a] p-2');
  });

  it('resizes the node to the connected image ratio', () => {
    expect(imageCompareNodeSource).toContain(
      'const viewportSize = imageComparisonViewportSize(naturalSizes.one, naturalSizes.two);',
    );
    expect(imageCompareNodeSource).toContain(
      'setNodeDimensions(id, viewportSize.width, viewportSize.height);',
    );
    expect(imageCompareNodeSource).toContain('className="group relative h-full w-full"');
    expect(imageCompareNodeSource).not.toContain('h-[320px] w-[480px]');
  });
});
