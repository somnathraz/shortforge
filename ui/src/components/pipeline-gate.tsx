import { useState } from 'react';
import { SparklesIcon, CpuIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPipeline } from '@/lib/api';
import { usePipeline, type PipelineId } from '@/lib/pipeline';
import { cn } from '@/lib/utils';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 40);
}

function NewPipelineForm({ first, onCancel }: { first: boolean; onCancel: () => void }) {
  const { addPipeline } = usePipeline();
  const [kind, setKind] = useState<'story' | 'tech'>('story');
  const [label, setLabel] = useState('');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [cta, setCta] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveId = idTouched ? id : slugify(label);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { pipeline } = await createPipeline({
        id: effectiveId,
        kind,
        label: label.trim() || effectiveId,
        language: kind === 'tech' ? 'en' : language,
        ...(cta.trim() ? { cta: cta.trim() } : {})
      });
      addPipeline(pipeline);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const kinds = [
    { value: 'story' as const, title: 'Story Shorts', icon: SparklesIcon, text: 'Narrated shorts with generated stills or video, voice-over, music and SFX.' },
    { value: 'tech' as const, title: 'Tech Reels', icon: CpuIcon, text: 'One concept per reel, animated diagrams rendered with Remotion.' }
  ];

  return (
    <div className="mt-8 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setKind(item.value)}
            className={cn(
              'rounded-xl border p-4 text-left transition',
              kind === item.value ? 'border-white/60 bg-white/10' : 'border-white/12 hover:border-white/30'
            )}
          >
            <span className="flex items-center gap-2 font-semibold text-white">
              <item.icon className="size-4" /> {item.title}
            </span>
            <span className="mt-2 block text-xs leading-relaxed text-white/55">{item.text}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm text-white/70">
          Channel name
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My Channel" />
        </label>
        <label className="space-y-1.5 text-sm text-white/70">
          Pipeline id
          <Input
            value={effectiveId}
            onChange={(e) => {
              setIdTouched(true);
              setId(e.target.value.toLowerCase());
            }}
            placeholder="my-channel"
          />
        </label>
        {kind === 'story' && (
          <label className="space-y-1.5 text-sm text-white/70">
            Narration language
            <select
              className="h-9 w-full rounded-md border border-white/15 bg-transparent px-3 text-sm text-white"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}
            >
              <option value="en" className="text-black">English</option>
              <option value="hi" className="text-black">Hindi</option>
            </select>
          </label>
        )}
        <label className="space-y-1.5 text-sm text-white/70">
          Call to action (optional)
          <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Follow My Channel for more." />
        </label>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-3">
        <Button type="button" disabled={busy || effectiveId.length < 2} onClick={() => void submit()}>
          {busy ? 'Creating…' : 'Create pipeline'}
        </Button>
        {!first && (
          <Button type="button" variant="ghost" className="text-white/60" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export function PipelineGate() {
  const { ready, needsGate, pipelines, defaultPipelineId, remember, setRemember, choosePipeline } =
    usePipeline();
  const [creating, setCreating] = useState(false);

  if (!ready || !needsGate) return null;

  if (pipelines.length === 0 || creating) {
    const first = pipelines.length === 0;
    return (
      <div className="pipeline-gate fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-5 py-8">
        <div className="pipeline-gate-panel w-full max-w-3xl rounded-2xl border border-white/10 p-8 shadow-2xl sm:p-10">
          <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-white/45 uppercase">Shortforge</p>
          <h1 className="mt-3 font-[family-name:var(--font-serif)] text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {first ? 'Create your first pipeline' : 'New pipeline'}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/55">
            A pipeline is one channel: its own episodes, look, and YouTube / Instagram / Facebook accounts.
            You can add more later.
          </p>
          <NewPipelineForm first={first} onCancel={() => setCreating(false)} />
        </div>
      </div>
    );
  }

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
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-xl border border-dashed border-white/20 p-5 text-left text-white/60 transition hover:border-white/40 hover:text-white"
          >
            <span className="flex items-center gap-2 font-semibold">
              <PlusIcon className="size-4" /> New pipeline
            </span>
            <span className="mt-3 block text-sm">Add another channel</span>
          </button>
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
