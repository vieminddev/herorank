/**
 * Job queue message types (Engineer A + F) — shared by the producer route (jobs.ts),
 * the queue consumer (queue.ts/consume.ts), and worker.ts.
 */

/** Deep shop analysis job — enqueued by POST /api/tools/shop-analysis-deep. */
export interface DeepShopAnalysisJob {
  kind: 'shop-analysis-deep';
  jobId: string;
  userId: string;
  shop: string;
  requestedAt: number;
}

/** Union of all queue message types (extensible for future job kinds). */
export type AnalysisQueueMessage = DeepShopAnalysisJob;
