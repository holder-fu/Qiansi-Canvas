import { describe, expect, it } from 'vitest';
import type { AvailableProviderModel } from '../lib/providerRegistry';
import {
  hasReadyComposerModel,
  mergePersistedModelSelection,
  modelSupportsComposerInput,
  resolveComposerModelSelection,
} from './modelSelection';

const GPT_IMAGE: AvailableProviderModel = {
  key: 'codex\u0000codex:$imagegen',
  providerId: 'codex',
  providerName: 'GPT CLI',
  model: 'codex:$imagegen',
  displayName: 'GPT Image',
  label: 'GPT CLI · GPT Image',
  recommended: false,
};

const CODEX_DEFAULT: AvailableProviderModel = {
  key: 'codex\u0000codex:default',
  providerId: 'codex',
  providerName: 'GPT CLI',
  model: 'codex:default',
  displayName: 'Codex 推荐模型',
  label: 'GPT CLI · Codex 推荐模型',
  recommended: true,
};

const CODEX_EXPLICIT: AvailableProviderModel = {
  ...CODEX_DEFAULT,
  key: 'codex\u0000codex:gpt-5.6',
  model: 'codex:gpt-5.6',
  displayName: 'GPT-5.6',
  label: 'GPT CLI · GPT-5.6',
  recommended: false,
};

describe('resolveComposerModelSelection', () => {
  it('selects the only compatible model for a node with no saved selection', () => {
    expect(resolveComposerModelSelection([GPT_IMAGE], {}, {})).toMatchObject({
      selected: GPT_IMAGE,
      automaticSelection: GPT_IMAGE,
      unavailable: false,
    });
  });

  it('prefers the saved favorite for a new node with multiple available models', () => {
    expect(
      resolveComposerModelSelection(
        [CODEX_EXPLICIT, CODEX_DEFAULT],
        {},
        {},
        { providerId: 'codex', model: 'codex:gpt-5.6' },
      ),
    ).toMatchObject({
      selected: CODEX_EXPLICIT,
      automaticSelection: CODEX_EXPLICIT,
      unavailable: false,
    });
  });

  it('does not let a favorite override an explicit node selection', () => {
    expect(
      resolveComposerModelSelection(
        [CODEX_EXPLICIT, CODEX_DEFAULT],
        { providerId: 'codex', model: 'codex:default' },
        {},
        { providerId: 'codex', model: 'codex:gpt-5.6' },
      ),
    ).toMatchObject({ selected: CODEX_DEFAULT, automaticSelection: undefined });
  });

  it('ignores a favorite that is no longer available', () => {
    expect(
      resolveComposerModelSelection(
        [CODEX_DEFAULT],
        {},
        {},
        { providerId: 'removed', model: 'removed-model' },
      ),
    ).toMatchObject({ selected: CODEX_DEFAULT, automaticSelection: CODEX_DEFAULT });
  });

  it('is idempotent after the automatic selection has been saved', () => {
    expect(
      resolveComposerModelSelection(
        [GPT_IMAGE],
        { providerId: 'codex', model: 'codex:$imagegen' },
        {},
      ),
    ).toMatchObject({ selected: GPT_IMAGE, automaticSelection: undefined, unavailable: false });
  });

  it('requires an explicit choice when multiple models are available', () => {
    const second = { ...GPT_IMAGE, key: 'other\u0000image', providerId: 'other' };
    expect(resolveComposerModelSelection([GPT_IMAGE, second], {}, {})).toMatchObject({
      selected: undefined,
      automaticSelection: undefined,
      unavailable: false,
    });
  });

  it('selects the explicit recommended text model when one provider exposes multiple models', () => {
    expect(resolveComposerModelSelection([CODEX_EXPLICIT, CODEX_DEFAULT], {}, {})).toMatchObject({
      selected: CODEX_DEFAULT,
      automaticSelection: CODEX_DEFAULT,
      unavailable: false,
    });
  });

  it('uses the declared default when the node already names that provider', () => {
    expect(
      resolveComposerModelSelection([CODEX_EXPLICIT, CODEX_DEFAULT], { providerId: 'codex' }, {}),
    ).toMatchObject({
      selected: CODEX_DEFAULT,
      automaticSelection: CODEX_DEFAULT,
      unavailable: false,
    });
  });

  it('keeps an existing explicit text model instead of switching to the recommendation', () => {
    expect(
      resolveComposerModelSelection(
        [CODEX_EXPLICIT, CODEX_DEFAULT],
        { providerId: 'codex', model: 'codex:gpt-5.6' },
        {},
      ),
    ).toMatchObject({
      selected: CODEX_EXPLICIT,
      automaticSelection: undefined,
      unavailable: false,
    });
  });

  it('does not guess when a provider exposes more than one recommended model', () => {
    const secondRecommendation = {
      ...CODEX_EXPLICIT,
      key: 'codex\u0000codex:auto-2',
      model: 'codex:auto-2',
      recommended: true,
    };
    expect(
      resolveComposerModelSelection([CODEX_EXPLICIT, CODEX_DEFAULT, secondRecommendation], {}, {}),
    ).toMatchObject({
      selected: undefined,
      automaticSelection: undefined,
      unavailable: false,
    });
  });

  it('does not choose a provider automatically when models come from multiple providers', () => {
    const otherProvider = {
      ...CODEX_EXPLICIT,
      key: 'api\u0000gpt-4.1-mini',
      providerId: 'api',
      providerName: 'OpenAI API',
      model: 'gpt-4.1-mini',
      label: 'OpenAI API · GPT-4.1 mini',
    };
    expect(
      resolveComposerModelSelection([CODEX_EXPLICIT, CODEX_DEFAULT, otherProvider], {}, {}),
    ).toMatchObject({
      selected: undefined,
      automaticSelection: undefined,
      unavailable: false,
    });
  });

  it('does not silently replace an existing unavailable or partial choice', () => {
    expect(
      resolveComposerModelSelection(
        [GPT_IMAGE],
        { providerId: 'old-provider', model: 'old-model' },
        {},
      ),
    ).toMatchObject({
      providerId: 'old-provider',
      model: 'old-model',
      selected: undefined,
      automaticSelection: undefined,
      unavailable: true,
    });
    expect(
      resolveComposerModelSelection([GPT_IMAGE], { providerId: 'old-provider' }, {}),
    ).toMatchObject({ automaticSelection: undefined, unavailable: true });
  });

  it('does not let empty composer strings hide a saved node selection', () => {
    expect(
      resolveComposerModelSelection(
        [GPT_IMAGE],
        { providerId: '', model: '' },
        { providerId: 'old-provider', model: 'old-model' },
      ),
    ).toMatchObject({
      providerId: 'old-provider',
      model: 'old-model',
      automaticSelection: undefined,
      unavailable: true,
    });
  });

  it('never combines a partial composer selection with node fields', () => {
    expect(
      resolveComposerModelSelection(
        [GPT_IMAGE],
        { providerId: 'other-provider' },
        { providerId: 'codex', model: 'codex:$imagegen' },
      ),
    ).toMatchObject({
      providerId: 'other-provider',
      model: undefined,
      automaticSelection: undefined,
      unavailable: true,
    });
  });
});

