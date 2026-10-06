-- Облачный снимок дашборда чек-листа: KPI, статы педагога, карточки методиста.
-- Правки текста и публикация не затираются пересчётом ответов.

CREATE TABLE IF NOT EXISTS lesson_visit_dashboard (
  project_id INTEGER PRIMARY KEY REFERENCES lesson_visit_projects (id) ON DELETE CASCADE,
  kpis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_response_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lesson_visit_teacher_stats (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES lesson_visit_projects (id) ON DELETE CASCADE,
  teacher_key TEXT NOT NULL,
  teacher_label TEXT NOT NULL,
  department TEXT,
  visit_count INTEGER NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, teacher_key)
);

CREATE INDEX IF NOT EXISTS idx_lesson_visit_teacher_stats_project
  ON lesson_visit_teacher_stats (project_id, teacher_label);

CREATE TABLE IF NOT EXISTS lesson_visit_teacher_cards (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES lesson_visit_projects (id) ON DELETE CASCADE,
  teacher_key TEXT NOT NULL,
  narrative TEXT NOT NULL DEFAULT '',
  narrative_source TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  agreed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_payload JSONB,
  staff_email TEXT,
  staff_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, teacher_key)
);

CREATE INDEX IF NOT EXISTS idx_lesson_visit_teacher_cards_published
  ON lesson_visit_teacher_cards (staff_email)
  WHERE published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_visit_teacher_cards_project_status
  ON lesson_visit_teacher_cards (project_id, status);
