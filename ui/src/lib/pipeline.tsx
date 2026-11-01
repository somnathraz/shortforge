import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { listPipelines, setApiPipelineId, type PipelineInfo } from '@/lib/api';

/** Pipeline id = config/brands/<id>.json on the server. */
export type PipelineId = string;

const ACTIVE_KEY = 'mf.activePipeline';
const REMEMBER_KEY = 'mf.rememberPipeline';

function episodeKey(pipelineId: PipelineId) {
  return `mf.pipeline.${pipelineId}.selectedEpisode`;
}

function phaseKey(pipelineId: PipelineId) {
  return `mf.pipeline.${pipelineId}.activePhase`;
}

function readStoredPipeline(): PipelineId | null {
  try {
    const value = localStorage.getItem(ACTIVE_KEY);
    if (value && /^[a-z][a-z0-9-]{1,40}$/.test(value)) return value;
  } catch {
    // ignore
  }
  return null;
}

function readRemember(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'false';
  } catch {
    return true;
  }
}

type PipelineContextValue = {
  ready: boolean;
  needsGate: boolean;
  pipelines: PipelineInfo[];
  pipelineId: PipelineId;
  pipeline: PipelineInfo | null;
  /** Server's default pipeline (DEFAULT_BRAND, else epicastra). */
  defaultPipelineId: PipelineId;
  /** Active pipeline runs on the tech-reel engine. */
  isTech: boolean;
  /** Same check for any pipeline id, e.g. an episode's brandId. */
  isTechPipeline: (id: string | null | undefined) => boolean;
  remember: boolean;
  setRemember: (value: boolean) => void;
  choosePipeline: (id: PipelineId) => void;
  switchPipeline: (id: PipelineId) => void;
  readSelectedEpisode: () => string | null;
  storeSelectedEpisode: (file: string | null) => void;
  readActivePhase: () => string | null;
  storeActivePhase: (phase: string | null) => void;
};

const PipelineContext = createContext<PipelineContextValue | null>(null);

function applyTheme(pipelineId: PipelineId, theme?: string, kind?: string) {
  const root = document.documentElement;
  root.dataset.pipeline = pipelineId;
  root.dataset.themeBrand = theme || (kind === 'tech' ? 'tech' : 'heritage');
}

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [pipelineId, setPipelineId] = useState<PipelineId>(() => readStoredPipeline() || '');
  const [defaultPipelineId, setDefaultPipelineId] = useState<PipelineId>('epicastra');
  const [needsGate, setNeedsGate] = useState(() => !readStoredPipeline());
  const [remember, setRememberState] = useState(readRemember);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listPipelines();
        if (cancelled) return;
        setPipelines(data.pipelines);
        setDefaultPipelineId(data.active);
        const storedRaw = readStoredPipeline();
        // A remembered pipeline that no longer exists in config/brands falls back to the gate.
        const stored = storedRaw && data.pipelines.some((p) => p.id === storedRaw) ? storedRaw : null;
        if (stored) {
          setPipelineId(stored);
          setNeedsGate(false);
          setApiPipelineId(stored);
          const meta = data.pipelines.find((p) => p.id === stored);
          applyTheme(stored, meta?.theme, meta?.kind);
        } else {
          setNeedsGate(true);
          setApiPipelineId(pipelineId);
        }
      } catch {
        if (!cancelled) {
          setPipelines([
            {
              id: 'epicastra',
              kind: 'story',
              label: 'EpicAstra',
              blurb: 'Cinematic mythology Shorts',
              studioSubtitle: 'Mythology production studio',
              defaultLanguage: 'hi',
              publishProfiles: ['youtube', 'instagram', 'facebook'],
              visualBrand: 'EPICASTRA_HERITAGE',
              emptyListCopy: 'No episodes yet.',
              newEpisodeLabel: 'Create a new short',
              theme: 'heritage'
            },
            {
              id: 'tech-instagram',
              kind: 'tech',
              label: 'Tech Reels',
              blurb: 'DSA, system design, app building',
              studioSubtitle: 'Tech education studio',
              defaultLanguage: 'en',
              publishProfiles: ['youtube', 'instagram', 'facebook'],
              visualBrand: 'TECH_EDITORIAL',
              emptyListCopy: 'No tech Reels yet.',
              newEpisodeLabel: 'Create a new Reel',
              theme: 'tech'
            }
          ]);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, []);

  const pipeline = useMemo(
    () => pipelines.find((item) => item.id === pipelineId) || null,
    [pipelines, pipelineId]
  );

  useEffect(() => {
    setApiPipelineId(pipelineId);
    applyTheme(pipelineId, pipeline?.theme, pipeline?.kind);
  }, [pipelineId, pipeline?.theme, pipeline?.kind]);

  const isTechPipeline = useCallback(
    (id: string | null | undefined) => pipelines.find((item) => item.id === id)?.kind === 'tech',
    [pipelines]
  );

  const setRemember = useCallback((value: boolean) => {
    setRememberState(value);
    try {
      localStorage.setItem(REMEMBER_KEY, value ? 'true' : 'false');
      if (!value) localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const choosePipeline = useCallback(
    (id: PipelineId) => {
      setPipelineId(id);
      setNeedsGate(false);
      setApiPipelineId(id);
      try {
        if (remember) localStorage.setItem(ACTIVE_KEY, id);
        else localStorage.removeItem(ACTIVE_KEY);
      } catch {
        // ignore
      }
    },
    [remember]
  );

  const switchPipeline = useCallback(
    (id: PipelineId) => {
      if (id === pipelineId) return;
      choosePipeline(id);
    },
    [choosePipeline, pipelineId]
  );

  const readSelectedEpisode = useCallback(() => {
    try {
      const value = localStorage.getItem(episodeKey(pipelineId));
      return value && value.endsWith('.json') ? value : null;
    } catch {
      return null;
    }
  }, [pipelineId]);

  const storeSelectedEpisode = useCallback(
    (file: string | null) => {
      try {
        if (file) localStorage.setItem(episodeKey(pipelineId), file);
        else localStorage.removeItem(episodeKey(pipelineId));
      } catch {
        // ignore
      }
    },
    [pipelineId]
  );

  const readActivePhase = useCallback(() => {
    try {
      return localStorage.getItem(phaseKey(pipelineId));
    } catch {
      return null;
    }
  }, [pipelineId]);

  const storeActivePhase = useCallback(
    (phase: string | null) => {
      try {
        if (phase) localStorage.setItem(phaseKey(pipelineId), phase);
        else localStorage.removeItem(phaseKey(pipelineId));
      } catch {
        // ignore
      }
    },
    [pipelineId]
  );

  const value: PipelineContextValue = {
    ready,
    needsGate,
    pipelines,
    pipelineId,
    pipeline,
    defaultPipelineId,
    isTech: pipeline?.kind === 'tech',
    isTechPipeline,
    remember,
    setRemember,
    choosePipeline,
    switchPipeline,
    readSelectedEpisode,
    storeSelectedEpisode,
    readActivePhase,
    storeActivePhase
  };

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}

export function usePipeline(): PipelineContextValue {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error('usePipeline requires PipelineProvider');
  return ctx;
}
