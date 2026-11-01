import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getVideoExperiments, startVideoExperiment, type ExperimentModel, type ExperimentPreview, type ExperimentStatus } from '@/lib/video-experiments';

export function VideoExperiments({ file, disabled, selectionKey, saveSelections }: {
  file: string; disabled: boolean; selectionKey: string; saveSelections: () => Promise<boolean>;
}) {
  const [model, setModel] = useState<ExperimentModel>('kling');
  const [status, setStatus] = useState<ExperimentStatus | null>(null);
  const [preview, setPreview] = useState<ExperimentPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await getVideoExperiments(file); if (!disposed) setStatus(next); }
      catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Could not load experiments'); }
      finally { if (!disposed) timer = setTimeout(poll, 3000); }
    };
    void poll();
    return () => { disposed = true; mounted.current = false; clearTimeout(timer); };
  }, [file]);
  useEffect(() => { setPreview(null); }, [selectionKey, model]);
  const busy = pending || status?.busy || disabled;
  const paidDisabled = busy || !preview || !status?.configured || !status.approved;
  async function act(action: 'plan' | 'test' | 'run' | 'assemble') {
    setPending(true); setError('');
    try {
      if (!(await saveSelections())) throw new Error('Save your selections before starting an experiment.');
      const next = await startVideoExperiment(file, { action, model, ...(action !== 'plan' && preview ? { runId: preview.runId } : {}) });
      if (!mounted.current) return;
      setPreview(next);
      setStatus(await getVideoExperiments(file));
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Experiment failed'); }
    finally { if (mounted.current) setPending(false); }
  }
  const current = status?.runs.find(run => run.runId === preview?.runId);
  return <section aria-labelledby="fal-experiment-title" className="border-b px-6 py-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="fal-experiment-title" className="text-base font-semibold">Animate with fal.ai</h3>
        <p className="mt-1 text-sm text-muted-foreground">Test your selected images with Kling or LTX, keeping your narration and captions.</p>
      </div>
      <span className="text-xs text-muted-foreground">Optional experiment</span>
    </div>
    {status && !status.configured && <p className="mt-3 text-sm text-muted-foreground">
      Add <code>FAL_KEY</code> to the server’s <code>.env</code> and restart the UI server to generate videos.{' '}
      <a className="underline" href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer">Get a fal API key</a>. Preview works without a key.
    </p>}
    {status && !status.approved && <p className="mt-2 text-sm text-muted-foreground">Approve script, voice and visuals before generating.</p>}
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5 text-sm"><label htmlFor="fal-model">Video model</label>
        <select id="fal-model" className="h-9 rounded-md border bg-background px-3 text-foreground" value={model}
          disabled={Boolean(busy)} onChange={event => setModel(event.target.value as ExperimentModel)}>
          <option value="kling">Kling 2.5 Turbo Pro</option><option value="ltx">LTX-2.3 Fast</option>
        </select>
      </div>
      <Button variant="outline" disabled={Boolean(busy)} onClick={() => void act('plan')}>{pending ? 'Working…' : 'Preview experiment'}</Button>
      <Button disabled={Boolean(paidDisabled)} onClick={() => void act('test')}>Test 1 clip · Paid</Button>
      <Button variant="outline" disabled={Boolean(paidDisabled)} onClick={() => void act('run')}>Generate / resume full video · Paid</Button>
      {current && current.completed === current.total && <Button variant="outline" disabled={Boolean(busy || !preview || !status?.approved)} onClick={() => void act('assemble')}>Reassemble saved clips</Button>}
    </div>
    {preview && <p className="mt-3 text-sm" role="status">{preview.images} images → {preview.clips} clips · {preview.durationSeconds.toFixed(1)}s final · {preview.generationSeconds}s generated
      <span className="block text-xs text-muted-foreground">Provider rounds clip durations up. Pricing is shown in your fal account. Existing clips are reused on resume.</span>
    </p>}
    {status?.busy && <p className="mt-3 text-sm" role="status">Generating… Progress is saved. You can leave this panel and return.</p>}
    {(error || status?.error) && <p className="mt-3 text-sm text-destructive" role="alert">{error || status?.error}</p>}
    {!!status?.runs.length && <div className="mt-5 space-y-4">
      <h4 className="text-sm font-medium">Experiment results</h4>
      {status.runs.map(run => <div key={run.runId} className="border-t pt-3">
        <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{run.model === 'kling' ? 'Kling' : 'LTX'} · {run.completed}/{run.total} clips</strong>
          <span className="text-muted-foreground">{run.status} · {run.durationSeconds.toFixed(1)}s</span></div>
        <progress aria-label={`${run.model} completed clips`} className="mt-2 h-1.5 w-full accent-primary" max={run.total} value={run.completed} />
        {run.error && <p role="alert" className="mt-2 text-sm text-destructive">{run.error}</p>}
        {run.finalUrl && <div className="mt-3"><video controls preload="metadata" src={run.finalUrl} className="max-h-96 max-w-full rounded-md" aria-label={`${run.model} final video`} />
          <a className="mt-2 inline-block text-sm underline" href={run.finalUrl} download>Download final video</a></div>}
        {!!run.clips.length && <details className="mt-2 text-sm"><summary className="cursor-pointer">Preview generated clips</summary>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2">{run.clips.map(clip => <figure key={clip.id} className="w-36 shrink-0">
            <video controls preload="none" src={clip.url} className="aspect-[9/16] w-full rounded-md bg-muted" aria-label={`${run.model} ${clip.id}`} />
            <figcaption className="mt-1 text-xs text-muted-foreground">{clip.id}</figcaption></figure>)}</div></details>}
      </div>)}
      {status.runs.length > 1 && <p className="text-xs text-muted-foreground">{new Set(status.runs.map(run => run.comparisonKey)).size === 1
        ? 'These runs use the same images, narration and edit for comparison.' : 'Some runs use different source selections. Compare matching inputs for a fair test.'}</p>}
    </div>}
  </section>;
}
