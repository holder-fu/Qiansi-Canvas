import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  DirectorAnimationClip,
  DirectorCharacterColors,
  DirectorRigPose,
  DirectorSubjectPlacement,
} from '../canvas/nodeTypes';
import { DIRECTOR_3D_CATALOG_LANGUAGE_PACKS } from '../i18n/director3dCatalogPacks';
import {
  DEFAULT_CHARACTER_PRESET_ID,
  directorAnimationSampleTimes,
  DIRECTOR_CHARACTER_CATALOG_PRESETS,
  DIRECTOR_CHARACTER_PRESETS,
  DIRECTOR_RIG_JOINTS,
  evaluateDirectorRigFrame,
  getDirectorCharacterPreset,
  normalizeDirectorCharacterColors,
  normalizeDirectorRigPose,
  patchDirectorJointFromTargetAngle,
  patchLinkedDirectorJoint,
} from './directorCharacters';

function subject(
  animationClip: DirectorAnimationClip,
  overrides: Partial<DirectorSubjectPlacement> = {},
): DirectorSubjectPlacement {
  return {
    id: 'actor-1',
    sourceNodeId: 'source-1',
    label: '演员 1',
    imageUrl: '',
    x: 50,
    y: 50,
    scale: 100,
    rotation: 0,
    bodyFacing: 'front',
    bodyAngle: 0,
    bodyTarget: '',
    headDirection: 'follow-body',
    gazeTarget: '',
    motion: 'still',
    action: '',
    emotion: '',
    animationClip,
    animationSpeed: 1,
    animationLoop: true,
    ...overrides,
  };
}

const animatedClips = ['walk', 'run', 'wave', 'turn', 'jump'] as const;

function expectFiniteFrame(frame: ReturnType<typeof evaluateDirectorRigFrame>) {
  expect(Number.isFinite(frame.rootY)).toBe(true);
  expect(Number.isFinite(frame.rootYaw)).toBe(true);
  expect(Object.keys(frame.joints).sort()).toEqual(
    DIRECTOR_RIG_JOINTS.map((joint) => joint.id).sort(),
  );
  expect(Object.values(frame.joints).every(Number.isFinite)).toBe(true);
}

