import { useState } from 'react';
import { ChevronsUpDownIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { usePipeline, type PipelineId } from '@/lib/pipeline';
import { cn } from '@/lib/utils';

type Props = {
  /** When set, switching is blocked (e.g. job running). */
  blockedReason?: string | null;
  onBeforeSwitch?: () => void;
};

export function PipelineSwitcher({ blockedReason, onBeforeSwitch }: Props) {
  const { pipelines, pipelineId, pipeline, switchPipeline } = usePipeline();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PipelineId | null>(null);

  function requestSwitch(id: PipelineId) {
    if (id === pipelineId) {
      setOpen(false);
      return;
    }
    if (blockedReason) {
      toast.error(blockedReason);
      setOpen(false);
      return;
    }
    setPending(id);
  }

  function confirmSwitch() {
    if (!pending) return;
    onBeforeSwitch?.();
    switchPipeline(pending);
    const label = pipelines.find((p) => p.id === pending)?.label || pending;
    toast.success(`Switched to ${label}`);
    setPending(null);
    setOpen(false);
  }

  const pendingMeta = pipelines.find((p) => p.id === pending);

  return (
    <>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-border/70 bg-background/80"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span className="max-w-[9rem] truncate">{pipeline?.label || 'Pipeline'}</span>
          <ChevronsUpDownIcon className="size-3.5 opacity-60" />
        </Button>
        {open && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close pipeline menu"
              onClick={() => setOpen(false)}
            />
            <div className="absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
              {pipelines.map((item) => {
                const active = item.id === pipelineId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition',
                      active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    )}
                    onClick={() => requestSwitch(item.id as PipelineId)}
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 text-[0.7rem] text-muted-foreground line-clamp-2">
                      {item.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Dialog open={Boolean(pending)} onOpenChange={(next) => !next && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Switch to {pendingMeta?.label || 'pipeline'}?</DialogTitle>
            <DialogDescription>
              Episode selection resets to this pipeline&apos;s last episode. Assets stay on disk.
              Unsaved form fields in the desk will refresh.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmSwitch}>
              Switch pipeline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
