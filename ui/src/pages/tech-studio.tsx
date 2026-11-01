import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PipelineSwitcher } from '@/components/pipeline-switcher';
import { useAuth } from '@/lib/auth';
import {
  getTechReel,
  getTechReelTemplate,
  getTechSceneTemplateSource,
  listTechReels,
  listTechSceneTemplates,
  listTechSeries,
  getTechSeries,
  createTechSeries,
  saveTechSeries,
  saveTechReel,
  renderTechReel,
  formatTechSceneTsx,
  scaffoldTechSceneTemplate,
  publishTechSceneTemplate,
  previewTechSceneStill,
  type TechReelDetail,
  type TechReelSummary,
  type TechSceneTemplateMeta,
  type TechSeries,
  type TechSeriesSummary
} from '@/lib/api';
import { TECH_REEL_ELEMENTS } from '../../../src/visual/techReelElements';
import { TechReelAuthoringSchema } from '../../../src/schema/techReel';
import './tech-studio.css';

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'new-series';
}

function dayPrompt(series: TechSeries, day: number): string {
  const entry = series.days.find((d) => d.day === day);
  if (!entry) return '';
  const topic = (entry.topic || entry.title).trim();
  return `Day ${entry.day} of "${series.title}": ${topic}`;
}

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

export function TechStudio() {
  const { logout } = useAuth();
  const [library, setLibrary] = useState<TechReelSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<TechReelDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [silent, setSilent] = useState(false);
  const [templates, setTemplates] = useState<TechSceneTemplateMeta[]>([]);
  const [sceneId, setSceneId] = useState('custom.demo');
  const [sceneSource, setSceneSource] = useState(SAMPLE_SCENE);
  const [stillUrl, setStillUrl] = useState('');
  const [stillBusy, setStillBusy] = useState(false);
  const [seriesMode, setSeriesMode] = useState(true);
  const [seriesList, setSeriesList] = useState<TechSeriesSummary[]>([]);
  const [seriesId, setSeriesId] = useState('');
  const [series, setSeries] = useState<TechSeries | null>(null);
  const [activeDay, setActiveDay] = useState(1);
  const [newSeriesTitle, setNewSeriesTitle] = useState('');
  const running = detail?.job?.status === 'running';
  const dirty = draft !== saved;
  const activeDayEntry = series?.days.find((d) => d.day === activeDay) || null;

  async function refreshTemplates() {
    const { templates: next } = await listTechSceneTemplates();
    setTemplates(next);
  }

  async function loadSeries(id: string) {
    const { series: next } = await getTechSeries(id);
    setSeries(next);
    setSeriesId(next.id);
    const day = next.days[0]?.day || 1;
    setActiveDay(day);
    setTopic(dayPrompt(next, day));
    const dayMeta = next.days.find((d) => d.day === day);
    if (dayMeta?.templateId) setSceneId(dayMeta.templateId);
    if (dayMeta?.reelId && library.some((r) => r.id === dayMeta.reelId)) setSelected(dayMeta.reelId);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTechReels(), listTechSceneTemplates(), listTechSeries()]).then(([reelsRes, scenesRes, seriesRes]) => {
      if (cancelled) return;
      setLibrary(reelsRes.reels);
      setTemplates(scenesRes.templates);
      setSeriesList(seriesRes.series);
      const requested = new URLSearchParams(window.location.search).get('reel');
      setSelected(reelsRes.reels.find(r => r.id === requested)?.id || reelsRes.reels.find(r => r.id === 'vertical-scaling')?.id || reelsRes.reels[0]?.id || '');
      const firstSeries = seriesRes.series.find((s) => s.id === 'dsa-from-zero') || seriesRes.series[0];
      if (firstSeries) {
        void getTechSeries(firstSeries.id).then(({ series: next }) => {
          if (cancelled) return;
          setSeries(next);
          setSeriesId(next.id);
          const day = next.days[0]?.day || 1;
          setActiveDay(day);
          setTopic(dayPrompt(next, day));
        });
      }
    }).catch(e => { if (!cancelled) setError(String(e.message)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setBusy(true); setError(''); setDetail(null);
    getTechReel(selected).then(data => {
      if (cancelled) return;
      setDetail(data);
      const json = JSON.stringify(data.reel, null, 2);
      setDraft(json); setSaved(json);
    }).catch(e => { if (!cancelled) setError(String(e.message)); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!running || !selected) return;
    let cancelled = false;
    const timer = setInterval(() => {
      getTechReel(selected).then(data => {
        if (cancelled) return;
        setDetail(data);
        if (data.job?.status === 'completed') setNotice('Render complete. Your video is ready below.');
        if (data.job?.status === 'failed') setError('Render failed. See the render log below; the previous final video is preserved.');
      }).catch(e => { if (!cancelled) setError(String(e.message)); });
    }, 2500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [running, selected]);

  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  function selectDay(day: number) {
    if (!series) return;
    setActiveDay(day);
    setTopic(dayPrompt(series, day));
    const entry = series.days.find((d) => d.day === day);
    if (entry?.templateId) setSceneId(entry.templateId);
    if (entry?.reelId) setSelected(entry.reelId);
  }

  function patchActiveDay(patch: Partial<NonNullable<typeof activeDayEntry>>) {
    if (!series || !activeDayEntry) return;
    const days = series.days.map((d) => (d.day === activeDay ? { ...d, ...patch } : d));
    const next = { ...series, days };
    setSeries(next);
    setTopic(dayPrompt(next, activeDay));
  }

  async function persistSeries(next = series) {
    if (!next) throw new Error('No series loaded');
    const { series: savedSeries } = await saveTechSeries(next);
    setSeries(savedSeries);
    setSeriesList((await listTechSeries()).series);
    setNotice(`Series saved · ${savedSeries.days.length} days`);
    return savedSeries;
  }

  async function save() {
    const parsed = TechReelAuthoringSchema.safeParse(JSON.parse(draft));
    if (!parsed.success) throw new Error(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'));
    const exists = library.some(r => r.id === parsed.data.id);
    if (exists && parsed.data.id !== selected) throw new Error('That ID already belongs to another reel. Open it from the library, or choose a new ID.');
    const { reel } = await saveTechReel(parsed.data, !exists);
    const json = JSON.stringify(reel, null, 2);
    setDraft(json); setSaved(json);
    const data = await getTechReel(reel.id); setDetail(data);
    setLibrary((await listTechReels()).reels); setSelected(reel.id);
    if (seriesMode && series && activeDayEntry) {
      const linked = {
        ...series,
        days: series.days.map((d) =>
          d.day === activeDay
            ? { ...d, reelId: reel.id, templateId: sceneId || d.templateId, title: d.title || reel.title }
            : d
        )
      };
      await persistSeries(linked);
      setNotice(`Script saved and linked to Day ${activeDay} of ${series.title}.`);
    } else {
      setNotice('Script validated and saved.');
    }
    return reel.id;
  }
  const preview = detail?.job?.status === 'completed' && detail.job.previewUrl || detail?.output?.url;

  return <div className="tech-studio">
    <header className="ts-header">
      <Link to="/" className="ts-brand">CODEWITHSOME <span>/ STUDIO</span></Link>
      <nav aria-label="Studio navigation"><Link to="/desk">Episode desk</Link><PipelineSwitcher blockedReason={dirty ? 'Save your script before switching pipelines.' : null} /><button onClick={() => void logout()}>Sign out</button></nav>
    </header>
    <main className="ts-main">
      <div className="ts-intro"><div><p className="ts-eyebrow">TECH REELS / SERIES + SCENE TS</p><h1>Plan the days. Then build the scene.</h1><p>Start a series with Day 1 / Day 2 titles, save the Remotion scene, then upload that day’s JSON.</p></div><span className="ts-lock">1080 × 1920 · one idea per day</span></div>
      {error && <pre className="ts-error" role="alert">{error}</pre>}
      {notice && <p className="ts-notice" role="status">{notice}</p>}

      <section className="ts-series" aria-label="Series planner">
        <div className="ts-section-head">
          <h2>00 / Series</h2>
          <label className="ts-checkbox ts-inline"><input type="checkbox" checked={seriesMode} disabled={busy || running} onChange={e => setSeriesMode(e.target.checked)} /> Working on a series</label>
        </div>
        {seriesMode && <>
          <div className="ts-series-toolbar">
            <label htmlFor="ts-series-pick">Series</label>
            <select id="ts-series-pick" value={seriesId} disabled={busy || running} onChange={e => void perform(async () => { await loadSeries(e.target.value); })}>
              {!seriesId && <option value="">Choose a series</option>}
              {seriesList.map((s) => <option key={s.id} value={s.id}>{s.title} · {s.days} days</option>)}
            </select>
            <input
              value={newSeriesTitle}
              disabled={busy || running}
              onChange={e => setNewSeriesTitle(e.target.value)}
              placeholder="New series title e.g. System Design Basics"
            />
            <button disabled={busy || running || !newSeriesTitle.trim()} onClick={() => void perform(async () => {
              const id = slugify(newSeriesTitle);
              const { series: created } = await createTechSeries(id, newSeriesTitle.trim());
              setSeriesList((await listTechSeries()).series);
              setSeries(created);
              setSeriesId(created.id);
              setActiveDay(1);
              setTopic(dayPrompt(created, 1));
              setNewSeriesTitle('');
              setNotice(`Started series "${created.title}" with Day 1 and Day 2 stubs.`);
            })}>Start series</button>
            <button disabled={busy || running || !series} onClick={() => void perform(async () => { await persistSeries(); })}>Save series</button>
          </div>
          {series && <>
            <div className="ts-series-meta">
              <label htmlFor="ts-series-title">Series title</label>
              <input id="ts-series-title" value={series.title} disabled={busy || running} onChange={e => setSeries({ ...series, title: e.target.value })} />
              <label htmlFor="ts-series-pitch">Pitch</label>
              <input id="ts-series-pitch" value={series.pitch} disabled={busy || running} onChange={e => setSeries({ ...series, pitch: e.target.value })} placeholder="One line reason to follow the series" />
            </div>
            <div className="ts-day-strip" role="list">
              {series.days
                .slice()
                .sort((a, b) => a.day - b.day)
                .map((d) => (
                  <button
                    key={d.day}
                    type="button"
                    role="listitem"
                    className={activeDay === d.day ? 'is-active' : undefined}
                    disabled={busy || running}
                    onClick={() => selectDay(d.day)}
                  >
                    <span className="ts-day-num">Day {d.day}</span>
                    <span className="ts-day-title">{d.title}</span>
                  </button>
                ))}
              <button
                type="button"
                className="ts-day-add"
                disabled={busy || running}
                onClick={() => {
                  const nextDay = series.days.reduce((max, d) => Math.max(max, d.day), 0) + 1;
                  const next = {
                    ...series,
                    days: [...series.days, { day: nextDay, title: `Day ${nextDay} topic`, topic: '' }]
                  };
                  setSeries(next);
                  setActiveDay(nextDay);
                  setTopic(dayPrompt(next, nextDay));
                }}
              >
                + Day
              </button>
            </div>
            {activeDayEntry && (
              <div className="ts-day-edit">
                <label htmlFor="ts-day-title">Day {activeDay} title</label>
                <input
                  id="ts-day-title"
                  value={activeDayEntry.title}
                  disabled={busy || running}
                  onChange={e => patchActiveDay({ title: e.target.value })}
                  placeholder="Short on-screen day title"
                  maxLength={64}
                />
                <label htmlFor="ts-day-topic">Day {activeDay} topic (for LLM)</label>
                <input
                  id="ts-day-topic"
                  value={activeDayEntry.topic || ''}
                  disabled={busy || running}
                  onChange={e => patchActiveDay({ topic: e.target.value })}
                  placeholder="What this day’s reel teaches"
                />
                <p className="ts-help">
                  Active: <strong>Day {activeDay}</strong>
                  {activeDayEntry.reelId ? <> · linked reel <code>{activeDayEntry.reelId}</code></> : null}
                  {activeDayEntry.templateId ? <> · scene <code>{activeDayEntry.templateId}</code></> : null}
                  . Saving a script below links it to this day.
                </p>
              </div>
            )}
          </>}
        </>}
      </section>

      <div className="ts-workspace">
        <section className="ts-editor" aria-label="Script editor">
          <div className="ts-section-head"><h2>01 / Scene TSX</h2><span>{templates.length} registered</span></div>
          <p className="ts-help">New scene type for this day? Paste formatted TSX (or scaffold a stub), save, then upload reel JSON that uses that id on every beat.</p>
          <div className="ts-template-list" role="list">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={sceneId === t.id ? 'is-active' : undefined}
                disabled={busy || running}
                onClick={() => void perform(async () => {
                  setSceneId(t.id);
                  const file = await getTechSceneTemplateSource(t.id);
                  setSceneSource(file.source);
                  if (series && activeDayEntry) patchActiveDay({ templateId: t.id });
                  setNotice(`Loaded ${file.relativePath}`);
                })}
              >
                <code>{t.id}</code>
                <span>{t.status}</span>
              </button>
            ))}
          </div>
          <label htmlFor="ts-scene-id">Template id</label>
          <input id="ts-scene-id" value={sceneId} disabled={busy || running} onChange={e => setSceneId(e.target.value.trim())} placeholder="pack.name e.g. mobility.surge" />
          <label htmlFor="ts-scene-tsx">Remotion scene TSX</label>
          <textarea id="ts-scene-tsx" className="ts-scene-tsx" value={sceneSource} disabled={running || busy} onChange={e => setSceneSource(e.target.value)} spellCheck={false} />
          <p className="ts-help">Existing scenes preview/render without saving. Save only updates the .tsx when you edited it.</p>
          <div className="ts-actions">
            <button disabled={busy || running} onClick={() => void perform(async () => {
              const { source } = await formatTechSceneTsx(sceneSource);
              setSceneSource(source);
              setNotice('Formatted TSX (stripped fences, normalized whitespace).');
            })}>Format TSX</button>
            <button disabled={busy || running || !sceneId} onClick={() => void perform(async () => {
              const result = await scaffoldTechSceneTemplate(sceneId);
              setSceneSource(result.formattedSource);
              setTemplates(result.templates);
              setNotice(`Scaffolded ${result.relativePath}. Edit the TSX, then save scene.`);
            })}>Scaffold blank</button>
            <button className="ts-primary" disabled={busy || running || !sceneId || !sceneSource} onClick={() => void perform(async () => {
              const synced = sceneSource.replace(/\bid\s*:\s*['"`][^'"`]+['"`]/, `id: '${sceneId}'`);
              const result = await publishTechSceneTemplate({ id: sceneId, source: synced, overwrite: true });
              setSceneSource(result.formattedSource);
              setTemplates(result.templates);
              if (series && activeDayEntry) {
                const linked = {
                  ...series,
                  days: series.days.map((d) => (d.day === activeDay ? { ...d, templateId: result.id } : d))
                };
                setSeries(linked);
                await persistSeries(linked);
              }
              setNotice(`${result.created ? 'Created' : 'Updated'} ${result.relativePath}. Day ${activeDay || '—'} can use "template": "${result.id}".`);
              await refreshTemplates();
            })}>Save scene</button>
            <label className="ts-upload">Upload .tsx<input type="file" accept=".tsx,.ts,text/plain" disabled={busy || running} onChange={e => {
              const file = e.target.files?.[0]; if (!file) return;
              void perform(async () => {
                setSceneSource(await file.text());
                const base = file.name.replace(/\.tsx?$/i, '');
                if (/^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/.test(base)) setSceneId(base);
                setNotice(`Loaded ${file.name} into the editor. Format, then Save scene.`);
              });
              e.target.value = '';
            }} /></label>
            <button disabled={busy || running || stillBusy || !sceneId} onClick={() => void perform(async () => {
              setStillBusy(true);
              try {
                const still = await previewTechSceneStill({ id: sceneId, force: true });
                setStillUrl(still.url);
                setNotice(`Static still ready for ${sceneId} (frame ${still.frame}${still.cached ? ', cached' : ''}).`);
              } finally {
                setStillBusy(false);
              }
            })}>{stillBusy ? 'Still…' : 'Static preview'}</button>
          </div>
          {stillUrl ? (
            <div className="ts-still" aria-label="Static scene still">
              <img src={stillUrl} alt={`Static preview of ${sceneId}`} />
            </div>
          ) : null}

          <div className="ts-rule" />
          <div className="ts-section-head"><h2>02 / Write the lesson</h2><span>{seriesMode && activeDayEntry ? `Day ${activeDay}` : 'English · 5–9 beats'}</span></div>
          <label htmlFor="ts-topic">Topic for your LLM prompt</label>
          <input id="ts-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Day 1 of DSA from Zero: Big O basics" />
          <div className="ts-actions">
            <button disabled={busy} onClick={() => void perform(async () => { const b = await getTechReelTemplate(topic); await navigator.clipboard.writeText(b.llmPrompt); setNotice('Copied the full instructions and sample JSON. Paste into your LLM.'); })}>Copy LLM prompt + sample</button>
            <button disabled={busy} onClick={() => void perform(async () => { const b = await getTechReelTemplate(topic); download('tech-orbital-sample.json', JSON.stringify(b.template, null, 2), 'application/json'); })}>Download sample JSON</button>
            <button disabled={busy} onClick={() => void perform(async () => { const b = await getTechReelTemplate(topic); download('tech-orbital-llm-brief.txt', b.llmPrompt, 'text/plain'); })}>Download instructions</button>
          </div>
          <details className="ts-help">
            <summary>How future reels and new elements work</summary>
            <p>Topic → choose or build the visual elements → generate storyboard JSON → validate → narration → speech-timed animation → preview and render.</p>
            <p>Use <code>lanes</code> for multiple request paths and <code>cues[].onPhrase</code> to trigger changes on spoken words. CPU/RAM additions and queue growth are driven by the actual counts in your script.</p>
            <ul>{TECH_REEL_ELEMENTS.map(element => <li key={element.kind}><code>{element.kind}</code>: {element.use}</li>)}</ul>
            <p>If the lesson needs a new visual, create its scene TSX above or extend the element renderer first. JSON can use registered elements; it cannot invent their drawing code.</p>
          </details>
          <p className="ts-help">Default path: orbital nodes/flows.<br />Scene path: every beat sets <code>"template": "{sceneId || 'pack.name'}"</code> after the TSX is saved above.</p>
          <div className="ts-rule" />
          <div className="ts-section-head"><h2>03 / Import & review</h2><span>{dirty ? 'Unsaved changes' : 'Saved on disk'}</span></div>
          <label htmlFor="ts-library">Saved reels</label>
          <select id="ts-library" value={selected} disabled={busy || running || dirty} onChange={e => setSelected(e.target.value)}>
            {!selected && <option value="">Choose a reel</option>}
            {library.map(r => <option key={r.id} value={r.id}>{r.title}{r.style !== 'orbital' ? ' (scene / legacy)' : ''}</option>)}
          </select>
          <div className="ts-actions"><label className="ts-upload">Upload JSON<input type="file" accept=".json,application/json" disabled={busy || running} onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            void perform(async () => { setDraft(await file.text()); setNotice('Imported into editor. Review, then save. Unknown template ids fail until you Save scene above.'); });
            e.target.value = '';
          }} /></label><button disabled={busy || running || !dirty} onClick={() => { setDraft(saved); setError(''); }}>Discard edits</button></div>
          <label htmlFor="ts-json">Storyboard JSON</label>
          <textarea id="ts-json" value={draft} disabled={running || busy} onChange={e => setDraft(e.target.value)} spellCheck={false} />
          <p className="ts-help">Use a new <code>id</code> for each new reel. Saving rejects unknown <code>beats[].template</code> ids — create the Remotion scene first.</p>
          <button className="ts-primary" disabled={busy || running || !draft} onClick={() => void perform(async () => { await save(); })}>Validate & save script</button>
        </section>
        <section className="ts-preview" aria-label="Video preview">
          <div className="ts-section-head"><h2>04 / Render the reel</h2><span>{running ? 'Rendering…' : detail?.output ? `${Math.round(detail.output.duration)} seconds` : 'Ready when you are'}</span></div>
          <div className="ts-player">{preview ? <video key={preview} controls playsInline preload="metadata" src={preview} /> : <div className="ts-empty"><span>{seriesMode && activeDayEntry ? `DAY ${activeDay}` : 'YOUR NEXT LESSON'}</span><h3>{activeDayEntry?.title || <>From a clear idea<br />to a moving diagram.</>}</h3><p>{series ? `${series.title} — save a scene, save the script, then render.` : 'Save a scene TSX if needed, save a script, then render.'}</p></div>}</div>
          {detail?.output?.stale && <p className="ts-help">This video was rendered from an earlier version. Render again to apply the saved script.</p>}
          <label className="ts-checkbox"><input type="checkbox" checked={silent} disabled={busy || running} onChange={e => setSilent(e.target.checked)} /> Silent preview only</label>
          <p className="ts-help">Final renders use locked voice profile <code>TECH_ENGLISH_INDIA</code> (Rahul Bharadwaj · male Indian English · eleven_v4), timed captions and subtle transition sounds. New narration uses your ElevenLabs credits; unchanged speech is reused.</p>
          <div className="ts-actions"><button className="ts-primary" disabled={busy || running || !draft} onClick={() => void perform(async () => {
            const id = await save();
            const { job } = await renderTechReel(id, silent);
            setDetail(d => d ? { ...d, job } : d); setNotice('Rendering started. You can follow progress below.');
          })}>{running ? 'Rendering…' : silent ? 'Save & render preview' : 'Save & render final'}</button>{preview && <a href={preview} download>Download MP4</a>}</div>
          {detail?.job && <details className="ts-log" open={detail.job.status === 'failed'}><summary>Render log · {detail.job.status}</summary><pre>{detail.job.log}</pre></details>}
        </section>
      </div>
    </main>
  </div>;
}
