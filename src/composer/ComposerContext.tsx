import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAppTranslation } from '../i18n/appI18n';
import type { GenParams } from '../store/canvasStore';
import type { ComposerReference, ComposerRuntime, ComposerState } from './types';
import { referenceMentionToken, referenceMentionVideoMode } from './referenceMention';
import { reorderComposerReferences, type ReferenceDropPlacement } from './referenceOrder';
import { registerPageUpdateDraft } from '../lib/pageUpdateDrafts';

interface ComposerContextValue {
  runtime: ComposerRuntime;
  state: ComposerState;
  genParams: GenParams;
  setPrompt: (prompt: string) => void;
  setParam: (key: string, value: unknown) => void;
  setGenParam: <K extends keyof GenParams>(key: K, value: GenParams[K]) => void;
  addReference: (ref: ComposerReference) => void;
  removeReference: (id: string) => void;
  reorderReference: (
    draggedId: string,
    targetId: string,
    placement: ReferenceDropPlacement,
  ) => void;
  mentionRequest: {
    id: number;
    token: string;
    reference: ComposerReference;
  } | null;
  insertReferenceMention: (ref: ComposerReference, index: number) => void;
  submit: () => void;
  submitError: string | null;
  clearSubmitError: () => void;
  isGenerating: boolean;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);

export function useComposer(): ComposerContextValue {
  const ctx = useContext(ComposerContext);
  if (!ctx) throw new Error('useComposer must be used inside ComposerProvider');
  return ctx;
}

interface ProviderProps {
  runtime: ComposerRuntime;
  genParams: GenParams;
  initialState?: Partial<ComposerState>;
  onPromptChange?: (prompt: string) => void;
  onDraftCommit?: (state: ComposerState) => void;
  onReferenceAdd?: (state: ComposerState) => void;
  onReferenceRemove?: (state: ComposerState) => void;
  onReferenceReorder?: (state: ComposerState) => void;
  onGenParamChange: <K extends keyof GenParams>(key: K, value: GenParams[K]) => void;
  onSubmit: (state: ComposerState) => void | Promise<void>;
  isGenerating: boolean;
  children: React.ReactNode;
}

export function ComposerProvider({
  runtime,
  genParams,
  initialState,
  onPromptChange,
  onDraftCommit,
  onReferenceAdd,
  onReferenceRemove,
  onReferenceReorder,
  onGenParamChange,
  onSubmit,
  isGenerating,
  children,
}: ProviderProps) {
  const { t } = useAppTranslation();
  const [state, setState] = useState<ComposerState>({
    prompt: initialState?.prompt ?? '',
    references: initialState?.references ?? [],
    params: initialState?.params ?? {},
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastInitialPrompt = useRef(initialState?.prompt ?? '');
  const mentionRequestId = useRef(0);
  const [mentionRequest, setMentionRequest] =
    useState<ComposerContextValue['mentionRequest']>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const clearSubmitError = useCallback(() => setSubmitError(null), []);
  useEffect(() => {
    if (onDraftCommit) return registerPageUpdateDraft(() => onDraftCommit(state));
  }, [onDraftCommit, state]);

  useEffect(() => {
    const prompt = initialState?.prompt ?? '';
    if (prompt === lastInitialPrompt.current) return;
    lastInitialPrompt.current = prompt;
    setState((prev) => (prev.prompt === prompt ? prev : { ...prev, prompt }));
  }, [initialState?.prompt]);

  const setPrompt = useCallback(
    (prompt: string) => {
      setState((prev) => (prev.prompt === prompt ? prev : { ...prev, prompt }));
      onPromptChange?.(prompt);
    },
    [onPromptChange],
  );

  const setParam = useCallback((key: string, value: unknown) => {
    setState((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }));
  }, []);

  const setGenParam = useCallback<ComposerContextValue['setGenParam']>(
    (key, value) => {
      onGenParamChange(key, value);
    },
    [onGenParamChange],
  );

  const addReference = useCallback(
    (ref: ComposerReference) => {
      const currentState = stateRef.current;
      if (currentState.references.some((item) => item.id === ref.id)) return;
      const nextState = {
        ...currentState,
        references: [...currentState.references, ref],
      };
      stateRef.current = nextState;
      setState(nextState);
      // Persist immediately so a node switch cannot discard a freshly uploaded reference.
      onReferenceAdd?.(nextState);
    },
    [onReferenceAdd],
  );

  const removeReference = useCallback(
    (id: string) => {
      const reference = state.references.find((item) => item.id === id);
      if (!reference || reference.locked) return;
      const nextState = {
        ...state,
        references: state.references.filter((item) => item.id !== id),
      };
      setState(nextState);
      // Persist outside the React updater: switching nodes must not undo a dismissal.
      onReferenceRemove?.(nextState);
    },
    [onReferenceRemove, state],
  );

  const reorderReference = useCallback(
    (draggedId: string, targetId: string, placement: ReferenceDropPlacement) => {
      const references = reorderComposerReferences(
        state.references,
        draggedId,
        targetId,
        placement,
      );
      if (references.every((reference, index) => reference === state.references[index])) return;
      const nextState = { ...state, references };
      setState(nextState);
      onReferenceReorder?.(nextState);
    },
    [onReferenceReorder, state],
  );

  const insertReferenceMention = useCallback(
    (reference: ComposerReference, index: number) => {
      const token = referenceMentionToken(reference, index);
      if (!token) return;
      const nextVideoMode = referenceMentionVideoMode(
        reference,
        runtime.spec?.type ?? 'generic',
        runtime.videoTool,
      );
      if (nextVideoMode) {
        setState((prev) => ({
          ...prev,
          params: { ...prev.params, mode: nextVideoMode },
        }));
      }
      mentionRequestId.current += 1;
      setMentionRequest({
        id: mentionRequestId.current,
        token,
        reference,
      });
    },
    [runtime.spec?.type, runtime.videoTool],
  );

  const submit = useCallback(() => {
    if (isSubmitting || isGenerating) return;
    setSubmitError(null);
    setIsSubmitting(true);
    void Promise.resolve()
      .then(() => onSubmit(state))
      .catch((error: unknown) => {
        setSubmitError(
          error instanceof Error
            ? error.message
            : t('composer.error.sendFailed', '发送失败，请稍后重试。'),
        );
      })
      .finally(() => setIsSubmitting(false));
  }, [isGenerating, isSubmitting, onSubmit, state, t]);

  const value = useMemo<ComposerContextValue>(
    () => ({
      runtime,
      state,
      genParams,
      setPrompt,
      setParam,
      setGenParam,
      addReference,
      removeReference,
      reorderReference,
      mentionRequest,
      insertReferenceMention,
      submit,
      submitError,
      clearSubmitError,
      isGenerating: isGenerating || isSubmitting,
    }),
    [
      runtime,
      state,
      genParams,
      setPrompt,
      setParam,
      setGenParam,
      addReference,
      removeReference,
      reorderReference,
      mentionRequest,
      insertReferenceMention,
      submit,
      submitError,
      clearSubmitError,
      isGenerating,
      isSubmitting,
    ],
  );

  return <ComposerContext.Provider value={value}>{children}</ComposerContext.Provider>;
}
