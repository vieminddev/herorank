-- AI Video Studio (VEO3 image-to-video) — async job pipeline.
--
-- A seller turns a hero photo into ONE short looping Etsy listing video. Generation is async
-- (VEO3 = queue + webhook, ~15s–2min), so each request is a job row here; the result MP4 lives in
-- R2 (binding ARCHIVE, keys video-jobs/{id}/out.mp4). The seed image (hero) is stored at
-- video-jobs/{id}/seed.png so VEO3 can fetch it via a token-gated public URL on our domain.
--
-- Lifecycle: pending → done (webhook downloaded the MP4 to R2) | error (VEO3 failed → credits refunded).
CREATE TABLE video_jobs (
  id               TEXT PRIMARY KEY,              -- our job id = VEO3 externalTaskId (one task per job)
  user_id          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'done' | 'error'
  clip_type        TEXT NOT NULL,                 -- turntable | lifestyle | detail | reveal
  video_mode       TEXT NOT NULL,                 -- VEO3 videoMode: 'image' (hero seed) | 'text'
  aspect           TEXT NOT NULL,                 -- 'portrait' | 'landscape'
  duration         TEXT NOT NULL,                 -- '5s' | '8s'
  prompt           TEXT NOT NULL,
  seed_token       TEXT,                          -- opaque token gating GET /video-jobs/:id/seed
  credits_charged  INTEGER NOT NULL DEFAULT 0,    -- spent on submit; refunded once on failure
  refunded         INTEGER NOT NULL DEFAULT 0,    -- 0|1 idempotency guard for the refund
  error_msg        TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_video_jobs_user ON video_jobs(user_id, created_at);
