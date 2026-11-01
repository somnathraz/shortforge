import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import {
  cancelWanGenerate,
  explainComfyJob,
  getWanEpisodeStatus,
  getWanHealth,
  saveVisualPrompts,
  startWanGenerate,
  type EpisodeVideoState,
  type SceneVideoRecord,
  type SceneVideoStatus,
  type WanHealth,
  type WanQualityMode
} from '@/lib/api';
import type { AssetFile, EpisodeDetail, SelectedAssets } from '@/lib/types';
import { formatWanPlan, planWanClipFromNarration } from '@/lib/wan-timing';
import { listWanVideoSlots } from '../../../src/lib/wanVideoSlots';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

type Props = {
  detail: EpisodeDetail;
  episodeFile: string;
  selected: SelectedAssets;
  disabled?: boolean;
  onChange: (selected: SelectedAssets) => void;
  onOpenPromptEditor?: () => void;
  onRefresh?: () => void | Promise<void>;
  onPersistSelection?: (selectedOverride?: SelectedAssets) => Promise<boolean>;
};

function imageCandidatesFor(detail: EpisodeDetail, sceneId: number): AssetFile[] {
  return detail.assets.images.find((row) => row.sceneId === sceneId)?.imageCandidates || [];
}

function clipCandidatesFor(detail: EpisodeDetail, sceneId: number): AssetFile[] {
  return detail.assets.images.find((row) => row.sceneId === sceneId)?.clipCandidates || [];
}

/** Ending Wan row only when there is a real ending still/clip — not last-scene reuse. */
function hasDedicatedEndingAsset(detail: EpisodeDetail, selected: SelectedAssets): boolean {
  if (selected.images?.['-1'] || selected.clips?.['-1']) return true;
  const endingRow = detail.assets.images.find((row) => row.sceneId === -1);
  if (endingRow?.imagePath || endingRow?.imageCandidates?.length || endingRow?.clipCandidates?.length) {
    return true;
  }
  return detail.assets.images.some((row) =>
    [...(row.imageCandidates || []), ...(row.clipCandidates || [])].some((file) =>
      /scene-ending/i.test(file.path)
    )
  );
}

function statusLabel(status: SceneVideoStatus | undefined): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'generating':
      return 'Generating';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'stale':
      return 'Stale (image changed)';
    default:
      return 'Not generated';
  }
}

