import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { AssetFile, EpisodeDetail, SelectedAssets } from '@/lib/types';
import type { SceneVisual } from '../../../src/lib/sceneVisualPlan';
import { visualRows, visualSource } from '@/lib/visual-plan';

type Props = {
  detail: EpisodeDetail;
  selected: SelectedAssets;
  disabled?: boolean;
  onChange: (selected: SelectedAssets) => void;
  onUpload: (id: number, file: File) => Promise<AssetFile>;
};

export function SceneVisualEditor({ detail, selected, disabled, onChange, onUpload }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  let timingError = '';
  let rows;
  try { rows = visualRows(detail, selected); }
  catch (error) {
    timingError = error instanceof Error ? error.message : String(error);
    rows = visualRows(detail, { ...selected, sceneVisuals: undefined });
  }
  const patch = (id: number, update: Partial<SceneVisual>) => {
    const row = rows.find((item) => item.id === id)!;
    onChange({ ...selected, sceneVisuals: { ...selected.sceneVisuals, [id]: {
      source: visualSource(id, row.renderMode, selected.sceneVisuals), ...selected.sceneVisuals?.[id], ...update
    } } });
  };
  const clips = detail.assets.images.flatMap((asset) => asset.clipCandidates || [])
    .filter((asset, index, all) => all.findIndex((item) => item.path === asset.path) === index && !asset.path.includes('/scene-clips/'));
  const locked = disabled || uploading !== null;
  return <section className="scene-plan" aria-label="Scene visual plan">
    <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
      <div><h3 className="font-semibold">Scene visual plan</h3>
        <p className="mt-1 text-sm text-muted-foreground">Choose artwork or an uploaded avatar/video for each section. Story order stays the same.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={locked} onClick={() => onChange({ ...selected,
        sceneVisuals: Object.fromEntries(rows.map((row, index) => [row.id, {
          ...selected.sceneVisuals?.[row.id], source: index === 0 || index === rows.length - 1 ? 'upload' : 'image'
        }]))
      })}>Avatar opening + ending</Button>
      <Button variant="outline" size="sm" disabled={locked} onClick={() => onChange({ ...selected,
        sceneVisuals: Object.fromEntries(rows.map((row) => [row.id, { ...selected.sceneVisuals?.[row.id], source: selected.sceneVisuals?.[row.id]?.source === 'upload' ? 'upload' : 'image' }]))
      })}>Use images for remaining scenes</Button></div>
    </div>
    {timingError && <p role="alert" className="mb-3 text-sm text-destructive">{timingError}</p>}
    {rows.map((row) => {
      const source = visualSource(row.id, row.renderMode, selected.sceneVisuals);
      const settings = selected.sceneVisuals?.[row.id];
      const path = selected.clips?.[row.id];
      const clip = clips.find((asset) => asset.path === path);
      const isOpen = expanded === row.id;
      const trim = settings?.trimStartSeconds || 0;
      return <div key={row.id} className="border-t py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="min-w-36 flex-1 text-left" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : row.id)}>
            <span className="text-sm font-medium">{row.label}</span>
            <span className="ml-3 text-xs tabular-nums text-muted-foreground">{row.startSecond.toFixed(1)}–{(row.startSecond + row.durationSeconds).toFixed(1)}s</span>
            <span className="mt-1 block text-xs text-muted-foreground">{source === 'upload' ? clip ? 'Uploaded video · audio muted' : 'Video needed' : source === 'ai' ? 'AI motion · existing clip or generate' : 'Image · gentle camera motion'} · {isOpen ? 'Hide details' : 'Edit details'}</span>
          </button>
          <select aria-label={`${row.label} visual source`} className="h-9 rounded-md border bg-background px-2 text-sm" value={source} disabled={locked}
            onChange={(event) => { patch(row.id, { source: event.target.value as SceneVisual['source'] }); setExpanded(row.id); }}>
            <option value="image">Image / Gemini artwork</option>
            <option value="upload">Upload avatar / video</option>
            {row.id > 0 && <option value="ai">AI motion (Veo / Wan)</option>}
          </select>
        </div>
        {isOpen && <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">{row.text}</p>
            {source !== 'image' && <>
              <label className="block text-xs font-medium">Selected video
                <select aria-label={`${row.label} selected video`} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={path || ''} disabled={locked}
                  onChange={(event) => {
                    const next = { ...selected.clips };
                    if (event.target.value) next[row.id] = event.target.value; else delete next[row.id];
                    onChange({ ...selected, clips: next });
                  }}>
                  <option value="">Choose an uploaded / generated clip</option>
                  {clips.map((asset) => <option value={asset.path} key={asset.path}>{asset.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium">{uploading === row.id ? 'Uploading…' : 'Upload a clip for this section'}
                <input type="file" aria-label={`${row.label} upload video`} accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" className="mt-2 block w-full text-sm" disabled={locked}
                  onChange={async (event) => {
                    const file = event.target.files?.[0]; event.target.value = '';
                    if (!file) return;
                    setUploading(row.id);
                    try {
                      const asset = await onUpload(row.id, file);
                      if (!mounted.current) return;
                      onChange({ ...selected, clips: { ...selected.clips, [row.id]: asset.path }, sceneVisuals: {
                        ...selected.sceneVisuals, [row.id]: { ...settings, source: 'upload' }
                      } });
                      toast.success(`${row.label} video uploaded`);
                    } catch (error) { toast.error(error instanceof Error ? error.message : 'Upload failed'); }
                    finally { if (mounted.current) setUploading(null); }
                  }} />
              </label>
            </>}
            <div className="flex flex-wrap gap-3">
              <label className="text-xs font-medium">Screen time (seconds)
                <input aria-label={`${row.label} duration`} type="number" min="0.1" max="600" step="0.1" placeholder="Auto" value={settings?.durationSeconds ?? ''} disabled={locked}
                  className="mt-1 block h-9 w-32 rounded-md border bg-background px-2 text-sm"
                  onChange={(event) => patch(row.id, { durationSeconds: event.target.value ? Math.max(0.1, Number(event.target.value)) : undefined })} />
              </label>
              {source !== 'image' && <label className="text-xs font-medium">Start within clip (seconds)
                <input aria-label={`${row.label} trim start`} type="number" min="0" step="0.1" value={trim} disabled={locked}
                  className="mt-1 block h-9 w-32 rounded-md border bg-background px-2 text-sm"
                  onChange={(event) => patch(row.id, { trimStartSeconds: Math.max(0, Number(event.target.value)) })} />
              </label>}
              {source !== 'image' && <label className="text-xs font-medium">If the clip is shorter
                <select aria-label={`${row.label} short clip handling`} className="mt-1 block h-9 rounded-md border bg-background px-2 text-sm" value={settings?.shortClip || 'freeze'} disabled={locked}
                  onChange={(event) => patch(row.id, { shortClip: event.target.value as 'freeze' | 'loop' })}>
                  <option value="freeze">Hold last frame</option><option value="loop">Repeat clip</option>
                </select>
              </label>}
            </div>
            <p className="text-xs text-muted-foreground">Auto fits the remaining narration. Fixed screen time changes pictures only; it does not retime your voice or captions.</p>
            {clip?.durationSeconds && clip.durationSeconds - trim < row.durationSeconds && <p className="text-xs text-amber-700">Only {Math.max(0, clip.durationSeconds - trim).toFixed(1)}s of source video remains; this section will {settings?.shortClip === 'loop' ? 'repeat' : 'hold its last frame'}.</p>}
          </div>
          {clip && source !== 'image' && <video key={clip.path} src={clip.url} controls muted playsInline preload="metadata" className="aspect-[9/16] max-h-64 w-full rounded-md bg-black object-contain" />}
        </div>}
      </div>;
    })}
    <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">Uploaded clip audio is always muted. The selected Voice track plays continuously. Muting does not change mouth movements; generate matching speech in Gemini if visible lip timing matters.</p>
  </section>;
}
