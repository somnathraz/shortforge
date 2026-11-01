import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, Music2Icon, PauseIcon, PlayIcon } from 'lucide-react';
import { listBgm, type BgmLibraryResponse, type BgmTrackView } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type SelectedBgm = {
  id: string;
  label: string;
  groupLabel: string;
  relativePath: string;
};

type BgmPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: SelectedBgm | null;
  onSelect: (track: SelectedBgm | null) => void;
  moodHint?: string;
};

function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TrackRow({
  track,
  groupLabel,
  isSelected,
  isPlaying,
  onPreview,
  onPick
}: {
  track: BgmTrackView;
  groupLabel: string;
  isSelected: boolean;
  isPlaying: boolean;
  onPreview: () => void;
  onPick: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
        isSelected
          ? 'border-foreground/25 bg-foreground/[0.04]'
          : 'border-transparent hover:border-border hover:bg-muted/40'
      )}
    >
      <button
        type="button"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground ring-1 ring-foreground/10 transition hover:bg-muted/80"
        onClick={onPreview}
        aria-label={isPlaying ? `Pause ${track.label}` : `Preview ${track.label}`}
      >
        {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onPick}>
        <p className="truncate text-sm font-medium leading-snug">{track.label}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {groupLabel}
          <span className="mx-1.5 text-border">·</span>
          {formatDuration(track.durationSeconds)}
        </p>
      </button>
      {isSelected ? (
        <Badge variant="secondary" className="shrink-0 gap-1">
          <CheckIcon className="size-3" />
          Selected
        </Badge>
      ) : (
        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onPick}>
          Use
        </Button>
      )}
    </div>
  );
}

export function BgmPickerDialog({
  open,
  onOpenChange,
  selected,
  onSelect,
  moodHint
}: BgmPickerDialogProps) {
  const [library, setLibrary] = useState<BgmLibraryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const defaultTab = useMemo(() => {
    if (selected) {
      const match = library?.groups.find((g) => g.tracks.some((t) => t.id === selected.id));
      if (match) return match.id;
    }
    if (moodHint && library?.groups.some((g) => g.id === moodHint)) return moodHint;
    return library?.groups[0]?.id ?? 'custom';
  }, [library, moodHint, selected]);

  useEffect(() => {
    if (!open) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listBgm()
      .then((data) => {
        if (!cancelled) setLibrary(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load BGM library');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function stopPreview() {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPlayingId(null);
  }

  function togglePreview(track: BgmTrackView) {
    if (playingId === track.id) {
      stopPreview();
      return;
    }
    stopPreview();
    const audio = new Audio(track.url);
    audioRef.current = audio;
    setPlayingId(track.id);
    audio.play().catch(() => setPlayingId(null));
    audio.onended = () => setPlayingId(null);
  }

  function pick(track: BgmTrackView, groupLabel: string) {
    stopPreview();
    onSelect({
      id: track.id,
      label: track.label,
      groupLabel,
      relativePath: track.relativePath
    });
    onOpenChange(false);
  }

  function clearSelection() {
    stopPreview();
    onSelect(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Music2Icon className="size-5 text-muted-foreground" />
            Choose background music
          </DialogTitle>
          <DialogDescription>
            Preview tracks from your library, including{' '}
            <code className="text-foreground">assets/audio/bgm/custom/</code>. Selecting a track mixes
            narration + BGM only — Sound Director SFX cues are skipped.
            {moodHint ? (
              <>
                {' '}
                Plan mood: <code className="text-foreground">{moodHint}</code>.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 px-6 py-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !library || library.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              No BGM files found. Drop mp3/wav into{' '}
              <code className="text-foreground">assets/audio/bgm/custom/</code> or a mood folder.
            </p>
          ) : (
            <Tabs key={defaultTab} defaultValue={defaultTab} className="flex min-h-0 flex-col gap-3">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                {library.groups.map((group) => (
                  <TabsTrigger
                    key={group.id}
                    value={group.id}
                    className="rounded-full border border-transparent px-3 data-[state=active]:border-border data-[state=active]:bg-muted"
                  >
                    {group.label}
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {group.tracks.length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {library.groups.map((group) => (
                <TabsContent key={group.id} value={group.id} className="mt-0 min-h-0">
                  <ScrollArea className="h-[min(46vh,380px)] pr-3">
                    <div className="flex flex-col gap-1.5 pb-2">
                      {group.tracks.map((track) => (
                        <TrackRow
                          key={track.id}
                          track={track}
                          groupLabel={group.label}
                          isSelected={selected?.id === track.id}
                          isPlaying={playingId === track.id}
                          onPreview={() => togglePreview(track)}
                          onPick={() => pick(track, group.label)}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" onClick={clearSelection}>
            Use auto mood pick
          </Button>
          <div className="flex items-center gap-2">
            {loading ? <Spinner className="size-4 text-muted-foreground" /> : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
