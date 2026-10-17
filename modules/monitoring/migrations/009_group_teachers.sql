-- Учителя групп в модуле: назначение data_admin поверх Пульса (из файла составов или вручную).
-- Если у группы есть назначение, её видят и правят только назначенные учителя.
-- Если назначения нет, учитель группы берётся из Пульса (group_teachers), как раньше.
-- Хранятся только номера группы и учётной записи; текст столбца «Учитель» из файла не хранится.

CREATE TABLE monitoring.group_teacher_assignments (
 group_id integer NOT NULL,
 user_id integer NOT NULL,
 source text NOT NULL CHECK (source IN ('file', 'manual')),
 assigned_by integer NOT NULL,
 assigned_by_name text NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_teacher_assignments_user_idx ON monitoring.group_teacher_assignments (user_id);

-- Каждое назначение и снятие с настоящим автором.
-- how: file — из файла, manual — вручную, pulse — группа возвращена к учителю из Пульса.
CREATE TABLE monitoring.group_teacher_history (
 id serial PRIMARY KEY,
 group_id integer NOT NULL,
 user_id integer NOT NULL,
 action text NOT NULL CHECK (action IN ('assign', 'remove')),
 how text NOT NULL CHECK (how IN ('file', 'manual', 'pulse')),
 changed_by integer NOT NULL,
 changed_by_name text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX group_teacher_history_group_idx ON monitoring.group_teacher_history (group_id, id);
