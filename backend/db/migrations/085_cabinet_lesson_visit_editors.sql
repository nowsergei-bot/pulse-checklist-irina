CREATE TABLE IF NOT EXISTS cabinet_lesson_visit_editors (
  staff_id INTEGER PRIMARY KEY,
  email TEXT,
  full_name TEXT NOT NULL,
  granted_by_staff_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
