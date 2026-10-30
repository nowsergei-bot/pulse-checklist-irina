-- Своя спецификация группы в работе (задание Иры 30.10: группа 11 AH писала в «Модуле 1» другую работу).
-- Группа из work_group_specs вносит баллы и считается по своей версии спецификации: задания, максимум, процент, отметка.
-- Остальные группы работы идут по works.spec_version_id. В аналитике параллели группы сравниваются по процентам.
-- Назначает data_admin в форме работы; сменить или снять нельзя, пока у группы есть результаты по работе.

CREATE TABLE monitoring.work_group_specs (
 work_id integer NOT NULL,
 group_id integer NOT NULL,
 spec_version_id integer NOT NULL REFERENCES monitoring.spec_versions(id),
 updated_by integer,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (work_id, group_id),
 FOREIGN KEY (work_id, group_id) REFERENCES monitoring.work_groups(work_id, group_id) ON DELETE CASCADE
);

-- Версия спецификации, по которой вносит группа: своя или версия работы.
CREATE FUNCTION monitoring.group_spec_version(p_work integer, p_group integer) RETURNS integer
LANGUAGE sql STABLE AS $$
 SELECT coalesce(
  (SELECT spec_version_id FROM monitoring.work_group_specs WHERE work_id = p_work AND group_id = p_group),
  (SELECT spec_version_id FROM monitoring.works WHERE id = p_work))
$$;

-- Своя спецификация группы: утверждённая версия того же вида работы.
CREATE FUNCTION monitoring.check_group_spec() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM monitoring.spec_versions v JOIN monitoring.specs s ON s.id = v.spec_id
  JOIN monitoring.works w ON w.type_id = s.type_id
  WHERE v.id = NEW.spec_version_id AND v.status = 'approved' AND w.id = NEW.work_id
 ) THEN
  RAISE EXCEPTION 'Своя спецификация группы: только утверждённая версия того же вида работы.'
   USING ERRCODE = 'check_violation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_group_specs_check BEFORE INSERT OR UPDATE ON monitoring.work_group_specs
 FOR EACH ROW EXECUTE FUNCTION monitoring.check_group_spec();

-- Балл и отметка «отсутствовал»: задание и часть из версии группы, где их вносят
-- (миграции 003 и 011 сверяли только с версией работы). Проверка половины балла из 011 сохраняется.
CREATE OR REPLACE FUNCTION monitoring.check_task_score() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
 task_max integer;
 task_version integer;
BEGIN
 SELECT max_points, version_id INTO task_max, task_version FROM monitoring.spec_tasks WHERE id = NEW.task_id;
 IF task_version IS DISTINCT FROM monitoring.group_spec_version(NEW.work_id, NEW.group_id) THEN
  RAISE EXCEPTION 'Задание не относится к спецификации этой работы.'
   USING ERRCODE = 'check_violation';
 END IF;
 IF NEW.score IS NOT NULL AND NEW.score > task_max THEN
  RAISE EXCEPTION 'Балл % больше максимума задания (%).', NEW.score, task_max
   USING ERRCODE = 'check_violation';
 END IF;
 IF NEW.score IS NOT NULL AND NEW.score <> trunc(NEW.score)
    AND NOT EXISTS (SELECT 1 FROM monitoring.half_point_tasks h WHERE h.task_id = NEW.task_id) THEN
  RAISE EXCEPTION 'В этом задании балл только целый.'
   USING ERRCODE = 'check_violation';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION monitoring.check_part_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM monitoring.spec_parts p
  WHERE p.id = NEW.part_id AND p.version_id = monitoring.group_spec_version(NEW.work_id, NEW.group_id)
 ) THEN
  RAISE EXCEPTION 'Часть не относится к спецификации этой работы.'
   USING ERRCODE = 'check_violation';
 END IF;
 RETURN NEW;
END $$;
