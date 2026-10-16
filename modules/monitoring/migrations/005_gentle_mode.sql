-- Щадящий режим: задания повышенного уровня считаются с коэффициентом 0,5.
-- Включается для группы в конкретной работе; по умолчанию выключен (строки нет).
-- Баллы не меняются: процент и отметка в этом режиме считаются при показе.

CREATE TABLE monitoring.gentle_groups (
 work_id integer NOT NULL,
 group_id integer NOT NULL,
 updated_by integer NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (work_id, group_id),
 FOREIGN KEY (work_id, group_id) REFERENCES monitoring.work_groups(work_id, group_id) ON DELETE CASCADE
);

-- Каждое включение и выключение; автор и его ФИО на момент правки.
CREATE TABLE monitoring.gentle_history (
 id bigserial PRIMARY KEY,
 work_id integer NOT NULL REFERENCES monitoring.works(id) ON DELETE CASCADE,
 group_id integer NOT NULL,
 enabled boolean NOT NULL,
 changed_by integer NOT NULL,
 changed_by_name text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gentle_history_work_idx ON monitoring.gentle_history (work_id, group_id);
