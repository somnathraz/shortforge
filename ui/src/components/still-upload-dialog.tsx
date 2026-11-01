import { useEffect, useRef, useState } from 'react';
import { ImageIcon, UploadIcon } from 'lucide-react';
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

const ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp';

type StillUploadDialogProps = {
  open: boolean;
  sceneLabel: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (file: File) => Promise<void>;
};

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

export function StillUploadDialog({
  open,
  sceneLabel,
  busy = false,
  onOpenChange,
  onUpload
}: StillUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDragOver(false);
      setPending(null);
      setError(null);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function chooseFile(file: File | undefined | null) {
    if (!file) return;
    if (!isImageFile(file)) {
      setError('Use a PNG, JPG, or WebP image');
      return;
    }
    setError(null);
    setPending(file);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  async function submit() {
    if (!pending || busy) return;
    setError(null);
    try {
      await onUpload(pending);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Upload still · {sceneLabel}</DialogTitle>
          <DialogDescription>
            Drop an image or browse your files. It becomes a selectable still for this slot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              chooseFile(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50',
              busy && 'pointer-events-none opacity-60'
            )}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Still preview"
                className="max-h-56 w-auto max-w-full rounded-md object-contain"
              />
            ) : (
              <>
                <ImageIcon className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">Drag & drop an image here</p>
                <p className="text-xs text-muted-foreground">or click to browse · PNG / JPG / WebP</p>
              </>
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />

          {pending ? (
            <p className="truncate text-xs text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{pending.name}</span>
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !pending} onClick={() => void submit()}>
            {busy ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
            Use this image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
