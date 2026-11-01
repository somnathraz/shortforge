import { useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon, ClapperboardIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  attachTechReelFinal,
  getTechReel,
  listTechReels,
  renderTechReel,
  type TechReelSummary
} from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/** Exact link only — never fuzzy title match, never default to reels[0]. */
function guessReelId(
  episodeId: string,
  _topic: string,
  _title: string,
  notes: string[],
  reels: TechReelSummary[]
): string {
  if (!reels.length) return '';
  const ids = new Set(reels.map((r) => r.id));
  if (ids.has(episodeId)) return episodeId;
  for (const note of notes) {
    const m = note.match(/tech-reels\/([a-zA-Z0-9_-]+)/i);
    if (m?.[1] && ids.has(m[1])) return m[1];
  }
  return '';
}

function reelAllowedForEpisode(
  reelId: string,
  episodeId: string,
  notes: string[]
): boolean {
  if (!reelId) return false;
  if (reelId === episodeId) return true;
  return notes.some((note) => {
    const m = note.match(/tech-reels\/([a-zA-Z0-9_-]+)/i);
    return m?.[1] === reelId;
  });
}

type Props = {
  episodeId: string;
  topic?: string;
  title?: string;
  notes?: string[];
  disabled?: boolean;
  onAttached: (finalPath: string) => void | Promise<void>;
  onContinueReview: () => void | Promise<void>;
};

