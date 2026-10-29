-- Preserve earlier records. Public catalog uses verified government publications,
-- never the synthetic opinions from the original prototype.
CREATE TABLE IF NOT EXISTS civic_feedback_v2 (
 id TEXT PRIMARY KEY,
 policy_id TEXT NOT NULL,
 policy_title TEXT NOT NULL,
 region TEXT NOT NULL,
 title TEXT NOT NULL,
 content TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS civic_feedback_v2_date ON civic_feedback_v2(created_at DESC);
