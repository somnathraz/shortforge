import { useEffect, useMemo, useState } from 'react';
import { ScrollTextIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  getImagePrompts,
  saveVisualPrompts,
  type ImagePromptItem,
  type ImagePromptsResponse
} from '@/lib/api';

type SceneDraft = {
  visualPrompt: string;
  videoPrompt: string;
  videoNegativePrompt: string;
};

type Props = {
  open: boolean;
  episodeFile: string | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void | Promise<void>;
};

function draftFromItem(item: ImagePromptItem): SceneDraft {
  return {
    visualPrompt: item.visualPrompt,
    videoPrompt: item.videoPrompt || '',
    videoNegativePrompt: item.videoNegativePrompt || ''
  };
}

function draftsEqual(a: SceneDraft | undefined, b: SceneDraft | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.visualPrompt.trim() === b.visualPrompt.trim() &&
    a.videoPrompt.trim() === b.videoPrompt.trim() &&
    a.videoNegativePrompt.trim() === b.videoNegativePrompt.trim()
  );
}

export function ImagePromptsDialog({
  open,
  episodeFile,
  busy = false,
  onOpenChange,
  onConfirmed
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ImagePromptsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SceneDraft>>({});
  const [activeId, setActiveId] = useState<string>('hook');
  const [showFinal, setShowFinal] = useState(false);

  useEffect(() => {
    if (!open || !episodeFile) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const next = await getImagePrompts(episodeFile);
        if (cancelled) return;
        setData(next);
        const initial: Record<string, SceneDraft> = {};
        for (const item of next.items) {
          initial[String(item.id)] = draftFromItem(item);
        }
        setDrafts(initial);
        setActiveId(String(next.items[0]?.id ?? 'hook'));
        setShowFinal(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load image prompts');
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, episodeFile, onOpenChange]);

  const active = useMemo(
    () => data?.items.find((item) => String(item.id) === activeId) || null,
    [data, activeId]
  );

  const dirty = useMemo(() => {
    if (!data) return false;
    return data.items.some(
      (item) => !draftsEqual(drafts[String(item.id)], draftFromItem(item))
    );
  }, [data, drafts]);

  function patchDraft(key: string, update: Partial<SceneDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { visualPrompt: '', videoPrompt: '', videoNegativePrompt: '' }), ...update }
    }));
  }

  async function persistDrafts(): Promise<ImagePromptsResponse | null> {
    if (!episodeFile || !data) return null;
    const scenes = data.items
      .filter((item): item is ImagePromptItem & { id: number } => item.kind === 'scene')
      .map((item) => {
        const draft = drafts[String(item.id)] || draftFromItem(item);
        return {
          id: item.id,
          visualPrompt: draft.visualPrompt.trim(),
          videoPrompt: draft.videoPrompt.trim(),
          videoNegativePrompt: draft.videoNegativePrompt.trim()
        };
      });
    const hookItem = data.items.find((item) => item.kind === 'hook');
    const body = {
      scenes,
      ...(hookItem
        ? {
            hookVisualPrompt: (
              drafts.hook?.visualPrompt ||
              hookItem.visualPrompt
            ).trim()
          }
        : {})
    };
    const next = await saveVisualPrompts(episodeFile, body);
    setData(next);
    const refreshed: Record<string, SceneDraft> = {};
    for (const item of next.items) refreshed[String(item.id)] = draftFromItem(item);
    setDrafts(refreshed);
    return next;
  }

  async function handleSave() {
    try {
      setSaving(true);
      await persistDrafts();
      toast.success('Visual scripts saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save prompts');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    try {
      setSaving(true);
      if (!data?.items.length) {
        toast.message(
          data?.brand === 'TECH_EDITORIAL'
            ? 'No AI image prompts — this episode uses techVisual diagrams. Continue to Produce, then Render.'
            : 'No AI image prompts for this episode.'
        );
        onOpenChange(false);
        return;
      }
      if (dirty) await persistDrafts();
      await onConfirmed();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start image generation');
    } finally {
      setSaving(false);
    }
  }

  const activeDraft = active ? drafts[String(active.id)] : undefined;
  const showVideoFields = active?.kind === 'scene' && active.renderMode === 'AI_VIDEO';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[min(960px,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]">
        <DialogHeader className="shrink-0 border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScrollTextIcon className="size-4" />
            Review visual scripts
          </DialogTitle>
          <DialogDescription className="text-sm">
            One scene at a time. Edit Image Prompt for stills; for AI_VIDEO also set Video Prompt
            and Negative Video Prompt
            {data?.brand === 'TECH_EDITORIAL'
              ? ' · TECH_EDITORIAL (no heritage frame; exact labels via techVisual / Remotion)'
              : data?.frameVariant
                ? ` · ${data.frameVariant}`
                : ''}
            .
          </DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading prompts…
          </div>
        ) : !data.items.length ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-foreground">No AI image prompts</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {data.brand === 'TECH_EDITORIAL'
                ? 'Every section uses deterministic techVisual diagrams (arrays, O(1), halving, etc.). Skip image generation — approve visuals and Render will draw exact teaching clips.'
                : 'Uploaded or locked video scenes cover the visual plan. Approve visuals and continue to Produce.'}
            </p>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[11rem_minmax(0,1fr)]">
            <nav className="flex gap-1 overflow-x-auto border-b p-3 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
              {data.items.map((item) => {
                const key = String(item.id);
                const isActive = key === activeId;
                const isDirty = !draftsEqual(drafts[key], draftFromItem(item));
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setActiveId(key);
                      setShowFinal(false);
                    }}
                    className={cn(
                      'shrink-0 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <span className="block font-medium">{item.label}</span>
                    <span
                      className={cn(
                        'mt-0.5 block text-[11px]',
                        isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      )}
                    >
                      {item.renderMode || item.frameWeight}
                      {isDirty ? ' · edited' : ''}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4 md:p-5">
              {active && activeDraft ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {active.frameWeight === 'none' ? 'no heritage frame' : `${active.frameWeight} frame`}
                    </Badge>
                    {active.renderMode ? (
                      <Badge variant={active.renderMode === 'AI_VIDEO' ? 'secondary' : 'outline'}>
                        {active.renderMode}
                      </Badge>
                    ) : null}
                    {active.appearingLords.map((name) => (
                      <Badge key={name} variant="secondary">
                        {name}
                      </Badge>
                    ))}
                  </div>

                  <Field>
                    <FieldLabel>
                      {active.kind === 'hook' ? 'Hook image prompt' : 'Image Prompt'}
                    </FieldLabel>
                    <Textarea
                      value={activeDraft.visualPrompt}
                      onChange={(event) => {
                        patchDraft(String(active.id), { visualPrompt: event.target.value });
                      }}
                      className="min-h-28 font-mono text-xs leading-relaxed"
                    />
                    <p className="text-xs text-muted-foreground">
                      Still / keyframe composition. Camera: {active.camera}
                    </p>
                  </Field>

                  {showVideoFields ? (
                    <>
                      <Field>
                        <FieldLabel>Video Prompt</FieldLabel>
                        <Textarea
                          value={activeDraft.videoPrompt}
                          onChange={(event) => {
                            patchDraft(String(active.id), { videoPrompt: event.target.value });
                          }}
                          className="min-h-28 font-mono text-xs leading-relaxed"
                          placeholder="Subject, face/body, object, environment and camera movement. Preserve identity — do not repeat the Image Prompt."
                        />
                        <p className="text-xs text-muted-foreground">
                          Motion for Wan / Kling / Veo. Describe movement, not a second still description.
                        </p>
                      </Field>
                      <Field>
                        <FieldLabel>Negative Video Prompt</FieldLabel>
                        <Textarea
                          value={activeDraft.videoNegativePrompt}
                          onChange={(event) => {
                            patchDraft(String(active.id), {
                              videoNegativePrompt: event.target.value
                            });
                          }}
                          className="min-h-20 font-mono text-xs leading-relaxed"
                          placeholder="facial deformation, extra fingers, changing identity, frame flicker…"
                        />
                        <p className="text-xs text-muted-foreground">
                          Artifacts and motion failures to avoid.
                        </p>
                      </Field>
                    </>
                  ) : active.kind === 'scene' ? (
                    <p className="text-xs text-muted-foreground">
                      STILL scene — Video Prompt and Negative Video Prompt are omitted.
                    </p>
                  ) : null}

                  <div className="rounded-xl border border-border/80 bg-muted/20">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      onClick={() => setShowFinal((value) => !value)}
                    >
                      Final prompt sent to image model
                      <span>{showFinal ? 'Hide' : 'Show'}</span>
                    </button>
                    {showFinal ? (
                      <pre className="max-h-48 overflow-auto border-t border-border/60 px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                        {dirty
                          ? 'Save or confirm to refresh the framed Gemini prompt with your edits.'
                          : active.finalPrompt}
                      </pre>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select a scene.</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {data ? `${data.items.length} prompts` : ''}
            {dirty ? ' · unsaved edits' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading || saving || busy || !dirty}
              onClick={() => void handleSave()}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Save scripts
            </Button>
            <Button
              type="button"
              disabled={loading || saving || busy || !data}
              onClick={() => void handleConfirm()}
            >
              {busy || saving ? <Spinner data-icon="inline-start" /> : null}
              {data?.items.length ? 'Confirm & generate missing' : 'Close'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
