-- media 原为 (url TEXT PRIMARY KEY, fileId TEXT NOT NULL)
ALTER TABLE media ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE media ADD COLUMN created_at INTEGER;
ALTER TABLE media ADD COLUMN filename TEXT;
ALTER TABLE media ADD COLUMN content_type TEXT;
ALTER TABLE media ADD COLUMN extension TEXT;
ALTER TABLE media ADD COLUMN size INTEGER;
CREATE INDEX IF NOT EXISTS idx_media_owner_created ON media(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_media_extension ON media(extension);