function formatClock(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function formatElapsed(startedAt?: string, finishedAt?: string, elapsedMs?: number): string {
  if (typeof elapsedMs === 'number' && elapsedMs >= 0) {
    return `${(elapsedMs / 1000).toFixed(0)}s`;
  }
  if (!startedAt) return '—';
  const start = Date.parse(startedAt);
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  return `${Math.max(0, Math.round((end - start) / 1000))}s`;
}

function ComfyJobMeta({
  record,
  comfyUrl,
  onReason
}: {
  record: SceneVideoRecord | undefined;
  comfyUrl?: string;
  onReason?: (reason: string) => void;
}) {
  if (!record?.promptId && !record?.startedAt && !record?.queuedAt) return null;
  const base = (comfyUrl || 'http://127.0.0.1:8080').replace(/\/$/, '');
  const historyUrl = record.promptId ? `${base}/history/${record.promptId}` : null;
  return (
    <div className="mt-2 space-y-1 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
      {record.promptId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-sans text-[10px] font-semibold tracking-wide uppercase text-foreground/70">
            Comfy job
          </span>
          <code className="break-all text-foreground">{record.promptId}</code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(record.promptId!);
                toast.success('Comfy prompt id copied');
              } catch {
                toast.error('Copy failed');
              }
            }}
          >
            Copy
          </Button>
          {historyUrl ? (
            <a
              className="text-[10px] text-primary underline-offset-2 hover:underline"
              href={historyUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open /history
            </a>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-sans text-[11px]">
        <span>Start {formatClock(record.startedAt)}</span>
        <span>Queued {formatClock(record.queuedAt)}</span>
        {record.finishedAt ? <span>Done {formatClock(record.finishedAt)}</span> : null}
        <span>
          Elapsed {formatElapsed(record.startedAt, record.finishedAt, record.elapsedMs)}
        </span>
      </div>
      {record.promptId ? (
        <p className="font-sans text-[10px] text-muted-foreground">
          Match in ComfyUI Queue / History, or:{' '}
          <code className="text-[10px]">curl {base}/history/{record.promptId.slice(0, 8)}…</code>
        </p>
      ) : null}
      {record.status === 'failed' ? (
        <div className="space-y-1 font-sans">
          <p className="text-xs font-medium text-destructive">
            {record.error || 'Failed — reason unknown'}
          </p>
          {record.promptId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              onClick={async () => {
                try {
                  const explained = await explainComfyJob(record.promptId!);
                  onReason?.(explained.reason);
                  toast.message(explained.reason, {
                    description: explained.historyUrl || undefined,
                    duration: 12_000
                  });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Could not read Comfy history');
                }
              }}
            >
              Check Comfy reason
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function statusVariant(status: SceneVideoStatus | undefined): 'outline' | 'secondary' | 'destructive' {
  if (status === 'failed') return 'destructive';
  if (status === 'completed') return 'secondary';
  return 'outline';
}

function Collapsible({
  title,
  children,
  defaultOpen = false
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5"
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">
        {title}
      </summary>
      <div className="mt-2 pb-1">{children}</div>
    </details>
  );
}

export function WanSceneRenderer({
  detail,
  episodeFile,
  selected,
  disabled,
  onChange,
  onOpenPromptEditor,
  onRefresh,
  onPersistSelection
}: Props) {
  const [health, setHealth] = useState<WanHealth | null>(null);
  const hosted = health?.provider === 'runway';
  const [checking, setChecking] = useState(false);
  const [videoState, setVideoState] = useState<EpisodeVideoState | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [qualityMode, setQualityMode] = useState<WanQualityMode>('quality');
  const [drafts, setDrafts] = useState<Record<number, { videoPrompt: string; videoNegativePrompt: string }>>(
    {}
  );
  /** Tick any STILL or AI_VIDEO scene for batch generate. */
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  /** Collapse whole scene cards by default after the first few. */
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const allSlots = useMemo(() => {
    const slots = listWanVideoSlots(detail.episode);
    // Script may still have ending.payoffHi (TTS). Visuals omit a separate ending
    // still (reuses last scene) — don't show a fake Ending video row either.
    if (hasDedicatedEndingAsset(detail, selected)) return slots;
    return slots.filter((slot) => slot.id !== -1);
  }, [detail, selected]);
  const selectedIds = useMemo(
    () => allSlots.filter((s) => checked[s.id]).map((s) => s.id),
    [allSlots, checked]
  );
  const batchRunning = Boolean(videoState?.batch?.running);
  const scenesBusy = Object.values(videoState?.scenes || {}).some(
    (s) => s.status === 'generating' || s.status === 'queued'
  );
  /** True while a GPU job is active — never trust a stale "Batch done" over live scene status. */
  const jobActive = batchRunning || scenesBusy;

  const timingOpts = useMemo(
    () => ({
      fps: health?.fps || 16,
      width: health?.width || 704,
      height: health?.height || 1280,
      maxFrames: health?.maxFrames || 193
    }),
    [health?.fps, health?.width, health?.height, health?.maxFrames]
  );

  /** Prefer TTS-aligned visualTimeline length over JSON planned durationSeconds. */
  function narrationSecondsForSlot(slotId: number, fallback: number): number {
    const fromTimeline = detail.visualTimeline?.find((row) => row.id === slotId)?.durationSeconds;
    return typeof fromTimeline === 'number' && fromTimeline > 0 ? fromTimeline : fallback;
  }

  useEffect(() => {
    const nextDrafts: Record<number, { videoPrompt: string; videoNegativePrompt: string }> = {};
    for (const slot of allSlots) {
      nextDrafts[slot.id] = {
        videoPrompt: slot.videoPrompt || '',
        videoNegativePrompt: slot.videoNegativePrompt || ''
      };
    }
    setDrafts(nextDrafts);
  }, [detail.episode.id, allSlots]);

  // Only reset selection when switching episodes — never on status refresh
  useEffect(() => {
    const nextChecked: Record<number, boolean> = {};
    const nextExpanded: Record<number, boolean> = {};
    for (const slot of allSlots) {
      nextChecked[slot.id] = false;
      nextExpanded[slot.id] = slot.id === 0 || slot.id === 1 || slot.id === -1;
    }
    setChecked(nextChecked);
    setExpanded(nextExpanded);
  }, [detail.episode.id, allSlots]);

  async function refreshHealth() {
    try {
      setChecking(true);
      const next = await getWanHealth();
      setHealth(next);
      if (next.qualityMode === 'quality' || next.qualityMode === 'fast') {
        setQualityMode(next.qualityMode);
      }
      if (next.ok) {
        toast.success('ComfyUI connected');
      } else if (next.workflowOk && next.tunnelOpen === false) {
        toast.error('Tunnel closed — start SSH forward');
      } else if (next.workflowOk && next.tunnelOpen && !next.comfyOk) {
        toast.error('Tunnel up — ComfyUI not answering on remote port');
      } else if (!next.workflowOk) {
        toast.error(next.error || 'Wan workflow missing');
      } else {
        toast.error(next.error || 'ComfyUI offline');
      }
    } catch (error) {
      setHealth({
        ok: false,
        comfyOk: false,
        tunnelOpen: false,
        workflowOk: false,
        error: error instanceof Error ? error.message : 'ComfyUI health check failed',
        comfyUrl: 'http://127.0.0.1:8080',
        localPort: '8080',
        remotePort: '8080'
      });
      toast.error(error instanceof Error ? error.message : 'Health check failed');
    } finally {
      setChecking(false);
    }
  }

  function copyTunnelCommand() {
    const cmd =
      health?.tunnelCommand ||
      health?.hint ||
      `ssh -i ~/.ssh/id_vastai -p ${health?.sshPort || '16653'} -N -L ${health?.localPort || '8080'}:127.0.0.1:${health?.remotePort || '8080'} root@${health?.sshHost || 'HOST'}`;
    void navigator.clipboard.writeText(cmd).then(
      () => toast.success('Tunnel command copied'),
      () => toast.error('Could not copy')
    );
  }

  async function refreshStatus() {
    try {
      const next = await getWanEpisodeStatus(episodeFile);
      setVideoState(next);
      return next;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    void refreshHealth();
    void refreshStatus();
  }, [detail.episode.id, episodeFile]);

  useEffect(() => {
    if (!jobActive) return;
    const timer = setInterval(() => {
      void (async () => {
        const next = await refreshStatus();
        const stillBusy =
          Boolean(next?.batch?.running) ||
          Object.values(next?.scenes || {}).some(
            (s) => s.status === 'generating' || s.status === 'queued'
          );
        if (next && !stillBusy) await onRefresh?.();
      })();
    }, 1000);
    return () => clearInterval(timer);
  }, [jobActive, episodeFile, onRefresh]);

  function autoLinkImages() {
    const images = { ...(selected.images || {}) };
    let linked = 0;
    const targets = selectedIds.length ? selectedIds : allSlots.map((s) => s.id);
    for (const sceneId of targets) {
      if (images[String(sceneId)]) continue;
      const newest = imageCandidatesFor(detail, sceneId)[0];
      if (newest?.path) {
        images[String(sceneId)] = newest.path;
        linked += 1;
      }
    }
    onChange({ ...selected, images });
    toast.success(linked ? `Linked ${linked} scene still(s)` : 'Selected scenes already have stills');
  }

  async function saveScenePrompts(sceneId: number) {
    const slot = allSlots.find((row) => row.id === sceneId);
    if (!slot) return;
    const draft = drafts[sceneId] || { videoPrompt: '', videoNegativePrompt: '' };
    // Hook / ending prompts live in the slot defaults — only persist story scenes to episode JSON.
    if (sceneId <= 0) {
      setDrafts((prev) => ({ ...prev, [sceneId]: draft }));
      toast.success(`${slot.label} motion prompts ready for this session`);
      return;
    }
    const scene = detail.episode.scenes.find((row) => row.id === sceneId);
    if (!scene) return;
    try {
      setSavingId(sceneId);
      await saveVisualPrompts(episodeFile, {
        scenes: [
          {
            id: sceneId,
            visualPrompt: scene.visualPrompt,
            videoPrompt: draft.videoPrompt,
            videoNegativePrompt: draft.videoNegativePrompt
          }
        ]
      });
      toast.success(`Scene ${sceneId} motion prompts saved`);
      await onRefresh?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save prompts');
    } finally {
      setSavingId(null);
    }
  }

  async function startJob(
    mode: 'one' | 'all' | 'retry',
    sceneId?: number,
    force = false,
    selectedOverride?: SelectedAssets,
    sceneIds?: number[]
  ) {
    if (!health?.ok) {
      toast.error(health?.error || (hosted ? 'Runway not connected — check RUNWAY_API_KEY' : 'ComfyUI offline — start tunnel + Comfy first'));
      return;
    }
    if (onPersistSelection) {
      const ok = await onPersistSelection(selectedOverride);
      if (!ok) return;
    }
    try {
      const draft =
        sceneId !== undefined
          ? drafts[sceneId]
          : undefined;
      const state = await startWanGenerate(episodeFile, {
        mode,
        force,
        qualityMode,
        ...(sceneId !== undefined ? { sceneId } : {}),
        ...(sceneIds?.length ? { sceneIds } : {}),
        ...(draft?.videoPrompt ? { videoPrompt: draft.videoPrompt } : {}),
        ...(draft?.videoNegativePrompt ? { videoNegativePrompt: draft.videoNegativePrompt } : {})
      });
      setVideoState(state);
      toast.success(
        mode === 'one'
          ? `Slot ${sceneId === 0 ? 'Opening hook' : sceneId === -1 ? 'Ending' : sceneId} queued (${qualityMode === 'fast' ? 'LightX2V 4-step' : '20-step'})`
          : mode === 'retry'
            ? `Retrying failed/stale videos (${qualityMode === 'fast' ? '4-step' : '20-step'})`
            : `Queued ${sceneIds?.length ?? 'batch'} scene(s) · ${qualityMode === 'fast' ? 'LightX2V 4-step' : '20-step'}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start Wan job');
    }
  }

  if (!allSlots.length) {
    return (
      <section className="rounded-xl border border-border bg-muted/10 p-4">
        <h3 className="font-semibold">Scene videos · Wan 2.2 I2V (video)</h3>
        <p className="mt-1 text-sm text-muted-foreground">No scenes in this episode.</p>
      </section>
    );
  }

  const locked = Boolean(disabled);
  const batch = videoState?.batch;
  const activeScene =
    Object.values(videoState?.scenes || {}).find(
      (s) => s.status === 'generating' || s.status === 'queued'
    ) ||
    (batch?.currentSceneId !== undefined
      ? videoState?.scenes[String(batch.currentSceneId)]
      : undefined);
  const displayRunning = jobActive;
  const displayPercent = (() => {
    if (!displayRunning) {
      return typeof batch?.progressPercent === 'number' ? batch.progressPercent : 100;
    }
    // Prefer live scene % while active so we never stick on the previous job's 100%.
    if (activeScene?.status === 'generating' && typeof activeScene.progressPercent === 'number') {
      if (batch?.total && batch.total > 1) {
        const doneShare = (batch.completed || 0) / batch.total;
        const sceneShare = 1 / batch.total;
        return Math.min(
          99,
          Math.round((doneShare + (activeScene.progressPercent / 100) * sceneShare) * 100)
        );
      }
      return Math.min(99, activeScene.progressPercent);
    }
    if (typeof batch?.progressPercent === 'number') {
      return Math.min(99, batch.progressPercent);
    }
    return 5;
  })();
  const displayLabel = (() => {
    if (!displayRunning) return 'Batch done';
    if (activeScene?.status === 'queued') return 'Queued';
    return 'Generating';
  })();
  const displaySceneId =
    activeScene?.sceneId ??
    (batch?.currentSceneId !== undefined ? batch.currentSceneId : undefined);

  return (
    <section className="rounded-xl border border-border bg-muted/10 p-4" aria-label="Scene videos Wan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            {hosted ? `Scene videos · Runway ${health?.model || ''} (hosted)` : 'Scene videos · Wan 2.2 I2V (video)'}
          </h3>
          {hosted ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Generates <span className="font-medium text-foreground">video clips</span> from each scene still on
              Runway&apos;s servers — no GPU or tunnel needed. Each clip is billed in Runway credits
              {health?.usdPerSecond ? ` (≈$${health.usdPerSecond.toFixed(2)}/sec of video)` : ''}. Clip length follows the
              selected TTS, rounded up to what the model allows.
            </p>
          ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Generates <span className="font-medium text-foreground">video clips</span> from each scene
            still (image→video). Clip length follows <span className="font-medium text-foreground">selected TTS</span>{' '}
            (not only JSON plan). Locked to workflow{' '}
            <code className="text-xs">wan22-i2v-a14b-api.json</code>. Tick scenes to queue — one GPU job
            at a time.
          </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hosted ? (
            <Badge variant={checking ? 'outline' : health?.ok ? 'secondary' : health ? 'destructive' : 'outline'}>
              Runway · {checking ? 'Checking…' : health?.ok ? 'connected' : health ? 'not connected' : '—'}
              {health?.creditBalance !== undefined ? ` · ${health.creditBalance} credits` : ''}
            </Badge>
          ) : null}
          {hosted ? null : (<>
          <Badge
            variant={
              checking
                ? 'outline'
                : health?.tunnelOpen
                  ? 'secondary'
                  : health
                    ? 'destructive'
                    : 'outline'
            }
          >
            Tunnel ·{' '}
            {checking ? '…' : health?.tunnelOpen ? `:${health.localPort || '8080'} open` : health ? 'closed' : '—'}
          </Badge>
          <Badge
            variant={
              checking ? 'outline' : health?.ok || health?.comfyOk ? 'secondary' : health ? 'destructive' : 'outline'
            }
          >
            Comfy · {checking ? 'Checking…' : health?.ok || health?.comfyOk ? 'online' : health ? 'offline' : '—'}
          </Badge>
          <Badge
            variant={
              checking
                ? 'outline'
                : health?.workflowOk
                  ? 'secondary'
                  : health
                    ? 'destructive'
                    : 'outline'
            }
          >
            {health?.workflowFamily === 'wan2.2'
              ? 'Workflow Wan 2.2'
              : health?.workflowFamily
                ? `Workflow ${health.workflowFamily}`
                : checking
                  ? 'Workflow …'
                  : health
                    ? 'Workflow missing'
                    : 'Workflow —'}
          </Badge>
          {health?.width && health?.height ? (
            <Badge variant="outline">
              {health.width}×{health.height} @ {health.fps || 16}fps
            </Badge>
          ) : null}
          </>)}
          <Button type="button" variant="outline" size="sm" disabled={checking} onClick={() => void refreshHealth()}>
            {checking ? <Spinner data-icon="inline-start" /> : null}
            Check health
          </Button>
        </div>
      </div>

      {health && hosted ? (
        <div className="mt-3 space-y-1 rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5 text-xs leading-relaxed">
          {health.ok ? (
            <p className="text-emerald-800 dark:text-emerald-200">{health.message || 'Runway connected — ready to generate.'}</p>
          ) : (
            <div className="space-y-1 text-amber-900 dark:text-amber-100">
              <p>{health.error || 'Runway not reachable.'}</p>
              {health.hint ? <p className="text-muted-foreground">{health.hint}</p> : null}
            </div>
          )}
        </div>
      ) : health ? (
        <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5 text-xs leading-relaxed">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span>
              Comfy URL:{' '}
              <code className="text-foreground">{health.comfyUrl || `http://127.0.0.1:${health.localPort || '8080'}`}</code>
            </span>
            <span>
              Forward: Mac <code className="text-foreground">{health.localPort || '8080'}</code> → remote{' '}
              <code className="text-foreground">{health.remotePort || '8080'}</code>
            </span>
            {health.sshHost ? (
              <span>
                SSH: <code className="text-foreground">{health.sshHost}{health.sshPort ? `:${health.sshPort}` : ''}</code>
              </span>
            ) : null}
          </div>
          {health.workflowModels?.length ? (
            <p className="text-muted-foreground">
              Models: {health.workflowModels.slice(0, 4).join(' · ')}
              {health.workflowModels.length > 4 ? '…' : ''}
            </p>
          ) : null}
          {!health.ok ? (
            <div className="space-y-2 border-t border-border/50 pt-2 text-amber-900 dark:text-amber-100">
              <p>{health.error || 'ComfyUI not reachable.'}</p>
              {health.tunnelOpen === false ? (
                <p className="text-muted-foreground">
                  Start the tunnel first, then press Check health again.
                </p>
              ) : null}
              {health.tunnelOpen && !health.comfyOk ? (
                <p className="text-muted-foreground">
                  On the GPU box, start Comfy listening on port {health.remotePort || '8080'} (same as the SSH{' '}
                  <code>-L</code> remote side).
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full flex-1 overflow-x-auto rounded bg-background/80 px-2 py-1 font-mono text-[11px] text-foreground">
                  {health.tunnelCommand || health.hint || 'npm run wan:tunnel:comfy'}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={copyTunnelCommand}>
                  Copy tunnel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-emerald-800 dark:text-emerald-200">ComfyUI answering — ready to generate.</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Press Check health to probe the video provider (Runway, or tunnel + Comfy + workflow for Wan).</p>
      )}

      {batch && (displayRunning || batch.completed > 0 || batch.failed > 0) ? (
        <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-background/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {displayLabel}: {(batch.completed || 0) + (batch.failed || 0)} / {batch.total}
              {displaySceneId !== undefined && displayRunning
                ? ` · Scene ${displaySceneId === 0 ? 'hook' : displaySceneId === -1 ? 'ending' : displaySceneId}`
                : ''}
            </span>
            <span className="font-mono text-xs tabular-nums">
              {displayRunning ? `${displayPercent}%` : '100%'}
            </span>
          </div>
          <Progress value={displayRunning ? displayPercent : 100} className="h-2" />
          {activeScene || (batch.currentSceneId !== undefined && videoState?.scenes[String(batch.currentSceneId)]) ? (
            <ComfyJobMeta
              record={
                activeScene ||
                videoState?.scenes[String(batch.currentSceneId)]
              }
              comfyUrl={hosted ? undefined : health?.comfyUrl || health?.url}
              onReason={(reason) => {
                setVideoState((prev) => {
                  const id = activeScene?.sceneId ?? batch.currentSceneId;
                  if (!prev || id === undefined) return prev;
                  const key = String(id);
                  const cur = prev.scenes[key];
                  if (!cur) return prev;
                  return {
                    ...prev,
                    scenes: { ...prev.scenes, [key]: { ...cur, error: reason } }
                  };
                });
              }}
            />
          ) : null}
          {displayRunning ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={async () => {
                try {
                  const next = await cancelWanGenerate(episodeFile);
                  setVideoState(next);
                  toast.success('Cancelled Wan job + interrupted ComfyUI');
                  await onRefresh?.();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Cancel failed');
                }
              }}
            >
              Cancel ongoing
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] space-y-1">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Sampler mode
          </p>
          <Select
            value={qualityMode}
            onValueChange={(value) => {
              if (value === 'quality' || value === 'fast') setQualityMode(value);
            }}
            disabled={locked || jobActive}
          >
            <SelectTrigger className="w-[260px]" size="sm">
              <SelectValue placeholder="Choose sampler" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quality">Baseline · 20 steps (quality)</SelectItem>
              <SelectItem value="fast">LightX2V · 4 steps (fast test)</SelectItem>
            </SelectContent>
          </Select>
          <p className="max-w-sm text-[11px] leading-relaxed text-muted-foreground">
            {qualityMode === 'fast'
              ? '4-step LoRA — run one scene first to compare quality vs cost (~much less GPU time).'
              : '20-step route — ~14–15 min/scene at current Vast rates. Use for hero/reveal after A/B.'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked}
          onClick={() => setChecked(Object.fromEntries(allSlots.map((s) => [s.id, true])))}
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked}
          onClick={() =>
            setChecked(Object.fromEntries(allSlots.map((s) => [s.id, s.renderMode === 'AI_VIDEO'])))
          }
        >
          Select AI_VIDEO only
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked}
          onClick={() => setChecked(Object.fromEntries(allSlots.map((s) => [s.id, false])))}
        >
          Clear
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked}
          onClick={() => setExpanded(Object.fromEntries(allSlots.map((s) => [s.id, false])))}
        >
          Collapse all
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={locked} onClick={autoLinkImages}>
          Auto-link stills
        </Button>
        {onOpenPromptEditor ? (
          <Button type="button" variant="outline" size="sm" disabled={locked} onClick={onOpenPromptEditor}>
            Edit all prompts
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={locked || jobActive || !health?.ok || selectedIds.length === 0}
          title={
            selectedIds.length
              ? `Will generate scenes: ${selectedIds.join(', ')}`
              : 'Tick at least one scene checkbox'
          }
          onClick={() => void startJob('all', undefined, false, undefined, selectedIds)}
        >
          Generate selected ({selectedIds.length})
          {selectedIds.length > 0 && selectedIds.length <= 6
            ? ` · ${selectedIds.map((id) => (id === 0 ? 'Hook' : id === -1 ? 'End' : `S${id}`)).join(', ')}`
            : ''}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked || jobActive || !health?.ok}
          onClick={() =>
            void startJob('retry', undefined, false, undefined, selectedIds.length ? selectedIds : undefined)
          }
        >
          Retry failed in selection
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {allSlots.map((slot) => {
          const scene = slot;
          const imageKey = String(scene.id);
          const images = imageCandidatesFor(detail, scene.id);
          const clips = clipCandidatesFor(detail, scene.id);
          const selectedImage =
            selected.images?.[imageKey] ||
            (scene.id === -1
              ? selected.images?.[String(detail.episode.scenes.at(-1)?.id)]
              : undefined) ||
            images[0]?.path;
          const imageAsset = images.find((c) => c.path === selectedImage) || images[0];
          const record = videoState?.scenes[imageKey];
          const draft = drafts[scene.id] || {
            videoPrompt: scene.videoPrompt || '',
            videoNegativePrompt: scene.videoNegativePrompt || ''
          };
          const videoUrl = record?.videoRelative
            ? `/api/media/${record.videoRelative}`
            : clips.find((c) => c.path === `ai-video/${detail.episode.id}/scene-${scene.id}.mp4`)?.url ||
              clips.find((c) => c.path.includes(`scene-${scene.id}`) && c.path.endsWith('.mp4'))?.url ||
              (scene.id === 0
                ? clips.find((c) => /scene-0|scene-hook/i.test(c.path) && c.path.endsWith('.mp4'))?.url
                : undefined);
          const hasImage = Boolean(selectedImage || imageAsset);
          const sceneBusy = record?.status === 'generating' || record?.status === 'queued';
          const showVideo = Boolean(videoUrl) && record?.status !== 'generating';
          const isAi = scene.renderMode === 'AI_VIDEO';
          const ttsSeconds = narrationSecondsForSlot(scene.id, scene.durationSeconds);
          const plan = planWanClipFromNarration(ttsSeconds, timingOpts);
          const isOpen = expanded[scene.id] !== false;

          return (
            <article key={scene.id} className="rounded-xl border border-border/80 bg-background">
              <header className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={Boolean(checked[scene.id])}
                    disabled={locked || sceneBusy}
                    onChange={(event) =>
                      setChecked((prev) => ({ ...prev, [scene.id]: event.target.checked }))
                    }
                  />
                  {scene.label.toUpperCase()}
                </label>
                <Badge variant="outline">
                  TTS {ttsSeconds.toFixed(1)}s
                </Badge>
                <Badge variant={plan.clamped ? 'destructive' : 'secondary'} title="Wan I2V plan from TTS length">
                  Wan {formatWanPlan(plan)}
                </Badge>
                <Badge variant={isAi ? 'secondary' : 'outline'}>{scene.renderMode}</Badge>
                <Badge variant={statusVariant(record?.status)}>{statusLabel(record?.status)}</Badge>
                {record?.qualityMode ? (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {record.qualityMode === 'fast' ? '4-step' : '20-step'}
                  </Badge>
                ) : null}
                {record?.status === 'generating' && typeof record.progressPercent === 'number' ? (
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    {record.progressPercent}%
                    {record.progressLabel ? ` · ${record.progressLabel}` : ''}
                  </Badge>
                ) : null}
                {record?.elapsedMs ? (
                  <span className="text-xs text-muted-foreground">
                    {(record.elapsedMs / 1000).toFixed(0)}s
                  </span>
                ) : null}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={locked || sceneBusy || jobActive || !health?.ok || !hasImage}
                    title={!hasImage ? 'Generate the scene image first' : undefined}
                    onClick={async () => {
                      if (!hasImage) {
                        toast.error('Generate the scene image first.');
                        return;
                      }
                      const nextSelected: SelectedAssets = selectedImage
                        ? {
                            ...selected,
                            images: { ...(selected.images || {}), [imageKey]: selectedImage }
                          }
                        : selected;
                      onChange(nextSelected);
                      await saveScenePrompts(scene.id);
                      await startJob('one', scene.id, true, nextSelected);
                    }}
                  >
                    {sceneBusy ? <Spinner data-icon="inline-start" /> : null}
                    {record?.status === 'completed' || record?.status === 'stale'
                      ? 'Regenerate'
                      : 'Generate'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [scene.id]: !isOpen }))
                    }
                  >
                    {isOpen ? 'Collapse' : 'Expand'}
                  </Button>
                </div>
              </header>
              {(record?.promptId || record?.startedAt || record?.queuedAt) && (
                <div className="px-3 pb-2">
                  <ComfyJobMeta
                    record={record}
                    comfyUrl={health?.comfyUrl || health?.url}
                    onReason={(reason) => {
                      setVideoState((prev) => {
                        if (!prev) return prev;
                        const key = String(scene.id);
                        const cur = prev.scenes[key];
                        if (!cur) return prev;
                        return {
                          ...prev,
                          scenes: { ...prev.scenes, [key]: { ...cur, error: reason } }
                        };
                      });
                    }}
                  />
                </div>
              )}

              {!isOpen ? (
                <p className="line-clamp-1 border-t border-border/40 px-3 py-2 font-[family-name:var(--font-hi)] text-xs text-muted-foreground">
                  {scene.narrationHi}
                </p>
              ) : (
                <div className="space-y-3 border-t border-border/40 px-3 py-3">
                  <Collapsible title="Narration">
                    <p className="font-[family-name:var(--font-hi)] text-sm leading-relaxed">
                      {scene.narrationHi}
                    </p>
                  </Collapsible>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
                      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        Image · starting frame
                      </p>
                      {imageAsset?.url ? (
                        <div className="flex h-44 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                          <img
                            src={`${imageAsset.url}?v=${imageAsset.mtimeMs}`}
                            alt={`Scene ${scene.id}`}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex h-44 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                          Generate the scene image first
                        </div>
                      )}
                      <select
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                        value={selectedImage || ''}
                        disabled={locked}
                        onChange={(event) => {
                          const next = { ...(selected.images || {}) };
                          if (event.target.value) next[imageKey] = event.target.value;
                          else delete next[imageKey];
                          onChange({ ...selected, images: next });
                        }}
                      >
                        <option value="">Choose still…</option>
                        {images.map((asset) => (
                          <option key={asset.path} value={asset.path}>
                            {asset.name}
                          </option>
                        ))}
                      </select>
                      <Collapsible title="Image prompt">
                        <p className="text-xs leading-relaxed text-muted-foreground">{scene.visualPrompt}</p>
                      </Collapsible>
                    </div>

                    <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
                      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        Video · Wan from that image
                      </p>
                      {showVideo && videoUrl ? (
                        <div className="flex h-44 items-center justify-center overflow-hidden rounded-md border bg-black">
                          <video
                            key={videoUrl}
                            src={videoUrl}
                            controls
                            muted
                            autoPlay
                            playsInline
                            preload="auto"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex h-44 items-center justify-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
                          {sceneBusy
                            ? `Generating… see progress bar above${
                                typeof record?.progressPercent === 'number'
                                  ? ` (${record.progressPercent}%)`
                                  : ''
                              }`
                            : 'No video yet'}
                        </div>
                      )}
                      <Collapsible title="Video prompt" defaultOpen={!draft.videoPrompt}>
                        <Field>
                          <FieldLabel className="sr-only">Video Prompt</FieldLabel>
                          <Textarea
                            value={draft.videoPrompt}
                            disabled={locked || sceneBusy}
                            className="min-h-20 font-mono text-xs"
                            placeholder={
                              isAi
                                ? undefined
                                : 'Optional for STILL — falls back to image prompt + camera if empty'
                            }
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [scene.id]: { ...draft, videoPrompt: event.target.value }
                              }))
                            }
                          />
                        </Field>
                      </Collapsible>
                      <Collapsible title="Negative video prompt">
                        <Field>
                          <FieldLabel className="sr-only">Negative Video Prompt</FieldLabel>
                          <Textarea
                            value={draft.videoNegativePrompt}
                            disabled={locked || sceneBusy}
                            className="min-h-14 font-mono text-xs"
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [scene.id]: { ...draft, videoNegativePrompt: event.target.value }
                              }))
                            }
                          />
                        </Field>
                      </Collapsible>
                      {record?.error ? (
                        <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2">
                          <p className="text-xs font-medium text-destructive">Failed</p>
                          <p className="text-xs leading-relaxed text-destructive">{record.error}</p>
                          {record.promptId ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px]"
                              onClick={async () => {
                                try {
                                  const explained = await explainComfyJob(record.promptId!);
                                  toast.message(explained.reason, {
                                    description: explained.historyUrl,
                                    duration: 12_000
                                  });
                                  // Persist richer reason into local UI state for this session
                                  setVideoState((prev) => {
                                    if (!prev) return prev;
                                    const key = String(scene.id);
                                    const cur = prev.scenes[key];
                                    if (!cur) return prev;
                                    return {
                                      ...prev,
                                      scenes: {
                                        ...prev.scenes,
                                        [key]: { ...cur, error: explained.reason }
                                      }
                                    };
                                  });
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error ? error.message : 'Could not read Comfy history'
                                  );
                                }
                              }}
                            >
                              Check Comfy reason
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={locked || savingId === scene.id}
                          onClick={() => void saveScenePrompts(scene.id)}
                        >
                          {savingId === scene.id ? <Spinner data-icon="inline-start" /> : null}
                          Save prompts
                        </Button>
                        {videoUrl ? (
                          <Button type="button" variant="outline" size="sm" asChild>
                            <a href={videoUrl} download={`scene-${scene.id}.mp4`}>
                              Download
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
