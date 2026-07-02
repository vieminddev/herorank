-- AI Image Studio — async job pipeline (multi-provider).
--
-- Image generation can be slow when routed to VEO3 (media.viemind.ai can take 5–10 min when busy),
-- which blows past Cloudflare's ~100s request limit if done synchronously. So each requested image
-- becomes a job row here; the finished image lives in R2 (binding ARCHIVE, key image-jobs/{id}/out).
-- A single "generate set" click creates N rows sharing one batch_id so the UI can group them.
--
-- Lifecycle: pending → done (image stored in R2) | error (generation failed → 5 credits refunded).
-- vtoken jobs are produced inline at submit (fast); VEO3 jobs complete later via the webhook.
CREATE TABLE image_jobs (
  id               TEXT PRIMARY KEY,              -- our job id = VEO3 externalTaskId (one task per job)
  user_id          TEXT NOT NULL,
  batch_id         TEXT NOT NULL,                 -- groups the N images from one generate click
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'done' | 'error'
  provider         TEXT NOT NULL,                 -- 'veo3' | 'vtoken'
  mode             TEXT NOT NULL,                 -- mockup | lifestyle | detail | scale | group | remove-bg
  prompt           TEXT NOT NULL,
  size             TEXT NOT NULL,                 -- 1024x1024 | 1024x1792 | 1792x1024
  credits_charged  INTEGER NOT NULL DEFAULT 0,    -- 5 per image; refunded once on failure
  refunded         INTEGER NOT NULL DEFAULT 0,    -- 0|1 idempotency guard for the refund
  error_msg        TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_image_jobs_user ON image_jobs(user_id, created_at);
CREATE INDEX idx_image_jobs_batch ON image_jobs(batch_id);
