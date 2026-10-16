-- Шкала по Положению о системе оценивания: отметка ставится от процента,
-- округлённого до целого: «5» от 90 %, «4» от 75 %, «3» от 50 %, ниже «2».
-- Пятибалльный эквивалент и шкала 4,60 / 3,70 / 2,80 больше не используются.

ALTER TABLE monitoring.grade_scale_rows
 ADD COLUMN min_percent integer CHECK (min_percent >= 0 AND min_percent <= 100),
 ALTER COLUMN min_equivalent DROP NOT NULL;

UPDATE monitoring.grade_scales SET is_default = false WHERE is_default;

WITH s AS (
 INSERT INTO monitoring.grade_scales (name, is_default) VALUES ('Положение о системе оценивания', true) RETURNING id
)
INSERT INTO monitoring.grade_scale_rows (scale_id, mark, min_percent)
SELECT s.id, r.mark, r.min_percent FROM s, (VALUES ('5', 90), ('4', 75), ('3', 50), ('2', 0)) AS r(mark, min_percent);

-- Новая шкала для всех работ, в том числе уже созданных. Баллы не меняются.
UPDATE monitoring.works
SET scale_id = (SELECT id FROM monitoring.grade_scales WHERE name = 'Положение о системе оценивания');

-- Старая шкала больше ни к чему не привязана.
DELETE FROM monitoring.grade_scales WHERE name = 'Пятибалльная';

ALTER TABLE monitoring.grade_scale_rows DROP COLUMN min_equivalent;
ALTER TABLE monitoring.grade_scale_rows ALTER COLUMN min_percent SET NOT NULL;
