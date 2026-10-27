-- Пробный ЕГЭ (письменная часть): вид работы без отметки.
-- Считаются только первичный балл (из 62) и процент выполнения; шкалы отметок у таких работ нет.
-- Структура по спецификации ЕГЭ 2026 (ФИПИ), устная часть не входит: 11 блоков ввода, 62 первичных балла.
-- Уровень «Высокий» хранится отдельным кодом high, как в ФИПИ; в аналитике сопоставляется с «Повышенным».

-- Признак вида работы: ставится ли отметка. У модулей и входного по-прежнему ставится.
ALTER TABLE monitoring.assessment_types ADD COLUMN graded boolean NOT NULL DEFAULT true;
INSERT INTO monitoring.assessment_types (code, name, sort, graded) VALUES ('ege_mock', 'Пробный ЕГЭ (письменная часть)', 3, false);

-- Работа вида без отметки хранится без шкалы, работа с отметкой со шкалой.
ALTER TABLE monitoring.works ALTER COLUMN scale_id DROP NOT NULL;
CREATE FUNCTION monitoring.check_work_scale() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
 type_graded boolean;
BEGIN
 SELECT graded INTO type_graded FROM monitoring.assessment_types WHERE id = NEW.type_id;
 IF type_graded AND NEW.scale_id IS NULL THEN
  RAISE EXCEPTION 'Выберите шкалу отметок.' USING ERRCODE = 'check_violation';
 END IF;
 IF NOT type_graded AND NEW.scale_id IS NOT NULL THEN
  RAISE EXCEPTION 'У этого вида работы нет отметки, шкала не нужна.' USING ERRCODE = 'check_violation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER works_scale_check BEFORE INSERT OR UPDATE OF type_id, scale_id ON monitoring.works
 FOR EACH ROW EXECUTE FUNCTION monitoring.check_work_scale();

INSERT INTO monitoring.levels (code, name, sort) VALUES ('high', 'Высокий', 3);

-- Схема «ЕГЭ, письменная часть, 62»: сумма по разделам и уровням.
-- Аудирование 12, чтение 12, грамматика и лексика 18, письменная речь 20; базовый 27, высокий 35.
WITH f AS (
 INSERT INTO monitoring.frames (type_id, name)
 SELECT id, 'ЕГЭ, письменная часть, 62' FROM monitoring.assessment_types WHERE code = 'ege_mock'
 RETURNING id
)
INSERT INTO monitoring.frame_rows (frame_id, section, level, points)
SELECT f.id, r.section, r.level, r.points FROM f, (VALUES
 ('Listening', 'basic', 5), ('Listening', 'high', 7),
 ('Reading', 'basic', 5), ('Reading', 'high', 7),
 ('Grammar', 'basic', 6),
 ('Vocabulary', 'basic', 5), ('Vocabulary', 'high', 7),
 ('Writing', 'basic', 6), ('Writing', 'high', 14)
) AS r(section, level, points);

-- Спецификация с одной частью «Письменная часть» и 11 блоками. Сначала черновик, затем утверждение:
-- части и задания утверждённой версии добавлять нельзя.
INSERT INTO monitoring.specs (type_id, title)
SELECT id, 'ЕГЭ, письменная часть' FROM monitoring.assessment_types WHERE code = 'ege_mock';

INSERT INTO monitoring.spec_versions (spec_id, version, status, frame_id, max_points, class_hint)
SELECT s.id, 1, 'draft', f.id, 62, NULL
FROM monitoring.specs s
JOIN monitoring.assessment_types t ON t.id = s.type_id AND t.code = 'ege_mock'
JOIN monitoring.frames f ON f.type_id = t.id AND f.name = 'ЕГЭ, письменная часть, 62'
WHERE s.title = 'ЕГЭ, письменная часть';

INSERT INTO monitoring.spec_parts (version_id, code, name, sort)
SELECT v.id, 'test', 'Письменная часть', 1
FROM monitoring.spec_versions v JOIN monitoring.specs s ON s.id = v.spec_id
WHERE s.title = 'ЕГЭ, письменная часть' AND v.version = 1;

INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points, focus)
SELECT v.id, p.id, r.sort, r.section, r.level, r.title, r.points, r.focus
FROM monitoring.spec_versions v
JOIN monitoring.specs s ON s.id = v.spec_id
JOIN monitoring.spec_parts p ON p.version_id = v.id AND p.code = 'test'
CROSS JOIN (VALUES
 (1, 'Listening', 'basic', 'Задание 1', 2, NULL),
 (2, 'Listening', 'basic', 'Задание 2', 3, NULL),
 (3, 'Listening', 'high', 'Задания 3-9', 7, NULL),
 (4, 'Reading', 'basic', 'Задание 10', 3, NULL),
 (5, 'Reading', 'basic', 'Задание 11', 2, NULL),
 (6, 'Reading', 'high', 'Задания 12-18', 7, NULL),
 (7, 'Grammar', 'basic', 'Задания 19-24', 6, 'грамматика'),
 (8, 'Vocabulary', 'basic', 'Задания 25-29', 5, 'словообразование'),
 (9, 'Vocabulary', 'high', 'Задания 30-36', 7, 'лексика'),
 (10, 'Writing', 'basic', 'Задание 37', 6, 'электронное письмо'),
 (11, 'Writing', 'high', 'Задание 38', 14, 'высказывание по таблице или диаграмме')
) AS r(sort, section, level, title, points, focus)
WHERE s.title = 'ЕГЭ, письменная часть' AND v.version = 1;

UPDATE monitoring.spec_versions v SET status = 'approved', approved_at = now()
FROM monitoring.specs s
WHERE s.id = v.spec_id AND s.title = 'ЕГЭ, письменная часть' AND v.version = 1 AND v.status = 'draft';
