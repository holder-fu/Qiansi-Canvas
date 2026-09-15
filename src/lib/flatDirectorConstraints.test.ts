import { describe, expect, it } from 'vitest';
import { createDefaultDirectorScene, createDefaultDirectorSubject } from './directorConstraints';
import { placeholderImage } from '../canvas/placeholders';
import {
  buildFlatDirectorConstraintPrompt,
  buildFlatDirectorReferenceImages,
  buildFlatDirectorReferenceManifest,
  flatDirectorReferenceOverflow,
  getFlatDirectorReadiness,
  removeFlatDirectorSubject,
} from './flatDirectorConstraints';

describe('flat director constraints', () => {
  it('creates a compact still-image contract that locks placement, facing and props', () => {
    const scene = createDefaultDirectorScene();
    scene.sceneName = '咖啡馆';
    scene.sceneObjects = [
      {
        id: 'counter',
        label: '咖啡吧台',
        kind: 'furniture',
        x: 50,
        y: 24,
        scale: 120,
        description: '后景中央，摆放咖啡机',
      },
    ];
    scene.subjects = [
      {
        ...createDefaultDirectorSubject({
          id: 'hero',
          sourceNodeId: 'hero-image',
          label: '女主',
          imageUrl: 'hero.png',
          x: 22,
          y: 65,
          scale: 110,
          rotation: 0,
        }),
        bodyFacing: 'right-profile',
        bodyAngle: 90,
        bodyTarget: '咖啡吧台',
      },
    ];
    const prompt = buildFlatDirectorConstraintPrompt(scene, '9:16');
    expect(prompt).toContain('单张静态分镜控制图');
    expect(prompt).toContain('最终画幅比例必须为 9:16');
    expect(prompt).toContain('咖啡吧台（家具）：画面中央、后景');
    expect(prompt).toContain('人物 A「女主」：画面左侧、中景（脚底站位锚点 x=22%、y=65%');
    expect(prompt).toContain('身体右侧身90°');
    expect(prompt).toContain('必须且只能出现1名已指定主要人物');
    expect(prompt).toContain('最终成片中绝对不得出现这些标记');
  });

  it('keeps background actors as positioned extras without making them identity references', () => {
    const scene = createDefaultDirectorScene();
    scene.backgroundActors = [
      {
        id: 'extra-1',
        label: '后排同学',
        x: 74,
        y: 28,
        scale: 58,
        description: '坐在后排低头写字',
      },
    ];

    const prompt = buildFlatDirectorConstraintPrompt(scene);

    expect(prompt).toContain('另有1名不具名群演');
    expect(prompt).toContain('后排同学」：画面右侧、后景');
    expect(prompt).toContain('群演不使用身份参考图');
  });

  it('keeps the prompt manifest and emitted image order aligned with or without a scene image', () => {
    const scene = createDefaultDirectorScene();
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'hero',
        sourceNodeId: 'hero-image',
        label: '女主',
        imageUrl: 'hero.png',
        x: 50,
        y: 50,
        scale: 120,
        rotation: 0,
      }),
    ];

    expect(buildFlatDirectorReferenceManifest(scene)).toEqual([
      { index: 1, kind: 'layout', label: '二维构图控制图' },
      { index: 2, kind: 'subject', label: '人物 A · 女主', imageUrl: 'hero.png' },
    ]);
    expect(buildFlatDirectorReferenceImages(scene, 'layout.png')).toEqual([
      'layout.png',
      'hero.png',
    ]);

    scene.sceneUrl = 'classroom.png';
    scene.sceneName = '教室';
    expect(buildFlatDirectorReferenceImages(scene, 'layout.png')).toEqual([
      'layout.png',
      'classroom.png',
      'hero.png',
    ]);
    expect(buildFlatDirectorConstraintPrompt(scene)).toContain(
      '参考图2：教室（控制环境、空间和光线）',
    );
    expect(buildFlatDirectorConstraintPrompt(scene)).toContain('参考图3：人物 A · 女主');
  });

  it('reports reference overflow instead of silently pretending every identity image is included', () => {
    const scene = createDefaultDirectorScene();
    scene.sceneUrl = 'scene.png';
    scene.subjects = Array.from({ length: 4 }, (_, index) =>
      createDefaultDirectorSubject({
        id: `subject-${index}`,
        sourceNodeId: `image-${index}`,
        label: `人物 ${index + 1}`,
        imageUrl: `subject-${index}.png`,
        x: 20 + index * 15,
        y: 50,
        scale: 100,
        rotation: 0,
      }),
    );

    expect(flatDirectorReferenceOverflow(scene)).toBe(1);
    expect(buildFlatDirectorReferenceManifest(scene)).toHaveLength(5);
    expect(buildFlatDirectorConstraintPrompt(scene)).toContain('仍有1名主要人物身份图未进入参考图');
  });

  it('requires at least one main subject with a real identity image', () => {
    const scene = createDefaultDirectorScene();

    expect(buildFlatDirectorConstraintPrompt(scene)).toContain(
      '未单独指定环境，按画面剧情建立环境',
    );
    expect(buildFlatDirectorConstraintPrompt(scene)).not.toContain('场景：使用场景参考图');
    expect(getFlatDirectorReadiness(scene)).toEqual({
      ready: false,
      issues: ['请至少添加一名带身份图的主要人物并指定站位'],
    });

    scene.prompt = '空旷雪原的远景建立镜头';
    expect(getFlatDirectorReadiness(scene).ready).toBe(false);

    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'hero',
        sourceNodeId: 'hero-image',
        label: '女主',
        imageUrl: 'hero.png',
        x: 50,
        y: 70,
        scale: 100,
        rotation: 0,
      }),
    ];
    expect(getFlatDirectorReadiness(scene)).toEqual({ ready: true, issues: [] });
  });

  it('rejects built-in empty-state artwork as a person or scene reference', () => {
    const scene = createDefaultDirectorScene();
    const placeholder = placeholderImage('views').images?.[0] ?? '';
    expect(placeholder).toBeTruthy();
    scene.sceneUrl = placeholder;
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'placeholder-person',
        sourceNodeId: 'views-node',
        label: '占位人物',
        imageUrl: placeholder,
        x: 50,
        y: 70,
        scale: 100,
        rotation: 0,
      }),
    ];

    expect(getFlatDirectorReadiness(scene)).toEqual({
      ready: false,
      issues: ['有 1 名主要人物缺少身份参考图', '场景参考图仍是占位图，请选择真实场景图片'],
    });
    expect(buildFlatDirectorReferenceImages(scene, 'layout.png')).toEqual(['layout.png']);
    expect(flatDirectorReferenceOverflow(scene)).toBe(0);
  });

  it('rejects one image reused as the scene and a subject or by two subjects', () => {
    const scene = createDefaultDirectorScene();
    scene.sceneUrl = 'shared.png';
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'hero',
        sourceNodeId: 'hero-image',
        label: '女主',
        imageUrl: 'shared.png',
        x: 35,
        y: 60,
        scale: 100,
        rotation: 0,
      }),
    ];

    expect(getFlatDirectorReadiness(scene).issues).toContain(
      '场景图与每名主要人物必须使用不同的参考图片',
    );

    scene.sceneUrl = 'scene.png';
    scene.subjects.push(
      createDefaultDirectorSubject({
        id: 'support',
        sourceNodeId: 'support-image',
        label: '男主',
        imageUrl: 'shared.png',
        x: 65,
        y: 60,
        scale: 100,
        rotation: 0,
      }),
    );
    expect(getFlatDirectorReadiness(scene).issues).toContain(
      '场景图与每名主要人物必须使用不同的参考图片',
    );
  });

  it('keeps A/B identity order while stating exact feet anchors and spatial ordering', () => {
    const scene = createDefaultDirectorScene();
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'right-back',
        sourceNodeId: 'right-back-image',
        label: '右后人物',
        imageUrl: 'right-back.png',
        x: 78,
        y: 24,
        scale: 90,
        rotation: 0,
      }),
      createDefaultDirectorSubject({
        id: 'left-front',
        sourceNodeId: 'left-front-image',
        label: '左前人物',
        imageUrl: 'left-front.png',
        x: 18,
        y: 82,
        scale: 125,
        rotation: 0,
      }),
    ];

    const prompt = buildFlatDirectorConstraintPrompt(scene, '4:5');

    expect(prompt).toContain('最终画幅比例必须为 4:5');
    expect(prompt).toContain('人物 A「右后人物」：画面右侧、后景（脚底站位锚点 x=78%、y=24%');
    expect(prompt).toContain('人物 B「左前人物」：画面左侧、前景（脚底站位锚点 x=18%、y=82%');
    expect(prompt).toContain(
      '主要人物左右顺序（从左到右）：人物 B「左前人物」 → 人物 A「右后人物」',
    );
    expect(prompt).toContain(
      '主要人物景深与遮挡顺序（从后景到前景）：人物 A「右后人物」 → 人物 B「左前人物」',
    );
    expect(prompt).toContain('字母、编号框、箭头、网格、辅助线和坐标文字只用于构图约束');
    expect(buildFlatDirectorReferenceManifest(scene).map((item) => item.label)).toEqual([
      '二维构图控制图',
      '人物 A · 右后人物',
      '人物 B · 左前人物',
    ]);
  });

  it('ignores legacy subjects without identity images when calculating reference capacity', () => {
    const scene = createDefaultDirectorScene();
    scene.sceneUrl = 'scene.png';
    scene.subjects = Array.from({ length: 4 }, (_, index) =>
      createDefaultDirectorSubject({
        id: `marker-${index}`,
        sourceNodeId: `missing-${index}`,
        label: `无图人物 ${index + 1}`,
        imageUrl: '',
        x: 20 + index * 15,
        y: 50,
        scale: 100,
        rotation: 0,
      }),
    );

    expect(flatDirectorReferenceOverflow(scene)).toBe(0);
    expect(buildFlatDirectorReferenceImages(scene, 'layout.png')).toEqual([
      'layout.png',
      'scene.png',
    ]);
  });

  it('removes a selected person and renumbers only untouched default person labels', () => {
    const scene = createDefaultDirectorScene();
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'first',
        sourceNodeId: 'image-1',
        label: '人物 1',
        imageUrl: 'first.png',
        x: 20,
        y: 50,
        scale: 120,
        rotation: 0,
      }),
      createDefaultDirectorSubject({
        id: 'hero',
        sourceNodeId: 'image-2',
        label: '男主角',
        imageUrl: 'hero.png',
        x: 50,
        y: 50,
        scale: 120,
        rotation: 0,
      }),
      createDefaultDirectorSubject({
        id: 'third',
        sourceNodeId: 'image-3',
        label: '人物 3',
        imageUrl: 'third.png',
        x: 80,
        y: 50,
        scale: 120,
        rotation: 0,
      }),
    ];

    const updated = removeFlatDirectorSubject(scene, 'first');

    expect(updated.subjects.map((subject) => [subject.id, subject.label])).toEqual([
      ['hero', '男主角'],
      ['third', '人物 2'],
    ]);
    expect(buildFlatDirectorReferenceImages(updated, 'layout.png')).toEqual([
      'layout.png',
      'hero.png',
      'third.png',
    ]);
  });
});
