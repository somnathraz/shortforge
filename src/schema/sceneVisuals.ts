import { z } from 'zod';

export const SceneVisualsSchema = z.record(z.string().regex(/^(?:-1|0|[1-9]\d*)$/), z.object({
  source: z.enum(['image', 'upload', 'ai']),
  durationSeconds: z.number().min(0.1).max(600).optional(),
  trimStartSeconds: z.number().min(0).max(86400).optional(),
  shortClip: z.enum(['freeze', 'loop']).optional()
}));
