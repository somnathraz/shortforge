import { SparklesIcon, CpuIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePipeline, type PipelineId } from '@/lib/pipeline';
import { cn } from '@/lib/utils';

export function PipelineGate() {
  const { ready, needsGate, pipelines, defaultPipelineId, remember, setRemember, choosePipeline } =
    usePipeline();

  if (!ready || !needsGate) return null;

  return (
    <div className="pipeline-gate fixed inset-0 z-[100] flex items-center justify-center px-5">
      <div className="pipeline-gate-panel w-full max-w-3xl rounded-2xl border border-white/10 p-8 shadow-2xl sm:p-10">
        <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-white/45 uppercase">
          Shortforge
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-serif)] text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Choose a production pipeline
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/55">
          Each pipeline has its own episodes, visuals, and publish accounts. You can switch anytime
          from the top bar.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {pipelines.map((item) => {
            const id = item.id as PipelineId;
            const Icon = item.kind === 'tech' ? CpuIcon : SparklesIcon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => choosePipeline(id)}
                className={cn(
                  'pipeline-card group rounded-xl border border-white/12 p-5 text-left transition',
                  'hover:border-white/30 hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40'
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-white">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-white">{item.label}</p>
                    <p className="text-xs text-white/45">{item.studioSubtitle}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/60">{item.blurb}</p>
                <span className="mt-5 inline-flex text-sm font-medium text-white/80 group-hover:text-white">
                  Enter →
                </span>
              </button>
            );
          })}
        </div>

        <label className="mt-8 flex cursor-pointer items-center gap-2 text-sm text-white/55">
          <input
            type="checkbox"
            className="size-4 rounded border-white/30 bg-transparent"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Remember my choice on this device
        </label>

        <div className="mt-4">
          <Button
            type="button"
            variant="ghost"
            className="text-white/40 hover:bg-white/5 hover:text-white/70"
            onClick={() => choosePipeline(defaultPipelineId)}
          >
            Continue with {pipelines.find((item) => item.id === defaultPipelineId)?.label || 'default'}
          </Button>
        </div>
      </div>
    </div>
  );
}
