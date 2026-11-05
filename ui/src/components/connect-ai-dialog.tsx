import { useEffect, useState } from 'react';
import { BotIcon, CheckIcon, CopyIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getMcpConnectInfo,
  testMcpConnection,
  type McpConnectInfo,
  type McpTestResult
} from '@/lib/api';

const DISMISS_KEY = 'mf.connectAiDismissed';

function copy(text: string, what: string) {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${what} copied`))
    .catch(() => toast.error('Copy failed — select the text and copy it manually'));
}

function CodeBlock({ text, label }: { text: string; label: string }) {
  return (
    <div className="relative">
      <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/40 p-3 pr-20 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
        {text}
      </pre>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="absolute top-2 right-2"
        onClick={() => copy(text, label)}
      >
        <CopyIcon data-icon="inline-start" />
        Copy
      </Button>
    </div>
  );
}

export function ConnectAiDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [info, setInfo] = useState<McpConnectInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<McpTestResult | null>(null);

  useEffect(() => {
    if (!open || info) return;
    getMcpConnectInfo()
      .then(setInfo)
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Could not load setup'));
  }, [open, info]);

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      setResult(await testMcpConnection());
    } catch (error) {
      setResult({ ok: false, tools: [], ms: 0, error: error instanceof Error ? error.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect an AI to this studio</DialogTitle>
          <DialogDescription>
            Let Claude, ChatGPT, or any MCP-compatible AI write scripts, edit image prompts, run production steps,
            check your accounts and read analytics — using this same pipeline, with your approvals still required.
            Production runs on your computer. Your selected AI service receives tool requests and results.
          </DialogDescription>
        </DialogHeader>

        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {!info && !loadError ? <Spinner /> : null}

        {info ? (
          <div className="space-y-5">
            <Tabs defaultValue={info.clients[0]?.id}>
              <TabsList className="h-auto w-full flex-wrap justify-start">
                {info.clients.map((client) => (
                  <TabsTrigger key={client.id} value={client.id}>
                    {client.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {info.clients.map((client) => (
                <TabsContent key={client.id} value={client.id} className="space-y-3">
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {client.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {client.kind === 'json' || client.kind === 'toml' ? (
                    <p className="text-xs text-muted-foreground">
                      File: <code className="text-foreground">{client.location}</code>
                    </p>
                  ) : null}
                  <CodeBlock text={client.text} label={`${client.label} setup`} />
                </TabsContent>
              ))}
            </Tabs>

            <div className="space-y-2 rounded-lg border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Check it works</p>
                <Button type="button" size="sm" disabled={testing} onClick={() => void runTest()}>
                  {testing ? <Spinner data-icon="inline-start" /> : <BotIcon data-icon="inline-start" />}
                  Test MCP server
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Starts the studio&apos;s MCP server exactly as your AI app would and lists what it offers. This proves
                the server runs; the AI app still has to be given the config above.
              </p>
              {result ? (
                result.ok ? (
                  <div className="space-y-2 text-xs">
                    <p className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-200">
                      <CheckIcon className="size-3.5" /> Server started in {result.ms} ms · {result.tools.length} tools
                      available
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.tools.map((tool) => (
                        <Badge key={tool.name} variant="outline" title={tool.description}>
                          {tool.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="flex items-start gap-1.5 text-xs text-destructive">
                    <XIcon className="mt-0.5 size-3.5 shrink-0" /> {result.error || 'MCP server failed to start'}
                  </p>
                )
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">What the AI can use right now</p>
              <div className="flex flex-wrap gap-2">
                {info.providers.map((provider) => (
                  <Badge key={provider.id} variant={provider.configured ? 'secondary' : 'outline'} title={provider.powers}>
                    {provider.label} · {provider.configured ? 'key set' : 'no key'}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Missing keys are set in <code>.env</code>; the AI can only do what the keys allow. Real publishing always
                needs an explicit confirm.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Try asking</p>
              <ul className="space-y-1.5">
                {info.examples.map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      className="w-full rounded-md border border-border/70 px-3 py-2 text-left text-xs hover:bg-muted/50"
                      onClick={() => copy(example, 'Prompt')}
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** One-time nudge on the empty "new production" screen. */
export function ConnectAiBanner({ onOpen }: { onOpen: () => void }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  return (
    <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 sm:mx-7">
      <div className="min-w-0 text-sm">
        <p className="font-medium">Work with Claude or ChatGPT on this studio</p>
        <p className="text-muted-foreground">
          Connect an AI to write scripts, tune image prompts and run production for you.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={onOpen}>
          <BotIcon data-icon="inline-start" />
          Connect AI
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, '1');
            } catch {
              // ignore
            }
            setDismissed(true);
          }}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
