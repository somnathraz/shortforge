import { BadgeCheckIcon, ExternalLinkIcon } from 'lucide-react';
import type { PublishConnection } from '@/lib/types';
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
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export type PublishPlatformId = 'youtube' | 'instagram' | 'facebook';

export type PlatformUploadState = {
  confirmed: boolean;
  uploaded: boolean;
  url?: string;
};

type PublishAllDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: PublishConnection[];
  states: Record<PublishPlatformId, PlatformUploadState>;
  jobBusy: boolean;
  canBasePublish: boolean;
  /** When true, actions schedule instead of immediate upload. */
  scheduleMode?: boolean;
  scheduleLabel?: string;
  onConfirm: (platform: PublishPlatformId) => void;
  onUpload: (platform: PublishPlatformId) => void;
  onUploadAllReady: () => void;
};

const ORDER: PublishPlatformId[] = ['youtube', 'instagram', 'facebook'];

export function PublishAllDialog({
  open,
  onOpenChange,
  connections,
  states,
  jobBusy,
  canBasePublish,
  scheduleMode = false,
  scheduleLabel,
  onConfirm,
  onUpload,
  onUploadAllReady
}: PublishAllDialogProps) {
  const emptyState: PlatformUploadState = { confirmed: false, uploaded: false };
  // Only destinations present in this pipeline's upload state / connections — never pad with YT/FB.
  const platforms = ORDER.filter(
    (platform) => platform in states || connections.some((c) => c.platform === platform)
  );
  const list = platforms;
  const connected = list.filter(
    (platform) => connections.find((item) => item.platform === platform)?.state === 'connected'
  );
  const readyCount = connected.filter((platform) => {
    const state = states[platform] || emptyState;
    return state.confirmed && !state.uploaded;
  }).length;
  const actionVerb = scheduleMode ? 'Schedule' : 'Upload';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {scheduleMode ? 'Schedule connected accounts' : 'Publish to connected accounts'}
          </DialogTitle>
          <DialogDescription>
            {scheduleMode
              ? list.length === 1 && list[0] === 'instagram'
                ? `Confirm Instagram copy, then schedule${scheduleLabel ? ` for ${scheduleLabel}` : ''}. Instagram queues for auto-publish.`
                : `Confirm copy per platform, then schedule${scheduleLabel ? ` for ${scheduleLabel}` : ''}. YouTube and Facebook Reel use native schedule; Instagram queues for auto-publish.`
              : list.length === 1
                ? 'Confirm title and description, then upload. Already uploaded destinations stay marked done.'
                : 'Confirm title and description per platform, then upload one by one. Already uploaded destinations stay marked done.'}
          </DialogDescription>
        </DialogHeader>

        <div className="destination-list">
          {list.map((platform) => {
            const connection = connections.find((item) => item.platform === platform);
            const state = states[platform] || emptyState;
            const isConnected = connection?.state === 'connected';
            return (
              <div
                key={platform}
                className={cn('destination-row', isConnected && 'destination-row-selected')}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold capitalize">{platform}</span>
                    {state.uploaded ? (
                      <Badge variant="secondary">{scheduleMode ? 'Scheduled' : 'Uploaded'}</Badge>
                    ) : !isConnected ? (
                      <Badge variant="outline">Not connected</Badge>
                    ) : state.confirmed ? (
                      <Badge variant="secondary">Ready</Badge>
                    ) : (
                      <Badge variant="outline">Confirm copy</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {connection?.accountName
                      ? connection.accountName
                      : connection?.message || 'Not set up'}
                  </p>
                  {state.url ? (
                    <a
                      href={state.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary"
                    >
                      Open upload
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  ) : null}
                </div>
                <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row">
                  {isConnected && !state.confirmed && !state.uploaded && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canBasePublish || jobBusy}
                      onClick={() => onConfirm(platform)}
                    >
                      Confirm copy
                    </Button>
                  )}
                  {isConnected && !state.uploaded && (
                    <Button
                      size="sm"
                      disabled={!canBasePublish || !state.confirmed || jobBusy}
                      onClick={() => onUpload(platform)}
                    >
                      {jobBusy ? <Spinner data-icon="inline-start" /> : null}
                      {actionVerb}
                    </Button>
                  )}
                  {state.uploaded && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <BadgeCheckIcon className="size-3.5 text-primary" />
                      Done
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={!canBasePublish || readyCount === 0 || jobBusy}
            onClick={onUploadAllReady}
          >
            {jobBusy ? <Spinner data-icon="inline-start" /> : null}
            {actionVerb} all ready ({readyCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function extractPublishUrl(
  platform: PublishPlatformId,
  stdout: string,
  stderr: string
): string | undefined {
  const text = `${stdout}\n${stderr}`;
  const lines = text.split('\n').map((item) => item.trim());

  const uploaded = lines.find(
    (item) => item.startsWith(`✓ ${platform}:`) || item.includes(`✓ ${platform}:`)
  );
  if (uploaded) {
    const after = uploaded.replace(/^.*✓\s+\w+:\s*/, '');
    const token = after.split(/\s+—\s+/)[0]?.trim();
    if (token?.startsWith('http://') || token?.startsWith('https://')) return token;
    if (platform === 'youtube' && token && /^[\w-]{6,}$/.test(token)) {
      return `https://www.youtube.com/watch?v=${token}`;
    }
  }

  const skipped = lines.find(
    (item) =>
      item.includes(`${platform}: skipped`) && /Already uploaded/i.test(item)
  );
  if (skipped) {
    const match = skipped.match(/https?:\/\/\S+/);
    if (match?.[0]) return match[0].replace(/[.,)]+$/, '');
  }

  return undefined;
}
