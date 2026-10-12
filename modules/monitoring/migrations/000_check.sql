CREATE TABLE monitoring.healthcheck (id integer PRIMARY KEY, checked_at timestamptz NOT NULL DEFAULT now());
