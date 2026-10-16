-- Составы групп из файла: загрузка data_admin поверх Пульса.
-- Для групп из действующей загрузки состав берётся отсюда, для остальных групп из Пульса.
-- Поправки monitoring.roster_overrides применяются поверх. Сам файл и строки, которые
-- не удалось сопоставить, не хранятся: только итоговые пары группа и ученик.

CREATE TABLE monitoring.roster_imports (
 id serial PRIMARY KEY,
 active boolean NOT NULL DEFAULT true,
 groups_count integer NOT NULL,
 students_count integer NOT NULL,
 created_by integer NOT NULL,
 created_by_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 -- Кто вернул составы из Пульса; при замене новой загрузкой не заполняется.
 cancelled_by integer,
 cancelled_by_name text,
 cancelled_at timestamptz
);
-- Действует не больше одной загрузки.
CREATE UNIQUE INDEX roster_imports_active_idx ON monitoring.roster_imports ((true)) WHERE active;

CREATE TABLE monitoring.roster_import_groups (
 import_id integer NOT NULL REFERENCES monitoring.roster_imports(id),
 group_id integer NOT NULL,
 PRIMARY KEY (import_id, group_id)
);

CREATE TABLE monitoring.roster_import_members (
 import_id integer NOT NULL,
 group_id integer NOT NULL,
 student_id integer NOT NULL,
 PRIMARY KEY (import_id, group_id, student_id),
 FOREIGN KEY (import_id, group_id) REFERENCES monitoring.roster_import_groups(import_id, group_id)
);
CREATE INDEX roster_import_members_group_idx ON monitoring.roster_import_members (group_id, import_id);