export function TechProducePanel({
  episodeId,
  topic = '',
  title = '',
  notes = [],
  disabled,
  onAttached,
  onContinueReview
}: Props) {
  const [reels, setReels] = useState<TechReelSummary[]>([]);
  const [reelId, setReelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [finalPath, setFinalPath] = useState<string | null>(null);

  const selected = useMemo(() => reels.find((r) => r.id === reelId) || null, [reels, reelId]);

  useEffect(() => {
    void listTechReels()
      .then(({ reels: next }) => {
        setReels(next);
        setReelId((prev) => prev || guessReelId(episodeId, topic, title, notes, next));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [episodeId, topic, title, notes]);

  useEffect(() => {
    if (!reelId) return;
    const reel = reels.find((r) => r.id === reelId);
    setPreviewUrl(reel?.output?.url || reel?.job?.previewUrl || null);
    setLog(reel?.job?.log || '');
  }, [reelId, reels]);

  async function refreshReel(id: string) {
    const detail = await getTechReel(id);
    setReels((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              output: detail.output,
              job: detail.job
            }
          : row
      )
    );
    return detail;
  }

  const allowed = reelAllowedForEpisode(reelId, episodeId, notes);

  async function createVideo() {
    if (!reelId) return;
    if (!reelAllowedForEpisode(reelId, episodeId, notes)) {
      const message =
        `Storyboard "${reelId}" is not linked to episode "${episodeId}". ` +
        `That would attach an unrelated old video. Create a Motion Studio storyboard ` +
        `with the same id, add a note "tech-reels/${episodeId}", or use Produce → ` +
        `Merge scenes + voice / Remotion techVisuals instead.`;
      setError(message);
      toast.error(message);
      return;
    }
    setBusy(true);
    setError(null);
    setFinalPath(null);
    try {
      const { job } = await renderTechReel(reelId, false, episodeId);
      setLog(job.log || 'Rendering…');
      toast.message(`Creating video for ${reelId}…`);
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const detail = await refreshReel(reelId);
        setLog(detail.job?.log || '');
        if (detail.job?.status === 'running') continue;
        if (detail.job?.status === 'failed') {
          throw new Error(detail.job.log || 'Render failed');
        }
        break;
      }
      const attached = await attachTechReelFinal(reelId, episodeId);
      setPreviewUrl(attached.url);
      setFinalPath(attached.path);
      await onAttached(attached.path);
      toast.success('Video ready — continue to Review');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function useExisting() {
    if (!reelId || !selected?.output) return;
    if (!reelAllowedForEpisode(reelId, episodeId, notes)) {
      const message = `Cannot attach unrelated storyboard "${reelId}" to "${episodeId}".`;
      setError(message);
      toast.error(message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const attached = await attachTechReelFinal(reelId, episodeId);
      setPreviewUrl(attached.url);
      setFinalPath(attached.path);
      await onAttached(attached.path);
      toast.success('Attached existing reel as final');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>Motion Studio storyboard</AlertTitle>
        <AlertDescription>
          Only for Desk episodes that already have a matching <code>data/tech-reels/*.json</code>{' '}
          (same id, or a source note like <code>tech-reels/&lt;id&gt;</code>). Picking another reel
          (e.g. request-coalescing) attaches that <strong>old</strong> video — blocked below. New
          lessons without a storyboard use Produce → Merge scenes + voice, or Remotion techVisuals.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="tech-produce-reel">
          Storyboard
        </label>
        <select
          id="tech-produce-reel"
          className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
          value={reelId}
          disabled={busy || disabled || !reels.length}
          onChange={(e) => {
            setReelId(e.target.value);
            setFinalPath(null);
            setError(null);
          }}
        >
          <option value="">Select the linked storyboard…</option>
          {reels.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} ({r.id}) · {r.beats} beats
              {r.output ? (r.output.stale ? ' · stale' : ' · rendered') : ''}
              {reelAllowedForEpisode(r.id, episodeId, notes) ? ' · linked' : ' · unrelated'}
            </option>
          ))}
        </select>
        {reelId && !allowed ? (
          <p className="text-xs text-amber-700">
            “{reelId}” is not linked to this episode — Create video is disabled so you do not get an
            old unrelated final.
          </p>
        ) : null}
        {reelId && allowed ? (
          <a className="text-sm underline underline-offset-4" href={`/desk?studio=1&reel=${encodeURIComponent(reelId)}`}>
            Open this storyboard in Motion Studio
          </a>
        ) : null}
        {!reelId && reels.length > 0 ? (
          <p className="text-xs text-amber-700">
            No linked storyboard. Author one in Motion Studio with id <code>{episodeId}</code>, or
            leave this path and use Merge scenes + voice / Remotion instead.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(180px,220px)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground shadow-sm"
              disabled={busy || disabled || !reelId || !allowed}
              onClick={() => void createVideo()}
            >
              {busy ? <Spinner data-icon="inline-start" /> : <ClapperboardIcon data-icon="inline-start" />}
              {busy ? 'Creating video…' : 'Create video → final'}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            {selected?.output && !selected.output.stale ? (
              <Button
                size="lg"
                variant="outline"
                disabled={busy || disabled || !allowed}
                onClick={() => void useExisting()}
              >
                Use existing render
              </Button>
            ) : null}
            <Button
              size="lg"
              variant="outline"
              disabled={busy || disabled || !finalPath}
              onClick={() => void onContinueReview()}
            >
              Continue to Review
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
          {finalPath ? (
            <p className="font-mono text-xs text-muted-foreground">Final: {finalPath}</p>
          ) : null}
          {log ? (
            <details className="rounded-md border bg-muted/20 p-3" open={busy}>
              <summary className="cursor-pointer text-xs font-medium">Render log</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                {log}
              </pre>
            </details>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Produce error</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap font-mono text-xs">{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <div
          className={cn(
            'mx-auto w-full max-w-[220px] overflow-hidden rounded-md border bg-zinc-950 aspect-[9/16]'
          )}
        >
          {previewUrl ? (
            <video key={previewUrl} src={previewUrl} controls playsInline className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full flex-col justify-center gap-2 p-4 text-center text-xs text-zinc-400">
              <span className="font-mono text-[10px] uppercase tracking-widest text-amber-200/80">
                No video yet
              </span>
              <p>Create video to render scenes + voice into the final Short.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