describe('modelSupportsComposerInput', () => {
  it('accepts visual input only when the model explicitly declares image support', () => {
    expect(modelSupportsComposerInput({ inputModalities: ['text'] }, true)).toBe(false);
    expect(modelSupportsComposerInput({ inputModalities: ['text', 'image'] }, true)).toBe(true);
    expect(modelSupportsComposerInput({}, true)).toBe(false);
    expect(modelSupportsComposerInput({ inputModalities: ['text'] }, false)).toBe(true);
  });
});

describe('hasReadyComposerModel', () => {
  it('accepts only an exact model from the ready catalog', () => {
    expect(
      hasReadyComposerModel(
        [CODEX_DEFAULT],
        { providerId: 'codex', model: 'codex:default' },
        false,
      ),
    ).toBe(true);
    expect(
      hasReadyComposerModel(
        [CODEX_DEFAULT],
        { providerId: 'codex', model: 'codex:removed' },
        false,
      ),
    ).toBe(false);
    expect(hasReadyComposerModel([CODEX_DEFAULT], {}, false)).toBe(false);
  });

  it('rejects a ready text-only model when the request contains visual references', () => {
    const textOnly: AvailableProviderModel = { ...CODEX_DEFAULT, inputModalities: ['text'] };
    expect(
      hasReadyComposerModel([textOnly], { providerId: 'codex', model: 'codex:default' }, true),
    ).toBe(false);
  });
});

describe('mergePersistedModelSelection', () => {
  it('uses the node selection instead of stale composer parameters', () => {
    expect(
      mergePersistedModelSelection(
        { providerId: 'old-provider', model: 'old-model', mode: 'image' },
        { providerId: 'codex', model: 'codex:$imagegen' },
      ),
    ).toEqual({ providerId: 'codex', model: 'codex:$imagegen', mode: 'image' });
  });

  it('keeps legacy composer parameters when the node has no top-level selection', () => {
    expect(
      mergePersistedModelSelection({ providerId: 'legacy-provider', model: 'legacy-model' }, {}),
    ).toEqual({ providerId: 'legacy-provider', model: 'legacy-model' });
  });

  it('does not let empty or partial node defaults erase a legacy text model pair', () => {
    const legacy = { providerId: 'codex', model: 'codex:default', mode: '续写' };
    expect(mergePersistedModelSelection(legacy, { providerId: '', model: '' })).toEqual(legacy);
    expect(mergePersistedModelSelection(legacy, { providerId: 'other-provider' })).toEqual(legacy);
    expect(mergePersistedModelSelection(legacy, { model: 'other-model' })).toEqual(legacy);
  });
});
