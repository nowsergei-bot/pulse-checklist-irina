CREATE TABLE monitoring.user_roles (
 user_id integer NOT NULL, role text NOT NULL CHECK (role IN ('teacher','department_head','deputy','data_admin')),
 PRIMARY KEY(user_id,role)
);
