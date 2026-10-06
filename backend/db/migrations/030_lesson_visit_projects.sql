-- Чек-лист посещения урока: опрос + аналитика (связь с lesson_analytics_projects в state_json)
CREATE TABLE IF NOT EXISTS lesson_visit_projects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Чек-лист посещения урока',
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  form_token TEXT NOT NULL,
  director_share_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_visit_projects_form_token
  ON lesson_visit_projects (form_token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_visit_projects_director_token
  ON lesson_visit_projects (director_share_token);

CREATE INDEX IF NOT EXISTS idx_lesson_visit_projects_user_updated
  ON lesson_visit_projects (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lesson_visit_responses (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES lesson_visit_projects (id) ON DELETE CASCADE,
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_visit_responses_project_created
  ON lesson_visit_responses (project_id, created_at DESC);
