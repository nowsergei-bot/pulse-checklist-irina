-- Поправки модуля к составам групп. Составы в Пульсе не меняются:
-- модуль берёт состав из pulse_read.group_memberships и применяет поправки отсюда.
-- add: ученик добавлен в группу; remove: убран из группы.
-- Вид fix «Исправить состав»: исправление ошибки Пульса, действует на все работы учебного года, даты нет.
-- Вид transfer «Перевод с даты»: действует для работ, которые проходят с этой даты.
-- Отменённая поправка не действует.

CREATE TABLE monitoring.roster_overrides (
 id serial PRIMARY KEY,
 group_id integer NOT NULL,
 student_id integer NOT NULL,
 action text NOT NULL CHECK (action IN ('add', 'remove')),
 kind text NOT NULL CHECK (kind IN ('fix', 'transfer')),
 from_date date,
 created_by integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 cancelled_by integer,
 cancelled_at timestamptz,
 CHECK ((cancelled_by IS NULL) = (cancelled_at IS NULL)),
 CHECK ((kind = 'transfer') = (from_date IS NOT NULL))
);
-- У ученика в группе не больше одной действующей поправки.
CREATE UNIQUE INDEX roster_overrides_active_idx ON monitoring.roster_overrides (group_id, student_id) WHERE cancelled_at IS NULL;

-- Каждая поправка и отмена; автор и его ФИО на момент правки. Видна только data_admin.
CREATE TABLE monitoring.roster_history (
 id bigserial PRIMARY KEY,
 override_id integer NOT NULL REFERENCES monitoring.roster_overrides(id),
 group_id integer NOT NULL,
 student_id integer NOT NULL,
 action text NOT NULL CHECK (action IN ('add', 'remove', 'cancel')),
 kind text NOT NULL CHECK (kind IN ('fix', 'transfer')),
 from_date date,
 changed_by integer NOT NULL,
 changed_by_name text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX roster_history_group_idx ON monitoring.roster_history (group_id);
