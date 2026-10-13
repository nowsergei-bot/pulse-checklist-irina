CREATE TABLE monitoring.assessment_types (
 id serial PRIMARY KEY,
 code text NOT NULL UNIQUE,
 name text NOT NULL,
 sort integer NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT true
);
INSERT INTO monitoring.assessment_types (code, name, sort) VALUES
 ('module', 'Модульный тест', 1),
 ('placement', 'Входное тестирование', 2);

CREATE TABLE monitoring.sections (
 code text PRIMARY KEY,
 name text NOT NULL,
 sort integer NOT NULL DEFAULT 0
);
INSERT INTO monitoring.sections (code, name, sort) VALUES
 ('Listening', 'Listening', 1), ('Reading', 'Reading', 2), ('Grammar', 'Grammar', 3),
 ('Vocabulary', 'Vocabulary', 4), ('Writing', 'Writing', 5), ('Speaking', 'Speaking', 6);

CREATE TABLE monitoring.levels (
 code text PRIMARY KEY,
 name text NOT NULL,
 sort integer NOT NULL DEFAULT 0
);
INSERT INTO monitoring.levels (code, name, sort) VALUES ('basic', 'Базовый', 1), ('advanced', 'Повышенный', 2);

-- Схемы баллов: у вида работы может быть несколько схем.
CREATE TABLE monitoring.frames (
 id serial PRIMARY KEY,
 type_id integer NOT NULL REFERENCES monitoring.assessment_types(id),
 name text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_by integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (type_id, name)
);
CREATE TABLE monitoring.frame_rows (
 frame_id integer NOT NULL REFERENCES monitoring.frames(id) ON DELETE CASCADE,
 section text NOT NULL REFERENCES monitoring.sections(code),
 level text NOT NULL REFERENCES monitoring.levels(code),
 points integer NOT NULL CHECK (points > 0),
 PRIMARY KEY (frame_id, section, level)
);
WITH f AS (
 INSERT INTO monitoring.frames (type_id, name)
 SELECT id, 'Модуль без письма' FROM monitoring.assessment_types WHERE code = 'module'
 RETURNING id
)
INSERT INTO monitoring.frame_rows (frame_id, section, level, points)
SELECT f.id, r.section, r.level, r.points FROM f, (VALUES
 ('Listening', 'basic', 5), ('Listening', 'advanced', 5),
 ('Reading', 'basic', 5), ('Reading', 'advanced', 5),
 ('Grammar', 'basic', 5), ('Grammar', 'advanced', 10),
 ('Vocabulary', 'basic', 5), ('Vocabulary', 'advanced', 10)
) AS r(section, level, points);

