export type ExperimentModel = 'kling' | 'ltx';
export type ExperimentPreview = { runId: string; model: ExperimentModel; images: number; clips: number; durationSeconds: number; generationSeconds: number };
export type ExperimentStatus = {
  configured: boolean; error: string | null; approved: boolean; busy: boolean;
  runs: Array<{ runId: string; model: string; comparisonKey: string; status: string; active: boolean;
    completed: number; total: number; durationSeconds: number; error: string | null;
    clips: Array<{ id: string; url: string }>; finalUrl: string | null }>;
};
async function request<T>(file: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/episodes/${encodeURIComponent(file)}/video-experiments`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('mf.deskToken') ? { Authorization: `Bearer ${localStorage.getItem('mf.deskToken')}` } : {}) }, body: JSON.stringify(body)
  } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Video experiment request failed');
  return data as T;
}
export const getVideoExperiments = (file: string) => request<ExperimentStatus>(file);
export const startVideoExperiment = (file: string, body: { action: 'plan' | 'test' | 'run' | 'assemble'; model: ExperimentModel; runId?: string }) =>
  request<ExperimentPreview>(file, body);
