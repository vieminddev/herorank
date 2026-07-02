/**
 * DLQ consumer (Phase 5 R3) — processes messages from `herorank-analysis-dlq`.
 *
 * Messages arrive here after exhausting retries on the main queue. This handler:
 *   1. Marks the corresponding analyses row as 'failed'.
 *   2. Logs an error alert.
 *   3. Always acks (DLQ messages are terminal — never re-queued).
 */
import type { Env } from '../env';
import type { AnalysisQueueMessage } from './types';
import { createAnalysesJobStore } from '../services/jobs/analysesJobStore';
import { logError } from '../observability/log';

/** Terminal failure reason written to the job + the DLQ alert when retries are exhausted. */
const DLQ_FAILURE_REASON = 'Job reached maximum retries (DLQ)';

export async function handleDLQ(
  batch: MessageBatch<AnalysisQueueMessage>,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const jobs = createAnalysesJobStore(env.DB);

  for (const msg of batch.messages) {
    try {
      const jobId = parseInt(msg.body.jobId, 10);
      // F-04: only mark failed if not already done (don't overwrite successful results).
      const existing = await jobs.getById(jobId);
      if (existing && existing.status !== 'done') {
        await jobs.update(jobId, { status: 'failed', error: DLQ_FAILURE_REASON });
      }

      logError(new Error(DLQ_FAILURE_REASON), {
        event: 'dlq',
        job_id: msg.body.jobId,
        user_id: msg.body.userId,
        shop: msg.body.shop,
        kind: msg.body.kind,
      });
    } catch (err) {
      console.error(`[dlq] failed to process DLQ message ${msg.id}:`, err);
    }
    // Always ack — DLQ messages are terminal.
    msg.ack();
  }
}