CREATE TABLE monitoring.specs (
 id serial PRIMARY KEY,
 type_id integer NOT NULL REFERENCES monitoring.assessment_types(id),
 title text NOT NULL,
 created_by integer,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Утверждённая версия не меняется: правка создаёт новую версию.
CREATE TABLE monitoring.spec_versions (
 id serial PRIMARY KEY,
 spec_id integer NOT NULL REFERENCES monitoring.specs(id),
 version integer NOT NULL CHECK (version > 0),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
 frame_id integer NOT NULL REFERENCES monitoring.frames(id),
 max_points integer NOT NULL CHECK (max_points > 0),
 class_hint text,
 source_file_id uuid REFERENCES monitoring.files(id),
 created_by integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 approved_by integer,
 approved_at timestamptz,
 UNIQUE (spec_id, version)
);
CREATE TABLE monitoring.spec_parts (
 id serial PRIMARY KEY,
 version_id integer NOT NULL REFERENCES monitoring.spec_versions(id) ON DELETE CASCADE,
 code text NOT NULL,
 name text NOT NULL,
 sort integer NOT NULL,
 UNIQUE (version_id, code)
);
CREATE TABLE monitoring.spec_tasks (
 id serial PRIMARY KEY,
 version_id integer NOT NULL REFERENCES monitoring.spec_versions(id) ON DELETE CASCADE,
 part_id integer NOT NULL REFERENCES monitoring.spec_parts(id) ON DELETE CASCADE,
 sort integer NOT NULL,
 section text NOT NULL REFERENCES monitoring.sections(code),
 level text NOT NULL REFERENCES monitoring.levels(code),
 title text NOT NULL,
 max_points integer NOT NULL CHECK (max_points > 0),
 focus text,
 skill_code text,
 UNIQUE (version_id, sort)
);

CREATE TABLE monitoring.grade_scales (
 id serial PRIMARY KEY,
 name text NOT NULL UNIQUE,
 is_default boolean NOT NULL DEFAULT false
);
-- Отметка ставится, если пятибалльный эквивалент не ниже порога.
CREATE TABLE monitoring.grade_scale_rows (
 scale_id integer NOT NULL REFERENCES monitoring.grade_scales(id) ON DELETE CASCADE,
 mark text NOT NULL,
 min_equivalent numeric(4,2) NOT NULL CHECK (min_equivalent >= 0 AND min_equivalent <= 5),
 PRIMARY KEY (scale_id, mark)
);
WITH s AS (
 INSERT INTO monitoring.grade_scales (name, is_default) VALUES ('Пятибалльная', true) RETURNING id
)
INSERT INTO monitoring.grade_scale_rows (scale_id, mark, min_equivalent)
SELECT s.id, r.mark, r.min_equivalent FROM s, (VALUES ('5', 4.60), ('4', 3.70), ('3', 2.80), ('2', 0)) AS r(mark, min_equivalent);

-- academic_year_id, group_id, student_id: идентификаторы из pulse_read.
CREATE TABLE monitoring.works (
 id serial PRIMARY KEY,
 type_id integer NOT NULL REFERENCES monitoring.assessment_types(id),
 title text NOT NULL,
 academic_year_id integer NOT NULL,
 parallel integer NOT NULL,
 spec_version_id integer NOT NULL REFERENCES monitoring.spec_versions(id),
 scale_id integer NOT NULL REFERENCES monitoring.grade_scales(id),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
 is_test boolean NOT NULL DEFAULT false,
 created_by integer,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE monitoring.work_parts (
 work_id integer NOT NULL REFERENCES monitoring.works(id) ON DELETE CASCADE,
 part_id integer NOT NULL REFERENCES monitoring.spec_parts(id),
 held_on date,
 PRIMARY KEY (work_id, part_id)
);
CREATE TABLE monitoring.work_groups (
 work_id integer NOT NULL REFERENCES monitoring.works(id) ON DELETE CASCADE,
 group_id integer NOT NULL,
 PRIMARY KEY (work_id, group_id)
);
-- Группа хранится в результате: после перехода ученика результат остаётся за прежней группой.
CREATE TABLE monitoring.part_status (
 work_id integer NOT NULL REFERENCES monitoring.works(id) ON DELETE CASCADE,
 part_id integer NOT NULL REFERENCES monitoring.spec_parts(id),
 student_id integer NOT NULL,
 group_id integer NOT NULL,
 status text NOT NULL CHECK (status IN ('present','absent')),
 updated_by integer NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (work_id, part_id, student_id)
);
CREATE TABLE monitoring.task_scores (
 work_id integer NOT NULL REFERENCES monitoring.works(id) ON DELETE CASCADE,
 task_id integer NOT NULL REFERENCES monitoring.spec_tasks(id),
 student_id integer NOT NULL,
 group_id integer NOT NULL,
 score integer CHECK (score >= 0),
 updated_by integer NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (work_id, task_id, student_id)
);
CREATE INDEX task_scores_group_idx ON monitoring.task_scores (work_id, group_id);
CREATE TABLE monitoring.score_history (
 id bigserial PRIMARY KEY,
 work_id integer NOT NULL REFERENCES monitoring.works(id) ON DELETE CASCADE,
 student_id integer NOT NULL,
 group_id integer NOT NULL,
 task_id integer REFERENCES monitoring.spec_tasks(id),
 part_id integer REFERENCES monitoring.spec_parts(id),
 old_value text,
 new_value text,
 changed_by integer NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((task_id IS NULL) <> (part_id IS NULL))
);
CREATE INDEX score_history_work_idx ON monitoring.score_history (work_id, student_id);

-- Утверждённая версия спецификации, её части и задания не меняются и не удаляются.
CREATE FUNCTION monitoring.guard_approved_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status = 'approved' THEN
  RAISE EXCEPTION 'Утверждённую версию спецификации нельзя изменить или удалить. Создайте новую версию.'
   USING ERRCODE = 'check_violation';
 END IF;
 RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER spec_versions_guard BEFORE UPDATE OR DELETE ON monitoring.spec_versions
 FOR EACH ROW EXECUTE FUNCTION monitoring.guard_approved_version();

CREATE FUNCTION monitoring.guard_approved_content() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM monitoring.spec_versions v
  WHERE v.status = 'approved'
   AND v.id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.version_id END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.version_id END)
 ) THEN
  RAISE EXCEPTION 'Части и задания утверждённой версии спецификации нельзя изменить или удалить. Создайте новую версию.'
   USING ERRCODE = 'check_violation';
 END IF;
 RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER spec_parts_guard BEFORE INSERT OR UPDATE OR DELETE ON monitoring.spec_parts
 FOR EACH ROW EXECUTE FUNCTION monitoring.guard_approved_content();
