import { z } from 'zod';
import { BlastRadius } from '@devdigest/shared';

export const BlastRadiusResult = BlastRadius.extend({
  degraded: z.boolean(),
  reason: z.string(),
});

export type BlastRadiusResult = z.infer<typeof BlastRadiusResult>;
