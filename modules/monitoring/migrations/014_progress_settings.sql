-- Настройки динамики (вкладка «Динамика»): порог изменения в процентных пунктах.
-- Рост: разница с входным не меньше порога; снижение: не больше минус порога; иначе без изменений.
-- Одна строка, меняет data_admin.

CREATE TABLE monitoring.progress_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 threshold integer NOT NULL DEFAULT 5 CHECK (threshold BETWEEN 1 AND 30),
 updated_by integer,
 updated_by_name text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO monitoring.progress_settings (id, threshold) VALUES (true, 5);
