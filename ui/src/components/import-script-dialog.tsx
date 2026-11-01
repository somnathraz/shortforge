import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { ClipboardCopyIcon, DownloadIcon, FileJsonIcon, UploadIcon, WandSparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  copyEpisodeScriptLlmBrief,
  copyEpisodeScriptSampleJson,
  downloadEpisodeScriptLlmBrief,
  downloadEpisodeScriptSampleJson,
  getEpisodeScriptTemplate,
  importEpisodeScript,
  type EpisodeScriptFieldGuideItem,
  type ImportEpisodeIssue
} from '@/lib/api';
import { formatEpisodeJsonText } from '@/lib/format-episode-json';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

type ImportScriptDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (file: string) => void | Promise<void>;
};

export function ImportScriptDialog({ open, onOpenChange, onImported }: ImportScriptDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jsonText, setJsonText] = useState('');
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<ImportEpisodeIssue[]>([]);
  const [fieldGuide, setFieldGuide] = useState<EpisodeScriptFieldGuideItem[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null);
  const [templateLoaded, setTemplateLoaded] = useState(false);

  useEffect(() => {
    if (!open || templateLoaded) return;
    let cancelled = false;
    void getEpisodeScriptTemplate()
      .then((payload) => {
        if (cancelled) return;
        setTemplate(payload.template || null);
        setFieldGuide(payload.fieldGuide || []);
        setNotes(payload.notes || []);
        setTemplateLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setTemplateLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, templateLoaded]);

  useEffect(() => {
    if (!open) {
      setIssues([]);
      setBusy(false);
    }
  }, [open]);

  async function loadTemplateIntoEditor() {
    try {
      setBusy(true);
      const payload = await getEpisodeScriptTemplate();
      setTemplate(payload.template || null);
      setJsonText(JSON.stringify(payload.template, null, 2));
      setFieldGuide(payload.fieldGuide || []);
      setNotes(payload.notes || []);
      setIssues([]);
      toast.message('Template loaded — edit then Validate or Import');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load template');
    } finally {
      setBusy(false);
    }
  }

  async function ensureTemplate(): Promise<Record<string, unknown>> {
    if (template) return template;
    const payload = await getEpisodeScriptTemplate();
    setTemplate(payload.template || null);
    setFieldGuide(payload.fieldGuide || []);
    setNotes(payload.notes || []);
    if (!payload.template) throw new Error('Could not load episode template');
    return payload.template;
  }

  function formatWithTemplate(text: string, episodeTemplate: Record<string, unknown>) {
    return formatEpisodeJsonText(text, { template: episodeTemplate });
  }

  async function copySampleJson() {
    try {
      await copyEpisodeScriptSampleJson();
      toast.success('Sample JSON copied — paste into your LLM');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Copy failed');
    }
  }

  async function copyLlmPrompt() {
    try {
      await copyEpisodeScriptLlmBrief();
      toast.success('LLM prompt copied (includes sample JSON)');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Copy failed');
    }
  }

  async function downloadSampleJson() {
    try {
      await downloadEpisodeScriptSampleJson();
      toast.message('Sample JSON downloaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed');
    }
  }

  async function downloadLlmBrief() {
    try {
      await downloadEpisodeScriptLlmBrief();
      toast.message('LLM brief downloaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed');
    }
  }

  function onFilePicked(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      void (async () => {
        try {
          const episodeTemplate = await ensureTemplate();
          const { formatted } = formatWithTemplate(text, episodeTemplate);
          setJsonText(formatted);
          setIssues([]);
          toast.message(`Loaded & formatted ${file.name}`);
        } catch {
          setJsonText(text);
          setIssues([]);
          toast.message(`Loaded ${file.name} — click Format JSON if needed`);
        }
      })();
    };
    reader.onerror = () => toast.error('Could not read file');
    reader.readAsText(file);
  }

  async function formatEditorJson(): Promise<{ value: unknown; wrappedFromScenes?: boolean }> {
    const episodeTemplate = await ensureTemplate();
    const result = formatWithTemplate(jsonText, episodeTemplate);
    setJsonText(result.formatted);
    setIssues([]);
    return result;
  }

  function onFormatClick() {
    void (async () => {
      try {
        const result = await formatEditorJson();
        toast.success(
          result.wrappedFromScenes
            ? 'Scenes wrapped into a blank shell — edit spokenHook & titles (not the Hanuman sample)'
            : 'JSON formatted (your pasted episode kept)'
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not format JSON';
        setIssues([{ path: 'json', message }]);
        toast.error(message);
      }
    })();
  }

  function onPasteJson(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData('text');
    if (!pasted.trim()) return;
    event.preventDefault();
    void (async () => {
      try {
        const episodeTemplate = await ensureTemplate();
        const result = formatWithTemplate(pasted, episodeTemplate);
        setJsonText(result.formatted);
        setIssues([]);
        toast.success(
          result.wrappedFromScenes
            ? 'Scenes-only paste → blank episode shell (edit hook/titles before import)'
            : 'Pasted episode cleaned & formatted'
        );
      } catch (error) {
        setJsonText(pasted);
        const message = error instanceof Error ? error.message : 'Could not format paste';
        setIssues([{ path: 'json', message }]);
        toast.error('Paste kept raw — fix or click Format JSON');
      }
    })();
  }

  async function runImport(dryRun: boolean) {
    try {
      setBusy(true);
      setIssues([]);
      const { value: episode, wrappedFromScenes } = await formatEditorJson();
      if (wrappedFromScenes) {
        toast.message('Note: scenes were wrapped into the sample template shell — check titles & spokenHook');
      }
      const result = await importEpisodeScript({ episode, dryRun });
      if (!result.ok) {
        setIssues(result.issues || [{ path: 'root', message: result.error || 'Import failed' }]);
        toast.error(result.error || 'Validation failed');
        return;
      }
      if (dryRun) {
        toast.success(
          `Valid script · ${result.budget?.sceneCount ?? '?'} scenes · ₹${result.budget?.estimatedCostInr ?? 0} est.`
        );
        return;
      }
      if (!result.file) {
        toast.error('Import succeeded but no file was returned');
        return;
      }
      if (result.idRenamedFrom && result.episode?.id) {
        toast.success(
          `Imported as new draft ${result.episode.id} (kept ${result.idRenamedFrom} unchanged) → ${result.file}`
        );
      } else {
        toast.success(`Imported ${result.file}`);
      }
      onOpenChange(false);
      await onImported(result.file);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      setIssues([{ path: 'json', message }]);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Import script JSON</DialogTitle>
          <DialogDescription>
            Paste a full episode JSON (kept as-is), or only a scenes list — we build a{' '}
            <span className="font-medium text-foreground">blank shell from your scenes</span> (never
            the sample Hanuman story). Edit spokenHook / titles, then Validate.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/30 p-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || !jsonText.trim()}
              onClick={onFormatClick}
            >
              <WandSparklesIcon data-icon="inline-start" />
              Format JSON
            </Button>
            <p className="px-1 text-xs text-muted-foreground">
              Pretty-prints and cleans LLM paste before Validate / Import.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void loadTemplateIntoEditor()}>
              <FileJsonIcon data-icon="inline-start" />
              Load template
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void copySampleJson()}>
              <ClipboardCopyIcon data-icon="inline-start" />
              Copy sample JSON
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void copyLlmPrompt()}>
              <ClipboardCopyIcon data-icon="inline-start" />
              Copy LLM prompt
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void downloadSampleJson()}>
              <DownloadIcon data-icon="inline-start" />
              Download sample JSON
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void downloadLlmBrief()}>
              <DownloadIcon data-icon="inline-start" />
              Download LLM brief
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon data-icon="inline-start" />
              Upload .json
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                onFilePicked(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>

          {notes.length > 0 ? (
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          <Textarea
            value={jsonText}
            disabled={busy}
            rows={16}
            spellCheck={false}
            className="min-h-[220px] font-mono text-xs leading-relaxed"
            placeholder="Paste episode JSON (or LLM output with ```json fences) — auto-formats on paste"
            onChange={(event) => setJsonText(event.target.value)}
            onPaste={onPasteJson}
          />

          {issues.length > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>Fix these before import</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 space-y-1 font-mono text-xs">
                  {issues.map((issue, index) => (
                    <li key={`${issue.path}-${index}`}>
                      <span className="font-semibold">{issue.path}</span>: {issue.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {fieldGuide.length > 0 ? (
            <details className="rounded-lg border border-border/80 p-3 text-xs">
              <summary className="cursor-pointer font-medium">Field guide (share with writers)</summary>
              <ul className="mt-3 space-y-2 text-muted-foreground">
                {fieldGuide.map((item) => (
                  <li key={item.field}>
                    <span className="font-medium text-foreground">{item.field}</span>
                    {item.required ? ' · required' : ''} — {item.note}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" disabled={busy || !jsonText.trim()} onClick={() => void runImport(true)}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Validate only
          </Button>
          <Button type="button" disabled={busy || !jsonText.trim()} onClick={() => void runImport(false)}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Import & use
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
