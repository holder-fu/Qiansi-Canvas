import { AlertTriangle, ArrowRight, CheckCircle2, Film, Workflow } from 'lucide-react';
import { useAppTranslation } from '../i18n/appI18n';

export function ComfyUiVideoGuide() {
  const { t } = useAppTranslation();
  const steps = [
    { id: 'prepare-workflow', label: t('guide.comfyVideo.step.prepareWorkflow') },
    { id: 'export-api-json', label: t('guide.comfyVideo.step.exportApiJson') },
    { id: 'import-and-check', label: t('guide.comfyVideo.step.importAndCheck') },
    { id: 'select-workflow', label: t('guide.comfyVideo.step.selectWorkflow') },
    { id: 'generate-and-retrieve', label: t('guide.comfyVideo.step.generateAndRetrieve') },
  ];
  const prepareInstructions = [
    t('guide.comfyVideo.prepare.runOnce'),
    t('guide.comfyVideo.prepare.addMarkers'),
    t('guide.comfyVideo.prepare.outputHistory'),
    t('guide.comfyVideo.prepare.exportApi'),
  ];
  const canvasFlowInstructions = [
    t('guide.comfyVideo.canvasFlow.startServices'),
    t('guide.comfyVideo.canvasFlow.importWorkflow'),
    t('guide.comfyVideo.canvasFlow.selectModel'),
    t('guide.comfyVideo.canvasFlow.addInput'),
    t('guide.comfyVideo.canvasFlow.submit'),
    t('guide.comfyVideo.canvasFlow.retrieve'),
  ];
  const markers = [
    ['QIANSI_PROMPT', t('guide.comfyVideo.marker.prompt')],
    ['QIANSI_NEGATIVE', t('guide.comfyVideo.marker.negative')],
    ['QIANSI_IMAGE', t('guide.comfyVideo.marker.image')],
    ['QIANSI_END_IMAGE', t('guide.comfyVideo.marker.endImage')],
    ['QIANSI_WIDTH / QIANSI_HEIGHT', t('guide.comfyVideo.marker.size')],
    ['QIANSI_FRAMES / QIANSI_FPS', t('guide.comfyVideo.marker.timing')],
    ['QIANSI_OUTPUT', t('guide.comfyVideo.marker.output')],
  ] as const;

  return (
    <section className="space-y-4 rounded-xl border border-sky-400/15 bg-sky-400/[0.035] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 text-sky-300">
          <Film className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-[13px] font-semibold text-white/85">{t('guide.comfyVideo.title')}</h3>
          <p className="mt-1 text-[11px] leading-5 text-white/45">
            {t('guide.comfyVideo.description')}
          </p>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-5">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-2 lg:block">
            <div className="rounded-lg border border-white/[0.08] bg-black/10 px-3 py-2.5">
              <p className="text-[10px] text-sky-300/55">
                {t('guide.comfyVideo.stepLabel', undefined, { number: index + 1 })}
              </p>
              <p className="mt-0.5 text-[11px] text-white/65">{step.label}</p>
            </div>
            {index < 4 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/20 lg:hidden" />}
          </div>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Workflow className="h-4 w-4 text-violet-300/70" />
            <h4 className="text-[12px] font-semibold text-white/70">
              {t('guide.comfyVideo.prepare.title')}
            </h4>
          </div>
          <ol className="space-y-2 text-[11px] leading-5 text-white/45">
            {prepareInstructions.map((instruction, index) => (
              <li key={instruction}>
                {index + 1}. {instruction}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
          <h4 className="mb-3 text-[12px] font-semibold text-white/70">
            {t('guide.comfyVideo.canvasFlow.title')}
          </h4>
          <ol className="space-y-2 text-[11px] leading-5 text-white/45">
            {canvasFlowInstructions.map((instruction, index) => (
              <li key={instruction}>
                {index + 1}. {instruction}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.07]">
        <div className="bg-white/[0.035] px-3 py-2 text-[11px] font-medium text-white/60">
          {t('guide.comfyVideo.markers.title')}
        </div>
        <div className="divide-y divide-white/[0.06]">
          {markers.map(([marker, meaning]) => (
            <div
              key={marker}
              className="grid grid-cols-[minmax(145px,0.7fr)_1.3fr] gap-3 px-3 py-2 text-[11px]"
            >
              <code className="text-sky-200/65">{marker}</code>
              <span className="text-white/42">{meaning}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-[11px] leading-5 text-emerald-100/55">
            {t('guide.comfyVideo.safeMapping')}
          </p>
        </div>
        <div className="flex gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-[11px] leading-5 text-amber-100/55">{t('guide.comfyVideo.warning')}</p>
        </div>
      </div>
    </section>
  );
}
