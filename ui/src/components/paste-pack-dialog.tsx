import { useMemo, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { PackagingView, PlatformPackView } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type PastePackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packaging: PackagingView | null;
};

async function copyText(label: string, value: string) {
  await navigator.clipboard.writeText(value);
  toast.success(`${label} copied`);
}

function CopyField({
  label,
  value,
  multiline = false
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={async () => {
            await copyText(label, value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {multiline ? (
        <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-[family-name:var(--font-hi)] text-sm leading-relaxed whitespace-pre-wrap">
          {value}
        </pre>
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2 font-[family-name:var(--font-hi)] text-sm leading-relaxed">
          {value}
        </p>
      )}
    </div>
  );
}

function PlatformPane({ pack }: { pack: PlatformPackView }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{pack.platform}</Badge>
        <Badge variant="outline">{pack.coverAspect}</Badge>
        <span className="text-xs text-muted-foreground">
          {pack.title.length}/100 title characters
        </span>
        <Button
          type="button"
          size="sm"
          onClick={() => copyText('Full paste pack', pack.pasteText)}
        >
          <CopyIcon data-icon="inline-start" />
          Copy full paste block
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="flex flex-col gap-3">
          <CopyField label="Title" value={pack.title} />
          <CopyField label="Description" value={pack.description} multiline />
          <CopyField label="CTA" value={pack.cta} />
          <CopyField label="Tags" value={pack.tags.join(', ')} />
          <CopyField label="Hashtags" value={pack.hashtags.join(' ')} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Cover</p>
          {pack.coverUrl ? (
            <img
              src={pack.coverUrl}
              alt={`${pack.platform} cover`}
              className="w-full rounded-xl object-cover ring-1 ring-foreground/10"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl bg-muted text-center text-xs text-muted-foreground">
              No cover yet.
              <br />
              Run package with covers.
            </div>
          )}
        </div>
      </div>

      <Separator />
      <details className="paste-preview">
        <summary>Show complete paste block</summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-foreground p-3 font-mono text-xs leading-relaxed text-background whitespace-pre-wrap">
          {pack.pasteText}
        </pre>
      </details>
    </div>
  );
}

export function PastePackDialog({ open, onOpenChange, packaging }: PastePackDialogProps) {
  const defaultTab = useMemo(
    () => packaging?.platforms[0]?.platform || 'youtube',
    [packaging]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[72rem] flex-col gap-4 overflow-hidden sm:max-w-[72rem]">
        <DialogHeader>
          <DialogTitle>Delivery pack</DialogTitle>
          <DialogDescription>
            Review and copy the exact content prepared for each platform before publishing.
          </DialogDescription>
        </DialogHeader>

        {!packaging ? (
          <p className="text-sm text-muted-foreground">
            No packaging yet. Generate it with <code>npm run package</code>.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">
                {packaging.language === 'hi' ? 'Hinglish · Roman Hindi' : 'English'}
              </Badge>
              <span>Thumbnail: {packaging.thumbnailTextHi}</span>
              <span>·</span>
              <span>Hook: {packaging.sharedHookHi}</span>
            </div>
            <Tabs
              key={`${packaging.episodeId}-${packaging.language}-${packaging.createdAt}`}
              defaultValue={defaultTab}
              className="min-h-0 flex-1 gap-3 overflow-hidden"
            >
              <TabsList className="shrink-0">
                {packaging.platforms.map((pack) => (
                  <TabsTrigger key={pack.platform} value={pack.platform} className="capitalize">
                    {pack.platform}
                  </TabsTrigger>
                ))}
              </TabsList>
              {packaging.platforms.map((pack) => (
                <TabsContent
                  key={pack.platform}
                  value={pack.platform}
                  className="min-h-0 overflow-y-auto pr-1"
                >
                  <PlatformPane pack={pack} />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
