-- Сопоставление полей входного тестирования (старый раздел, pulse_read.placement_*) с общими разделами сравнения:
-- listening «Аудирование», reading «Чтение», use «Грамматика и лексика», writing «Письменная речь»,
-- none «не сравнивается» (поле показывается отдельно и в итог сравнения не входит).
-- Меняет data_admin на вкладке «Аналитика». Пока строки нет, действует предложение по названию раздела поля.
-- spec_id и field_id: коды из pulse_read.placement_sessions и placement_field_scores.

CREATE TABLE monitoring.placement_field_map (
 spec_id text NOT NULL,
 field_id text NOT NULL,
 section text NOT NULL CHECK (section IN ('listening', 'reading', 'use', 'writing', 'none')),
 updated_by integer NOT NULL,
 updated_by_name text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (spec_id, field_id)
);
