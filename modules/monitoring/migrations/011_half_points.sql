-- Половина балла (0,5) в отдельных заданиях, например Grammar повышенного уровня в 9 классе (Модуль 1).
-- Какие задания разрешают 0,5, отмечает data_admin на странице спецификации; отметка хранится отдельно
-- от содержания спецификации, поэтому её можно поставить и в утверждённой версии.
-- Балл хранится числом с плавающей точкой (0,5 представляется точно), шаг 0,5; в задании без отметки только целые
-- (проверка в базе). Целые баллы читаются как прежде.

CREATE TABLE monitoring.half_point_tasks (
 task_id integer PRIMARY KEY REFERENCES monitoring.spec_tasks(id) ON DELETE CASCADE,
 updated_by integer NOT NULL,
 updated_by_name text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE monitoring.task_scores ALTER COLUMN score TYPE double precision;
ALTER TABLE monitoring.task_scores ADD CONSTRAINT task_scores_half_step CHECK (score IS NULL OR score * 2 = trunc(score * 2));

CREATE OR REPLACE FUNCTION monitoring.check_task_score() RETURNS trigger
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
 IF NEW.score IS NOT NULL AND NEW.score <> trunc(NEW.score)
    AND NOT EXISTS (SELECT 1 FROM monitoring.half_point_tasks h WHERE h.task_id = NEW.task_id) THEN
  RAISE EXCEPTION 'В этом задании балл только целый.'
   USING ERRCODE = 'check_violation';
 END IF;
 RETURN NEW;
END $$;
