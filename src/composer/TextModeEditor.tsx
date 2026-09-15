import { Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { useAppTranslation } from '../i18n/appI18n';
import { TEXT_MODE_DEFINITIONS, type TextModeDefinition } from '../lib/textGeneration';
import { textModeLabel } from '../lib/textModeCatalog';
import { persistTextModeCatalog, useTextModeCatalogStore } from '../store/textModeCatalog';

type TextModeEditorProps = { open: boolean; onClose: () => void };

const BUILTIN_VALUES = new Set<string>(TEXT_MODE_DEFINITIONS.map((mode) => mode.value));

function newCustomMode(index: number): TextModeDefinition {
  const suffix = Date.now().toString(36).slice(-5);
  return {
    key: 'custom',
    value: `custom-${suffix}-${index}`,
    label: `自定义模式 ${index}`,
    description: '按自己的提示词模板处理文本。',
    details: '可在这里填写这个模式适合的使用场景。',
    placeholder: '输入要处理的内容。',
    promptTemplate: '',
    instruction: '按自定义模式处理输入内容。',
  };
}

export function TextModeEditor({ open, onClose }: TextModeEditorProps) {
  const { t } = useAppTranslation();
  const definitions = useTextModeCatalogStore((state) => state.definitions);
  const writable = useTextModeCatalogStore((state) => state.writable);
  const [drafts, setDrafts] = useState<TextModeDefinition[]>(definitions);
  const [selectedValue, setSelectedValue] = useState(definitions[0]?.value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDrafts(definitions);
    setSelectedValue(definitions[0]?.value ?? '');
    setError('');
  }, [definitions, open]);

  const selected = useMemo(
    () => drafts.find((mode) => mode.value === selectedValue) ?? drafts[0],
    [drafts, selectedValue],
  );
  const isBuiltIn = selected ? BUILTIN_VALUES.has(selected.value) : false;

  const updateSelected = (patch: Partial<TextModeDefinition>) => {
    if (!selected) return;
    setDrafts((current) =>
      current.map((mode) => (mode.value === selected.value ? { ...mode, ...patch } : mode)),
    );
  };

  const addMode = () => {
    const next = newCustomMode(drafts.length - TEXT_MODE_DEFINITIONS.length + 1);
    setDrafts((current) => [...current, next]);
    setSelectedValue(next.value);
  };

  const resetSelected = () => {
    if (!selected) return;
    const original = TEXT_MODE_DEFINITIONS.find((mode) => mode.value === selected.value);
    if (original) updateSelected({ ...original });
  };

  const removeSelected = () => {
    if (!selected || isBuiltIn) return;
    const remaining = drafts.filter((mode) => mode.value !== selected.value);
    setDrafts(remaining);
    setSelectedValue(remaining[0]?.value ?? '');
  };

  const save = async () => {
    if (!writable || busy) return;
    setBusy(true);
    setError('');
    const ok = await persistTextModeCatalog(drafts);
    setBusy(false);
    if (ok) onClose();
    else setError(t('composer.mode.editor.saveFailed', '保存失败，可能有其它窗口刚刚修改了模式。'));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('composer.mode.editor.title', '编辑文本处理模式')}
      width="w-[760px]"
      maxHeightClass="max-h-[82vh]"
      headerActions={
        <button
          type="button"
          onClick={addMode}
          disabled={!writable || drafts.length >= 32}
          title={t('composer.mode.editor.add', '新增模式')}
          aria-label={t('composer.mode.editor.add', '新增模式')}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-30"
        >
          <Plus className="h-4 w-4" />
        </button>
      }
    >
      <div className="flex min-h-0 h-full flex-col">
        <div className="flex min-h-0 flex-1">
          <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-white/[0.06] p-3">
            <p className="mb-2 px-2 text-[11px] text-white/45">
              {t('composer.mode.editor.list', '模式列表')}
            </p>
            <div className="flex flex-col gap-1">
              {drafts.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setSelectedValue(mode.value)}
                  className={`flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-[12px] ${selected?.value === mode.value ? 'bg-white/[0.12] text-white' : 'text-white/65 hover:bg-white/[0.06] hover:text-white'}`}
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-white/35" />
                  <span className="min-w-0 flex-1 truncate">{textModeLabel(mode)}</span>
                  {!BUILTIN_VALUES.has(mode.value) && (
                    <span className="text-[10px] text-cyan-300/70">自定义</span>
                  )}
                </button>
              ))}
            </div>
          </aside>
          <section className="min-w-0 flex-1 overflow-y-auto p-5">
            {selected ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] text-white/50">显示名称</label>
                  <input
                    value={selected.label ?? selected.value}
                    onChange={(event) => updateSelected({ label: event.target.value })}
                    className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white outline-none focus:border-cyan-300/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-white/50">模式标识</label>
                  <input
                    value={selected.value}
                    disabled
                    className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] text-white/80 outline-none disabled:cursor-not-allowed disabled:opacity-45 focus:border-cyan-300/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-white/50">功能说明</label>
                  <textarea
                    value={selected.description}
                    onChange={(event) => updateSelected({ description: event.target.value })}
                    rows={2}
                    className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] leading-5 text-white/80 outline-none focus:border-cyan-300/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-white/50">提示词模板</label>
                  <textarea
                    value={selected.promptTemplate}
                    onChange={(event) => updateSelected({ promptTemplate: event.target.value })}
                    rows={5}
                    placeholder="例如：请根据以下内容整理为可复用的提示词：\n{input}"
                    className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] leading-5 text-white/80 outline-none focus:border-cyan-300/50"
                  />
                  <p className="mt-1 text-[10px] text-white/35">
                    使用 {`{input}`} 代表用户输入，留空则沿用系统默认处理。
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-white/50">输入框提示</label>
                  <input
                    value={selected.placeholder}
                    onChange={(event) => updateSelected({ placeholder: event.target.value })}
                    className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] text-white/80 outline-none focus:border-cyan-300/50"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={isBuiltIn ? resetSelected : removeSelected}
                    disabled={!writable}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 text-[11px] text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-35"
                  >
                    {isBuiltIn ? (
                      <RotateCcw className="h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    {isBuiltIn ? '恢复默认' : '删除模式'}
                  </button>
                  <div className="flex items-center gap-2">
                    {error && <span className="text-[11px] text-rose-300">{error}</span>}
                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={!writable || busy}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 text-[12px] font-medium text-white hover:bg-emerald-500 disabled:opacity-35"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {busy ? '保存中…' : '保存模式'}
                    </button>
                  </div>
                </div>
                {!writable && (
                  <p className="text-[11px] text-amber-200/70">
                    当前为协作终端，只能查看模式配置。
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-white/45">暂无可编辑的模式。</p>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}
