import {
  CheckIcon,
  ClapperboardIcon,
  ImageIcon,
  LockIcon,
  MicIcon,
  SendIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  type LucideIcon
} from 'lucide-react';
import type { PhaseApprovals, PipelinePhase } from '@/lib/types';
import { cn } from '@/lib/utils';

export type PhaseStatus = 'locked' | 'todo' | 'ready' | 'review' | 'approved' | 'done';

export const PHASES: {
  id: PipelinePhase;
  step: number;
  label: string;
  blurb: string;
  icon: LucideIcon;
}[] = [
  { id: 'script', step: 1, label: 'Script', blurb: 'Story + claim check', icon: ScrollTextIcon },
  // Voice phase blurb
  { id: 'tts', step: 2, label: 'Voice', blurb: 'TTS → SFX mix → approve', icon: MicIcon },
  { id: 'images', step: 3, label: 'Visuals', blurb: 'Scene images + uploaded clips', icon: ImageIcon },
  { id: 'produce', step: 4, label: 'Produce', blurb: 'Build the final video', icon: ClapperboardIcon },
  { id: 'review', step: 5, label: 'Review', blurb: 'Watch and approve', icon: ShieldCheckIcon },
  { id: 'publish', step: 6, label: 'Publish', blurb: 'Package and distribute', icon: SendIcon }
];

/** Tech Desk: Scenes = TSX + still; Produce = create tech reel video → Review. */
export function phasesForPipeline(isTech: boolean): typeof PHASES {
  if (!isTech) return PHASES;
  return PHASES.map((phase) => {
    if (phase.id === 'images') {
      return { ...phase, label: 'Scenes', blurb: 'Scene TSX + static preview' };
    }
    if (phase.id === 'produce') {
      return { ...phase, label: 'Produce', blurb: 'Create reel video → Review' };
    }
    return phase;
  });
}

export type PhaseAssets = {
  hasAudio: boolean;
  hasImages: boolean;
  hasVideo: boolean;
  hasVeo: boolean;
  hasFinal: boolean;
  productionStatus: string | null;
  productionStale: boolean;
  hasPublished: boolean;
};

export function getPhaseStatus(
  phase: PipelinePhase,
  hasEpisode: boolean,
  assets: PhaseAssets | null,
  approvals: PhaseApprovals
): PhaseStatus {
  if (phase === 'script') {
    if (approvals.script) return 'approved';
    if (hasEpisode) return 'review';
    return 'todo';
  }
  if (phase === 'tts') {
    if (!approvals.script) return 'locked';
    if (approvals.tts) return 'approved';
    if (assets?.hasAudio) return 'review';
    return 'todo';
  }
  if (phase === 'images') {
    if (!approvals.script) return 'locked';
    if (approvals.images) return 'approved';
    if (assets?.hasImages) return 'review';
    return 'todo';
  }
  if (phase === 'produce') {
    if (!(approvals.script && approvals.tts && approvals.images)) return 'locked';
    if (assets?.hasFinal && !assets.productionStale) return 'done';
    return 'ready';
  }
  if (phase === 'review') {
    if (!(approvals.script && approvals.tts && approvals.images && assets?.hasFinal)) return 'locked';
    if (assets.productionStatus === 'APPROVED') return 'approved';
    if (assets.productionStatus === 'REJECTED') return 'todo';
    return 'review';
  }
  if (assets?.hasPublished) return 'done';
  if (assets?.productionStatus === 'APPROVED') return 'ready';
  return 'locked';
}

export function isPhaseLocked(
  phase: PipelinePhase,
  creating: boolean,
  approvals: PhaseApprovals,
  assets: PhaseAssets | null
): boolean {
  if (creating && phase !== 'script') return true;
  if (phase === 'tts' || phase === 'images') return !approvals.script;
  if (phase === 'produce') return !(approvals.script && approvals.tts && approvals.images);
  if (phase === 'review') {
    return !(approvals.script && approvals.tts && approvals.images && (assets?.hasFinal || assets?.productionStatus));
  }
  if (phase === 'publish') return assets?.productionStatus !== 'APPROVED';
  return false;
}

export function pickActivePhase(
  hasEpisode: boolean,
  assets: PhaseAssets | null,
  approvals: PhaseApprovals
): PipelinePhase {
  for (const phase of PHASES) {
    const status = getPhaseStatus(phase.id, hasEpisode, assets, approvals);
    if (status === 'locked') continue;
    if (status === 'todo' || status === 'ready' || status === 'review') return phase.id;
  }
  return assets?.hasPublished ? 'publish' : 'review';
}

export function completedPhaseCount(
  hasEpisode: boolean,
  assets: PhaseAssets | null,
  approvals: PhaseApprovals
): number {
  return PHASES.filter((phase) => {
    const status = getPhaseStatus(phase.id, hasEpisode, assets, approvals);
    return status === 'approved' || status === 'done';
  }).length;
}

type PhaseStepperProps = {
  value: PipelinePhase;
  creating: boolean;
  hasEpisode: boolean;
  assets: PhaseAssets | null;
  approvals: PhaseApprovals;
  onChange: (phase: PipelinePhase) => void;
  isTech?: boolean;
};

export function PhaseStepper({
  value,
  creating,
  hasEpisode,
  assets,
  approvals,
  onChange,
  isTech = false
}: PhaseStepperProps) {
  const phases = phasesForPipeline(isTech);
  return (
    <nav aria-label="Pipeline phases" className="w-full overflow-x-auto pb-1 xl:overflow-visible">
      <p className="mb-4 hidden text-[0.68rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase xl:block">
        Production flow
      </p>
      <ol className="flex min-w-max gap-1.5 xl:min-w-0 xl:flex-col xl:gap-1">
        {phases.map((item, index) => {
          const status = getPhaseStatus(item.id, hasEpisode, assets, approvals);
          const locked = isPhaseLocked(item.id, creating, approvals, assets);
          const active = value === item.id;
          const Icon = item.icon;
          const done = status === 'approved' || status === 'done';

          return (
            <li key={item.id} className="relative w-36 shrink-0 xl:w-full">
              {index < phases.length - 1 && (
                <div
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute top-5 -right-1.5 z-0 h-px w-1.5 xl:top-10 xl:right-auto xl:-bottom-1 xl:left-[1.2rem] xl:h-2 xl:w-px',
                    done ? 'bg-primary/50' : 'bg-border'
                  )}
                />
              )}
              <button
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'relative z-10 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-all duration-200',
                  active && 'bg-primary/10 text-foreground',
                  !active && !locked && 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                  locked && !active && 'text-muted-foreground/55'
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                    active && 'border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary),transparent_84%)]',
                    !active && done && 'border-primary/30 bg-primary/10 text-primary',
                    !active && !done && 'border-border bg-background text-muted-foreground'
                  )}
                >
                  {done ? <CheckIcon /> : locked ? <LockIcon /> : item.step}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className="hidden size-3.5 shrink-0 text-muted-foreground 2xl:block" />
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[0.7rem] text-muted-foreground">
                    {statusLabel(status)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function statusLabel(status: PhaseStatus): string {
  if (status === 'approved' || status === 'done') return 'Done';
  if (status === 'review') return 'Needs review';
  if (status === 'ready') return 'Ready';
  if (status === 'locked') return 'Locked';
  return 'Todo';
}