CREATE TRIGGER spec_tasks_guard BEFORE INSERT OR UPDATE OR DELETE ON monitoring.spec_tasks
 FOR EACH ROW EXECUTE FUNCTION monitoring.guard_approved_content();

-- Балл не больше максимума задания, задание из версии спецификации этой работы.
CREATE FUNCTION monitoring.check_task_score() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
 task_max integer;
 task_version integer;
 work_version integer;
BEGIN
 SELECT max_points, version_id INTO task_max, task_version FROM monitoring.spec_tasks WHERE id = NEW.task_id;
 SELECT spec_version_id INTO work_version FROM monitoring.works WHERE id = NEW.work_id;
 IF task_version IS DISTINCT FROM work_version THEN
  RAISE EXCEPTION 'Задание не относится к спецификации этой работы.'
   USING ERRCODE = 'check_violation';
 END IF;
 IF NEW.score IS NOT NULL AND NEW.score > task_max THEN
  RAISE EXCEPTION 'Балл % больше максимума задания (%).', NEW.score, task_max
   USING ERRCODE = 'check_violation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_scores_check BEFORE INSERT OR UPDATE ON monitoring.task_scores
 FOR EACH ROW EXECUTE FUNCTION monitoring.check_task_score();

-- Работа ссылается только на утверждённую версию спецификации.
CREATE FUNCTION monitoring.check_work_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM monitoring.spec_versions WHERE id = NEW.spec_version_id AND status = 'approved') THEN
  RAISE EXCEPTION 'Работу можно создать только по утверждённой спецификации.'
   USING ERRCODE = 'check_violation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER works_version_check BEFORE INSERT OR UPDATE OF spec_version_id ON monitoring.works
 FOR EACH ROW EXECUTE FUNCTION monitoring.check_work_version();

-- Отметка о присутствии только для части из версии спецификации этой работы.
CREATE FUNCTION monitoring.check_part_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM monitoring.spec_parts p JOIN monitoring.works w ON w.spec_version_id = p.version_id
  WHERE p.id = NEW.part_id AND w.id = NEW.work_id
 ) THEN
  RAISE EXCEPTION 'Часть не относится к спецификации этой работы.'
   USING ERRCODE = 'check_violation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER part_status_check BEFORE INSERT OR UPDATE ON monitoring.part_status
 FOR EACH ROW EXECUTE FUNCTION monitoring.check_part_status();
