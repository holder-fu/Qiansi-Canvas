import type { ComposerControlType, NodeCapability, ComposerSpec } from '../graph/types';
import type { VisualMark } from '../canvas/nodeTypes';
import type { CameraPromptCue } from '../lib/cameraPrompt';

/**
 * A reference asset attached to the composer (image, video, audio, text).
 * These are usually derived from selected upstream nodes or dragged assets.
 */
export interface ComposerReference {
  id: string;
  type: 'image' | 'video' | 'audio' | 'text';
  /** Display-only thumbnail; the full-quality `url` remains the submitted AI reference. */
  previewUrl?: string;
  url?: string;
  label: string;
  /** Locked references are an ordered atomic bundle and cannot be removed independently. */
  locked?: boolean;
  /** Specialized library semantics retained while the media participates in generation. */
  role?: 'style' | 'effect';
  /** Optional style-only text saved with a style-library preset. */
  stylePrompt?: string;
  /** Stable Effects Library preset identity, separate from this reference instance id. */
  effectPresetId?: string;
  /** Optional generation guidance saved with an effects-library video. */
  effectPrompt?: string;
}

/**
 * Runtime context passed to every Composer control.
 * Controls are pure renderers: they read from the context and call onChange.
 */
export interface ComposerControlContext {
  control: ComposerControlType;
  capabilities: NodeCapability[];
  /** Whether this is a multi-selection context. */
  multiSelect: boolean;
  /** Current value of the control (type-dependent). */
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Props for a Composer control component. */
export interface ComposerControlProps {
  context: ComposerControlContext;
}

/** A composer control definition. */
export interface ComposerControlDef {
  type: ComposerControlType;
  component: React.ComponentType<ComposerControlProps>;
}

/** Runtime composer state kept by the floating composer. */
export interface ComposerState {
  /** Primary prompt text. */
  prompt: string;
  /** Resolved references from upstream / selection. */
  references: ComposerReference[];
  /** Active parameter values keyed by control type. */
  params: Record<string, unknown>;
}

/** Contextual metadata for rendering a composer. */
export interface ComposerRuntime {
  spec: ComposerSpec;
  capabilities: NodeCapability[];
  primaryNodeId: string | null;
  selectedNodeIds: string[];
  references: ComposerReference[];
  marks: VisualMark[];
  /** Read-only source/reference text supplied by this node and its direct upstream connections. */
  textContext?: string[];
  /** Structured camera prompts displayed as compact, non-editable chips. */
  cameraPrompts?: CameraPromptCue[];
  placeholder: string;
  /** Non-editable instruction context generated from a video-remake selection. */
  submissionPromptPreview?: {
    prefix: string;
    ranges: string[];
    suffix: string;
  };
  /** Allows a structured tool instruction to be submitted without free-form text. */
  allowEmptyPromptSubmit?: boolean;
  /** Active video tool, used by controls for tool-specific parameter ranges. */
  videoTool?: string;
  /** Video audio participates in the request only after this node explicitly chose it. */
  videoAudioSelectionExplicit?: boolean;
}
