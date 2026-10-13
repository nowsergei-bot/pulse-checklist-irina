// Группы и ученики из pulse_read. Почты из представлений не читаются.

async function currentYear(db) {
  const r = await db.query('SELECT id, label FROM pulse_read.academic_years WHERE is_current ORDER BY starts_on DESC NULLS LAST LIMIT 1');
  return r.rows[0] || null;
}

// group_teachers.teacher_id -> english_teachers.id -> english_teachers.user_id = users.id.
async function teacherGroupIds(db, userId) {
  const r = await db.query(
    `SELECT DISTINCT g.id
     FROM pulse_read.english_teachers t
     JOIN pulse_read.group_teachers gt ON gt.teacher_id = t.id
     JOIN pulse_read.groups g ON g.id = gt.group_id
     JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE t.user_id = $1 AND t.archived_at IS NULL AND g.archived_at IS NULL AND y.is_current`,
    [userId],
  );
  return r.rows.map(row => Number(row.id));
}

async function parallelGroups(db, academicYearId, parallel) {
  const r = await db.query(
    `SELECT id, title, code, campus, parallel
     FROM pulse_read.groups
     WHERE academic_year_id = $1 AND parallel = $2 AND archived_at IS NULL
     ORDER BY campus, code, title`,
    [academicYearId, parallel],
  );
  return r.rows;
}

// Текущий состав группы: основной источник group_memberships.
async function groupStudents(db, groupId) {
  const r = await db.query(
    `SELECT DISTINCT s.id, s.full_name
     FROM pulse_read.group_memberships m
     JOIN pulse_read.students s ON s.id = m.student_id
     WHERE m.group_id = $1
     ORDER BY s.full_name`,
    [groupId],
  );
  return r.rows;
}

module.exports = { currentYear, teacherGroupIds, parallelGroups, groupStudents };
