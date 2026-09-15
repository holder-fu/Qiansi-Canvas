import { describe, expect, it } from 'vitest';
import {
  buildPoseControlInstruction,
  createDefaultPoseSettings,
  poseControlSvg,
  updatePoseJoint,
  type PosePoint,
} from './poseControl';

const distance = (a: PosePoint, b: PosePoint) => Math.hypot(a.x - b.x, a.y - b.y);

describe('image pose control', () => {
  it('uses two-bone IK for a hand while locked and does not mirror the other arm', () => {
    const settings = createDefaultPoseSettings();
    const originalRight = structuredClone(settings.joints.rightWrist);
    const upperLength = distance(settings.joints.leftShoulder, settings.joints.leftElbow);
    const lowerLength = distance(settings.joints.leftElbow, settings.joints.leftWrist);
    const next = updatePoseJoint(settings, 'leftWrist', { x: 0.2, y: 0.28 });

    expect(distance(next.joints.leftShoulder, next.joints.leftElbow)).toBeCloseTo(upperLength, 5);
    expect(distance(next.joints.leftElbow, next.joints.leftWrist)).toBeCloseTo(lowerLength, 5);
    expect(next.joints.leftWrist.x).toBeCloseTo(0.2, 4);
    expect(next.joints.leftWrist.y).toBeCloseTo(0.28, 4);
    expect(next.joints.rightWrist).toEqual(originalRight);
  });

  it('lets an end joint stretch independently after proportion lock is disabled', () => {
    const settings = { ...createDefaultPoseSettings(), proportionLocked: false };
    const originalElbow = settings.joints.leftElbow;
    const originalRight = settings.joints.rightWrist;
    const next = updatePoseJoint(settings, 'leftWrist', { x: 0.2, y: 0.2 });

    expect(next.joints.leftWrist).toEqual({ x: 0.2, y: 0.2 });
    expect(next.joints.leftElbow).toEqual(originalElbow);
    expect(next.joints.rightWrist).toEqual(originalRight);
  });

  it('rotates the lower limb with its hinge and preserves both bone lengths', () => {
    const settings = createDefaultPoseSettings();
    const upperLength = distance(settings.joints.rightHip, settings.joints.rightKnee);
    const lowerLength = distance(settings.joints.rightKnee, settings.joints.rightAnkle);
    const next = updatePoseJoint(settings, 'rightKnee', { x: 0.68, y: 0.68 });

    expect(distance(next.joints.rightHip, next.joints.rightKnee)).toBeCloseTo(upperLength, 5);
    expect(distance(next.joints.rightKnee, next.joints.rightAnkle)).toBeCloseTo(lowerLength, 5);
    expect(next.joints.rightAnkle).not.toEqual(settings.joints.rightAnkle);
  });

  it('moves the complete rig from the body center without changing its proportions', () => {
    const settings = createDefaultPoseSettings();
    const next = updatePoseJoint(settings, 'pelvis', { x: 0.55, y: 0.5 });

    expect(next.joints.pelvis).toEqual({ x: 0.55, y: 0.5 });
    expect(next.joints.head.x - settings.joints.head.x).toBeCloseTo(0.05);
    expect(next.joints.head.y - settings.joints.head.y).toBeCloseTo(-0.04);
    expect(distance(next.joints.leftShoulder, next.joints.leftElbow)).toBeCloseTo(
      distance(settings.joints.leftShoulder, settings.joints.leftElbow),
    );
  });

  it('leans the upper body around the pelvis while legs stay planted', () => {
    const settings = createDefaultPoseSettings();
    const torsoLength = distance(settings.joints.pelvis, settings.joints.neck);
    const next = updatePoseJoint(settings, 'neck', { x: 0.62, y: 0.28 });

    expect(distance(next.joints.pelvis, next.joints.neck)).toBeCloseTo(torsoLength, 5);
    expect(next.joints.leftWrist).not.toEqual(settings.joints.leftWrist);
    expect(next.joints.leftAnkle).toEqual(settings.joints.leftAnkle);
    expect(next.joints.rightAnkle).toEqual(settings.joints.rightAnkle);
  });

  it('builds an identity-safe prompt and a machine-readable articulated guide', () => {
    const settings = updatePoseJoint(createDefaultPoseSettings(), 'leftWrist', {
      x: 0.24,
      y: 0.15,
    });
    const instruction = buildPoseControlInstruction(settings);
    const svg = poseControlSvg(settings);

    expect(instruction).toContain('左臂举起');
    expect(instruction).toContain('黑底灰白人体骨架控制图');
    expect(instruction).toContain('四肢长度稳定');
    expect(instruction).toContain('风格保护：保持原图画风');
    expect(instruction).toContain('背景保护：保持原图背景');
    expect(svg).toContain('fill="#000"');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<line');
    expect(svg).toContain('<circle');
  });

  it('writes disabled protection choices into the model instruction', () => {
    const instruction = buildPoseControlInstruction(createDefaultPoseSettings(), {
      style: false,
      background: false,
    });

    expect(instruction).toContain('风格保护关闭');
    expect(instruction).toContain('背景保护关闭');
  });
});
