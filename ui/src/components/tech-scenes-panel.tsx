import { useEffect, useState } from 'react';
import { ArrowRightIcon, RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  formatTechSceneTsx,
  getTechSceneTemplateSource,
  listTechSceneTemplates,
  previewTechSceneStill,
  publishTechSceneTemplate,
  scaffoldTechSceneTemplate,
  type TechSceneTemplateMeta
} from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

const SAMPLE_SCENE = `import React from 'react';
import type { SceneContext, SceneTemplateModule } from '../types';
import { theme } from '../theme';

const DemoScene: React.FC<{ context: SceneContext }> = ({ context }) => (
  <svg width={1080} height={720}>
    <rect x={80} y={40} width={920} height={640} rx={18} fill="#10121b" stroke={theme.node} strokeWidth={1.5} />
    <text x={540} y={360} textAnchor="middle" fill={theme.text} fontFamily={theme.sans} fontSize={36} fontWeight={700}>
      {context.beat.headline}
    </text>
  </svg>
);

export const meta = {
  id: 'custom.demo',
  title: 'custom.demo',
  pack: 'custom',
  llm: 'Demo scene — replace with a real lesson visual.',
  status: 'draft' as const
};

export const Scene = DemoScene;
export default { meta, Scene } satisfies SceneTemplateModule;
`;

type Props = {
  episodeTitle?: string;
  onContinue: () => void | Promise<void>;
  continueBusy?: boolean;
};

export function TechScenesPanel({ episodeTitle, onContinue, continueBusy }: Props) {
  const [templates, setTemplates] = useState<TechSceneTemplateMeta[]>([]);
  const [sceneId, setSceneId] = useState('window.array');
  const [sceneSource, setSceneSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sceneExists, setSceneExists] = useState(false);

  useEffect(() => {
    void listTechSceneTemplates()
      .then(({ templates: next }) => {
        setTemplates(next);
        const first = next[0]?.id;
        if (first) setSceneId((prev) => (next.some((t) => t.id === prev) ? prev : first));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!sceneId) return;
    let cancelled = false;
    setPreviewUrl(null);
    setSceneExists(false);
    void getTechSceneTemplateSource(sceneId)
      .then((res) => {
        if (cancelled) return;
        setSceneSource(res.source);
        setSceneExists(true);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setSceneExists(false);
        setSceneSource(SAMPLE_SCENE.replace(/custom\.demo/g, sceneId));
      });
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  // Registered scenes preview without saving — load still when the on-disk TSX is known.
  useEffect(() => {
    if (!sceneExists || !sceneId) return;
    let cancelled = false;
    setPreviewBusy(true);
    void previewTechSceneStill({ id: sceneId })
      .then((still) => {
        if (!cancelled) setPreviewUrl(still.url);
      })
      .catch(() => {
        /* optional — Preview button still available */
      })
      .finally(() => {
        if (!cancelled) setPreviewBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sceneExists, sceneId]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function runPreview(force = false) {
    if (!sceneId) return;
    setPreviewBusy(true);
    setError(null);
    try {
      const still = await previewTechSceneStill({
        id: sceneId,
        headline: episodeTitle?.slice(0, 64) || sceneId,
        force
      });
      setPreviewUrl(still.url);
      if (!still.cached) toast.success('Static preview ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scenes</CardTitle>
        <CardDescription>
          Edit Remotion scene TSX per template, check a small static still (not the animated reel), then
          continue. Full motion stays in Motion Studio.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert>
          <AlertTitle>Static preview only</AlertTitle>
          <AlertDescription>
            Preview freezes the composition after the intro ease so you can see what the TSX lays out.
            Animated timing / TTS cues are rendered later in Motion Studio.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
                sceneId === t.id ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'
              )}
              disabled={busy || previewBusy}
              onClick={() => {
                setSceneId(t.id);
                setPreviewUrl(null);
              }}
            >
              <code>{t.id}</code>
              <Badge variant="outline" className="text-[10px] uppercase">
                {t.status}
              </Badge>
            </button>
          ))}
          {!templates.length && <p className="text-sm text-muted-foreground">No templates registered yet.</p>}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(200px,0.8fr)]">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="tech-scene-id">
              Template id
            </label>
            <input
              id="tech-scene-id"
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              value={sceneId}
              disabled={busy || previewBusy}
              onChange={(e) => {
                setSceneId(e.target.value.trim());
                setPreviewUrl(null);
              }}
              placeholder="pack.name e.g. window.array"
            />
            <label className="text-xs text-muted-foreground" htmlFor="tech-scene-tsx">
              Scene TSX
            </label>
            <textarea
              id="tech-scene-tsx"
              className="min-h-[280px] w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
              value={sceneSource}
              disabled={busy || previewBusy}
              onChange={(e) => setSceneSource(e.target.value)}
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {sceneExists
                ? 'This scene already exists on disk — Preview works without saving. Save only if you edited the TSX.'
                : 'New id — Save once to create the .tsx, then Preview.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || previewBusy || !sceneSource}
                onClick={() =>
                  void perform(async () => {
                    const { source } = await formatTechSceneTsx(sceneSource);
                    setSceneSource(source);
                    toast.success('Formatted');
                  })
                }
              >
                Format
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || previewBusy || !sceneId || sceneExists}
                onClick={() =>
                  void perform(async () => {
                    const result = await scaffoldTechSceneTemplate(sceneId);
                    setSceneSource(result.formattedSource);
                    setTemplates(result.templates);
                    setSceneExists(true);
                    toast.success(`Scaffolded ${result.relativePath}`);
                  })
                }
              >
                Scaffold
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || previewBusy || !sceneId || !sceneSource}
                onClick={() =>
                  void perform(async () => {
                    const synced = sceneSource.replace(
                      /\bid\s*:\s*['"`][^'"`]+['"`]/,
                      `id: '${sceneId}'`
                    );
                    const result = await publishTechSceneTemplate({
                      id: sceneId,
                      source: synced,
                      overwrite: true
                    });
                    setSceneSource(result.formattedSource);
                    setTemplates(result.templates);
                    setSceneExists(true);
                    setPreviewUrl(null);
                    toast.success(`${result.created ? 'Created' : 'Updated'} ${result.relativePath}`);
                    await runPreview(true);
                  })
                }
              >
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {sceneExists ? 'Update scene' : 'Save scene'}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Static still
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={previewBusy || busy || !sceneId}
                onClick={() => void runPreview(true)}
              >
                {previewBusy ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <RefreshCwIcon data-icon="inline-start" />
                )}
                {previewBusy ? 'Rendering…' : previewUrl ? 'Refresh' : 'Preview'}
              </Button>
            </div>
            <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-md border bg-zinc-950 aspect-[9/16]">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`Static preview of ${sceneId}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full flex-col justify-center gap-2 p-4 text-center text-xs text-zinc-400">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-amber-200/80">
                    No still yet
                  </span>
                  <p>{sceneExists ? 'Loading still… or click Preview.' : 'Save a new scene, then Preview.'}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Optional — you can proceed without a still. Full video is created on Produce.
            </p>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Scenes error</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap font-mono text-xs">{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button size="lg" disabled={continueBusy || busy} onClick={() => void onContinue()}>
          {continueBusy ? <Spinner data-icon="inline-start" /> : null}
          Continue to Produce
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}
