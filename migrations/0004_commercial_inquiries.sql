CREATE TABLE inquiries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('fashion-editorial','local-business','event')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  target_date TEXT,
  location TEXT NOT NULL,
  objectives TEXT NOT NULL,
  scope TEXT NOT NULL,
  created INTEGER NOT NULL,
  email_queued INTEGER NOT NULL DEFAULT 0 CHECK(email_queued IN (0,1))
);
