import { z } from 'zod';

// The summary takes no options: unknown query parameters are rejected.
export const dashboardQuerySchema = z.object({}).strict();
