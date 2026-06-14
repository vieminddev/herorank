/**
 * Queue handler (Engineer A + F) — processes batches from `herorank-analysis` queue.
 *
 * Called by `worker.ts` for the main analysis queue. Each message is processed individually
 * with per-message ack/retry control (not batch-level).
 */
import type { Env } from '../env';
import type { AnalysisQueueMessage } from './types';
import { processDeepAnalysisJob } from './consume';

export async function handleQueue(
  batch: MessageBatch<AnalysisQueueMessage>,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      const result = await processDeepAnalysisJob(env, msg.body);
      if (result.result === 'deferred') {
        // Retry later — don't ack.
        msg.retry();
      } else {
        msg.ack();
      }
    } catch (err) {
      console.error(`[queue] message ${msg.id} failed:`, err);
      msg.retry();
    }
  }
}
