CREATE TABLE monitoring.files (
 id uuid PRIMARY KEY,
 owner_user_id integer NOT NULL,
 filename text NOT NULL,
 media_type text NOT NULL,
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 0 AND 3145728),
 created_at timestamptz NOT NULL DEFAULT now()
);
