-- Пороги группы риска (дашборд заместителей директора и «Динамика») в настройках модуля рядом с порогом 5 пунктов.
-- drop_to_start: снижение к входному на столько пунктов и больше (было постоянной 10 в коде «Динамики»).
-- group_avg_below: группа в риске, если средний процент ниже этого.
-- group_twos_from: группа в риске, если доля «2» от этого процента учеников с отметкой.
-- Меняет data_admin на вкладке «Динамика».

ALTER TABLE monitoring.progress_settings
 ADD COLUMN drop_to_start integer NOT NULL DEFAULT 10 CHECK (drop_to_start BETWEEN 1 AND 50),
 ADD COLUMN group_avg_below integer NOT NULL DEFAULT 70 CHECK (group_avg_below BETWEEN 1 AND 100),
 ADD COLUMN group_twos_from integer NOT NULL DEFAULT 25 CHECK (group_twos_from BETWEEN 1 AND 100);