describe('director character presets', () => {
  it('provides the six distinct built-in actors with complete palettes and proportions', () => {
    expect(DIRECTOR_CHARACTER_PRESETS.map((preset) => preset.id)).toEqual([
      'cinematic-male',
      'cinematic-female',
      'action-hero',
      'stylized-youth',
      'studio-mannequin',
      'studio-man',
    ]);
    expect(DIRECTOR_CHARACTER_CATALOG_PRESETS.map((preset) => preset.id)).toEqual([
      'studio-mannequin',
      'studio-man',
      'cinematic-male',
      'cinematic-female',
      'action-hero',
      'stylized-youth',
    ]);
    expect(new Set(DIRECTOR_CHARACTER_PRESETS.map((preset) => preset.id)).size).toBe(6);

    for (const preset of DIRECTOR_CHARACTER_PRESETS) {
      expect(preset.label.trim()).not.toBe('');
      expect(preset.role.trim()).not.toBe('');
      expect(preset.description.trim()).not.toBe('');
      expect(Object.keys(preset.colors)).toEqual(['skin', 'outfit', 'accent', 'hair']);
      expect(Object.values(preset.colors).every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(
        true,
      );
      expect(Object.values(preset.proportions).every((value) => value > 0)).toBe(true);
    }

    const mannequin = getDirectorCharacterPreset('studio-mannequin');
    expect(mannequin.model?.url).toContain('studio-mannequin.glb');
    expect(mannequin.model?.faceDirection).toEqual([0, 0, 1]);
    expect(mannequin.thumbnailUrl).toContain('studio-mannequin-thumbnail.png');
    expect(Object.keys(mannequin.model?.bones ?? {}).sort()).toEqual(
      DIRECTOR_RIG_JOINTS.map((joint) => joint.id).sort(),
    );

    const studioMan = getDirectorCharacterPreset('studio-man');
    expect(studioMan.model?.url).toContain('studio-man.glb');
    expect(studioMan.model?.faceDirection).toEqual([0, 0, 1]);
    expect(studioMan.thumbnailUrl).toContain('studio-man-thumbnail.png');
    expect(Object.keys(studioMan.model?.bones ?? {}).sort()).toEqual(
      DIRECTOR_RIG_JOINTS.map((joint) => joint.id).sort(),
    );
    expect(
      DIRECTOR_3D_CATALOG_LANGUAGE_PACKS['zh-CN']['director3d.catalog.character.studioMan.label'],
    ).toBe('写实绑定男演员');
    expect(
      DIRECTOR_3D_CATALOG_LANGUAGE_PACKS['en-US']['director3d.catalog.character.studioMan.label'],
    ).toBe('Rigged realistic male actor');
  });

  it('ships both configured real actors as skinned GLBs with every mapped Mixamo bone', () => {
    for (const [presetId, fileName] of [
      ['studio-mannequin', 'studio-mannequin.glb'],
      ['studio-man', 'studio-man.glb'],
    ] as const) {
      const preset = getDirectorCharacterPreset(presetId);
      expect(preset.model?.url).toContain(fileName);

      const bytes = readFileSync(
        fileURLToPath(new URL(`../assets/director/${fileName}`, import.meta.url)),
      );
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');

      const jsonLength = bytes.readUInt32LE(12);
      const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as {
        nodes?: Array<{ name?: string }>;
        skins?: unknown[];
      };
      const nodeNames = new Set(document.nodes?.flatMap((node) => (node.name ? [node.name] : [])));

      expect(document.skins?.length).toBeGreaterThan(0);
      expect(Object.values(preset.model?.bones ?? {}).every((name) => nodeNames.has(name))).toBe(
        true,
      );
    }
  });

  it('resolves every preset and falls back to the declared default', () => {
    for (const preset of DIRECTOR_CHARACTER_PRESETS) {
      expect(getDirectorCharacterPreset(preset.id)).toBe(preset);
    }

    expect(DEFAULT_CHARACTER_PRESET_ID).toBe('cinematic-male');
    expect(getDirectorCharacterPreset(void 0)).toBe(DIRECTOR_CHARACTER_PRESETS[0]);
    expect(getDirectorCharacterPreset(void 0).id).toBe(DEFAULT_CHARACTER_PRESET_ID);
    expect(
      getDirectorCharacterPreset(
        'unknown-persisted-preset' as Parameters<typeof getDirectorCharacterPreset>[0],
      ).id,
    ).toBe(DEFAULT_CHARACTER_PRESET_ID);
  });
});

describe('director character color normalization', () => {
  it('preserves valid six-digit hex colors and fills missing slots from the selected preset', () => {
    const input: Partial<DirectorCharacterColors> = {
      skin: '#Aa10fF',
      accent: '#123456',
    };
    const snapshot = { ...input };
    const fallback = getDirectorCharacterPreset('cinematic-female').colors;

    expect(normalizeDirectorCharacterColors(input, 'cinematic-female')).toEqual({
      skin: '#Aa10fF',
      outfit: fallback.outfit,
      accent: '#123456',
      hair: fallback.hair,
    });
    expect(input).toEqual(snapshot);
  });

  it.each([
    ['skin', 'c98f6b'],
    ['outfit', '#abc'],
    ['accent', '#12345678'],
    ['hair', ' #123456'],
  ] as const)('replaces an invalid %s color with the preset value', (slot, invalidColor) => {
    const fallback = getDirectorCharacterPreset('action-hero').colors;
    const input = { [slot]: invalidColor } as Partial<DirectorCharacterColors>;

    expect(normalizeDirectorCharacterColors(input, 'action-hero')[slot]).toBe(fallback[slot]);
  });

  it('rejects non-string color values and uses the default palette when no preset is supplied', () => {
    const invalid = {
      skin: 0,
      outfit: null,
      accent: false,
      hair: undefined,
    } as unknown as Partial<DirectorCharacterColors>;

    expect(normalizeDirectorCharacterColors(invalid)).toEqual(
      getDirectorCharacterPreset(DEFAULT_CHARACTER_PRESET_ID).colors,
    );
  });

  it('migrates the texture-dependent studio-man palette to its lightweight material colors', () => {
    expect(
      normalizeDirectorCharacterColors(
        {
          skin: '#ffffff',
          outfit: '#64748b',
          accent: '#38bdf8',
          hair: '#231b18',
        },
        'studio-man',
      ),
    ).toEqual(getDirectorCharacterPreset('studio-man').colors);
  });
});

describe('director rig normalization and linked joints', () => {
  it('returns an empty pose for a missing value', () => {
    expect(normalizeDirectorRigPose(void 0)).toEqual({});
  });

  it('clamps every recognized joint to its own range', () => {
    const aboveMaximum = Object.fromEntries(
      DIRECTOR_RIG_JOINTS.map((joint) => [joint.id, joint.max + 1000]),
    ) as DirectorRigPose;
    const belowMinimum = Object.fromEntries(
      DIRECTOR_RIG_JOINTS.map((joint) => [joint.id, joint.min - 1000]),
    ) as DirectorRigPose;

    expect(normalizeDirectorRigPose(aboveMaximum)).toEqual(
      Object.fromEntries(DIRECTOR_RIG_JOINTS.map((joint) => [joint.id, joint.max])),
    );
    expect(normalizeDirectorRigPose(belowMinimum)).toEqual(
      Object.fromEntries(DIRECTOR_RIG_JOINTS.map((joint) => [joint.id, joint.min])),
    );
  });

  it('keeps finite in-range values while removing invalid and unknown joints', () => {
    const dirtyPose = {
      spine: 12.5,
      neck: Number.NaN,
      leftShoulder: Number.POSITIVE_INFINITY,
      rightShoulder: '20',
      tail: 42,
    } as unknown as DirectorRigPose;

    expect(normalizeDirectorRigPose(dirtyPose)).toEqual({ spine: 12.5 });
  });

  it.each([
    ['leftShoulder', 'rightShoulder'],
    ['leftElbow', 'rightElbow'],
    ['leftHip', 'rightHip'],
    ['leftKnee', 'rightKnee'],
  ] as const)('mirrors linked %s and %s joints in both directions', (left, right) => {
    expect(patchLinkedDirectorJoint({}, left, 37, true)).toMatchObject({
      [left]: 37,
      [right]: -37,
    });
    expect(patchLinkedDirectorJoint({}, right, -23, true)).toMatchObject({
      [left]: 23,
      [right]: -23,
    });
  });

  it('clamps linked edits, does not link torso joints, and never mutates the current pose', () => {
    const current: DirectorRigPose = { leftShoulder: 5, rightShoulder: 19, spine: 4 };
    const snapshot = { ...current };

    expect(patchLinkedDirectorJoint(current, 'leftShoulder', 999, false)).toEqual({
      spine: 4,
      leftShoulder: 170,
      rightShoulder: 19,
    });
    expect(patchLinkedDirectorJoint(current, 'leftElbow', 999, true)).toMatchObject({
      leftElbow: 145,
      rightElbow: -145,
    });
    expect(patchLinkedDirectorJoint(current, 'spine', 22, true)).toEqual({
      spine: 22,
      leftShoulder: 5,
      rightShoulder: 19,
    });
    expect(current).toEqual(snapshot);
  });

  it('converts a viewport target angle into a manual offset from the active base pose', () => {
    expect(patchDirectorJointFromTargetAngle({}, 'leftShoulder', 35, -15, false)).toEqual({
      leftShoulder: 50,
    });
  });

  it('keeps linked mirroring and joint limits when a viewport drag exceeds the range', () => {
    expect(patchDirectorJointFromTargetAngle({}, 'leftElbow', 240, 10, true)).toEqual({
      leftElbow: 145,
      rightElbow: -145,
    });
  });
});

describe('director procedural animation', () => {
  it('samples looping clips away from common cycle boundaries', () => {
    expect(directorAnimationSampleTimes(5, 3)).toEqual([
      0,
      expect.closeTo(1.85),
      expect.closeTo(4.15),
    ]);
    expect(directorAnimationSampleTimes(8, 5)).toEqual([
      0,
      expect.closeTo(1.44),
      expect.closeTo(3.12),
      expect.closeTo(5.04),
      expect.closeTo(7.04),
    ]);
    expect(directorAnimationSampleTimes(Number.NaN, 99)).toEqual([0, 0, 0, 0, 0]);
  });

  it.each(animatedClips)(
    '%s is deterministic and finite at start, midpoint, and endpoint',
    (clip) => {
      const actor = subject(clip, { animationLoop: false });

      for (const time of [0, 0.5, 1]) {
        const first = evaluateDirectorRigFrame(actor, time);
        const second = evaluateDirectorRigFrame(actor, time);

        expect(first).toEqual(second);
        expectFiniteFrame(first);
      }
    },
  );

  it.each(animatedClips)('%s clamps negative time and holds its non-looping endpoint', (clip) => {
    const actor = subject(clip, { animationLoop: false });

    expect(evaluateDirectorRigFrame(actor, -10)).toEqual(evaluateDirectorRigFrame(actor, 0));
    expect(evaluateDirectorRigFrame(actor, 10)).toEqual(evaluateDirectorRigFrame(actor, 1));
  });

  it.each([
    ['walk', 34, 45, 4, 0.035],
    ['run', 58, 74, 13, 0.1],
  ] as const)(
    'evaluates the linked counter-swing and body lift of %s',
    (clip, amplitude, knee, spine, lift) => {
      const frame = evaluateDirectorRigFrame(subject(clip), 0.125);
      const swing = Math.SQRT1_2;

      expect(frame.joints.leftShoulder).toBeCloseTo(-amplitude * swing);
      expect(frame.joints.rightShoulder).toBeCloseTo(amplitude * swing);
      expect(frame.joints.leftHip).toBeCloseTo(amplitude * 0.78 * swing);
      expect(frame.joints.rightHip).toBeCloseTo(-amplitude * 0.78 * swing);
      expect(frame.joints.leftElbow).toBeCloseTo(0);
      expect(frame.joints.rightElbow).toBeCloseTo(-42 * swing);
      expect(frame.joints.leftKnee).toBeCloseTo(0);
      expect(frame.joints.rightKnee).toBeCloseTo(knee * swing);
      expect(frame.joints.spine).toBe(spine);
      expect(frame.rootY).toBeCloseTo(lift);
      expect(frame.rootYaw).toBe(0);
    },
  );

  it('keeps the waving arm raised while articulating the elbow and neck', () => {
    const timeAtElbowPeak = 5 / 34;
    const frame = evaluateDirectorRigFrame(subject('wave'), timeAtElbowPeak);

    expect(frame.joints.rightShoulder).toBe(148);
    expect(frame.joints.rightElbow).toBeCloseTo(-32);
    expect(frame.joints.neck).toBeCloseTo(Math.sin((5 * Math.PI) / 34) * 4);
    expect(frame.rootY).toBe(0);
    expect(frame.rootYaw).toBe(0);
  });

  it('turns continuously when looping and stops at one revolution when non-looping', () => {
    expect(evaluateDirectorRigFrame(subject('turn'), 0.5).rootYaw).toBeCloseTo(Math.PI);
    expect(evaluateDirectorRigFrame(subject('turn'), 1.5).rootYaw).toBeCloseTo(Math.PI * 3);

    const oneShot = subject('turn', { animationLoop: false });
    expect(evaluateDirectorRigFrame(oneShot, 0.5).rootYaw).toBeCloseTo(Math.PI);
    expect(evaluateDirectorRigFrame(oneShot, 1).rootYaw).toBeCloseTo(Math.PI * 2);
    expect(evaluateDirectorRigFrame(oneShot, 100).rootYaw).toBeCloseTo(Math.PI * 2);
  });

  it('moves jump from a crouched boundary through the apex and back to landing', () => {
    const actor = subject('jump');
    const start = evaluateDirectorRigFrame(actor, 0);
    const apex = evaluateDirectorRigFrame(actor, 0.5);
    const landing = evaluateDirectorRigFrame(actor, 1);

    expect(start.rootY).toBeCloseTo(0);
    expect(start.joints).toMatchObject({
      leftShoulder: -35,
      rightShoulder: 35,
      leftHip: 48,
      rightHip: -48,
      leftKnee: -58,
      rightKnee: 58,
    });
    expect(apex.rootY).toBeCloseTo(0.72);
    expect(apex.joints).toMatchObject({
      leftShoulder: -85.4,
      rightShoulder: 85.4,
      leftHip: 24,
      rightHip: -24,
    });
    expect(apex.joints.leftKnee).toBeCloseTo(0);
    expect(apex.joints.rightKnee).toBeCloseTo(0);
    expect(landing.rootY).toBeCloseTo(start.rootY);
    expect(landing.joints.leftHip).toBeCloseTo(start.joints.leftHip);
    expect(landing.joints.rightHip).toBeCloseTo(start.joints.rightHip);
    expect(landing.joints.leftKnee).toBeCloseTo(start.joints.leftKnee);
    expect(landing.joints.rightKnee).toBeCloseTo(start.joints.rightKnee);
  });

  it('clamps playback speed and applies normalized manual joint offsets last', () => {
    const minimumSpeed = subject('turn', { animationSpeed: -5 });
    const maximumSpeed = subject('turn', { animationSpeed: 99 });

    expect(evaluateDirectorRigFrame(minimumSpeed, 1).rootYaw).toBeCloseTo(Math.PI / 2);
    expect(evaluateDirectorRigFrame(maximumSpeed, 0.25).rootYaw).toBeCloseTo(Math.PI);

    const frame = evaluateDirectorRigFrame(
      subject('walk', { rigPose: { leftShoulder: 10, rightKnee: 999 } }),
      0.125,
    );
    expect(frame.joints.leftShoulder).toBeCloseTo(-34 * Math.SQRT1_2 + 10);
    expect(frame.joints.rightKnee).toBeCloseTo(45 * Math.SQRT1_2 + 130);
  });
});
