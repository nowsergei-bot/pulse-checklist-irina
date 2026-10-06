-- Personal PDF layout templates for visit-checklist teacher cards.
-- Apply locally; do not run against remote DBs without an explicit deploy command.

CREATE TABLE IF NOT EXISTS visit_checklist_pdf_templates (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  template_json JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT visit_checklist_pdf_templates_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT visit_checklist_pdf_templates_type_len CHECK (char_length(document_type) BETWEEN 1 AND 64),
  CONSTRAINT visit_checklist_pdf_templates_revision_pos CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS idx_visit_checklist_pdf_templates_owner_type
  ON visit_checklist_pdf_templates (owner_user_id, document_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS visit_checklist_pdf_defaults (
  owner_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  template_id BIGINT NOT NULL REFERENCES visit_checklist_pdf_templates (id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_user_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_visit_checklist_pdf_defaults_template
  ON visit_checklist_pdf_defaults (template_id);
