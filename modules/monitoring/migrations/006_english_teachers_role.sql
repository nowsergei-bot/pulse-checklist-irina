-- Роль «учитель» модуля всем действующим учителям из справочника учителей английского,
-- у которых есть учётная запись Пульса. Без этой роли шлюз не пускает в модуль.
-- Список берётся из базы; идентификаторов в файле нет. Другие роли не трогаются,
-- data_admin не назначается и не восстанавливается. Уже назначенные роли остаются.
INSERT INTO monitoring.user_roles (user_id, role)
SELECT DISTINCT t.user_id, 'teacher'
FROM pulse_read.english_teachers t
JOIN pulse_read.users u ON u.id = t.user_id
WHERE t.archived_at IS NULL AND t.user_id IS NOT NULL
ON CONFLICT DO NOTHING;
