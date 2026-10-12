const { json, parseBody, parseQuery } = require('./lib/http');
const { pickAllowedFields } = require('./lib/validation');
const { requireUser } = require('./lib/session-auth');
const { previewStudentImport, canCommitPreview } = require('./lib/english-assessment-import');
const { importRoster } = require('./lib/english-assessment-roster');
const {
  actorFromAuth,
  writeAudit,
  teacherGroupIds,
  resolveEnglishAccess,
  englishMembershipStudentSql,
} = require('./lib/english-assessment-access');
const {
  isEnglishHiddenDepartmentTeacher,
  omitEnglishHiddenDepartmentTeachers,
  publicEnglishTeacher,
  publicEnglishTeacherList,
} = require('./lib/english-assessment-leaders');
const { listEnglishActivityEvents } = require('./lib/english-assessment-activity');
const { EA_SECTIONS, EA_WORK_TYPES } = require('./lib/english-assessment-sections');
const { placementCatalogLive } = require('./lib/english-assessment-spec-upload');
const {
  handleSections,
  handleGroupCard,
  handleGetScores,
  handlePutScores,
  handlePatchScoresDate,
  handleAddGroupStudent,
  handleRemoveGroupStudent,
  handleTeacherDashboard,
  handleLeaderDashboard,
  handleStudentHistory,
} = require('./lib/english-assessment-score-api');
const {
  handleSpecsList,
  handleSpecCard,
  handleUploadSpecs,
  handleSaveSpec,
  handleCreateSpec,
  handleDeleteSpec,
  handleApproveSpec,
  handleGetPlacement,
  handlePutPlacement,
  handlePatchPlacementDate,
  handlePlacementExcel,
} = require('./lib/english-assessment-placement-api');
const { attachLatestResults, attachTeachersToGroups } = require('./lib/english-assessment-group-meta');
const { ratingViewResponse, ratingExportResponse, loadTeacherRating } = require('./lib/english-assessment-rating');
const {
  analyticsScopePublic,
  saveAnalyticsScope,
  seesDepartmentAnalytics,
} = require('./lib/english-assessment-analytics-scope');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function denied(caps) {
  if (!caps.access) return json(403, { error: 'forbidden', message: 'Нет доступа к модулю английского языка' });
  return null;
}

async function currentYear(pool) {
  const r = await pool.query(
    `SELECT id, label, starts_on, ends_on, is_current
     FROM ea_academic_years
     ORDER BY is_current DESC, starts_on DESC
     LIMIT 1`,
  );
  return r.rows[0] || null;
}

async function listYears(pool) {
  return (
    await pool.query(
      `SELECT id, label, is_current FROM ea_academic_years ORDER BY is_current DESC, starts_on DESC`,
    )
  ).rows;
}

async function resolveYear(pool, query) {
  const id = Number(query?.year_id);
  if (Number.isFinite(id) && id > 0) {
    const r = await pool.query(
      `SELECT id, label, starts_on, ends_on, is_current FROM ea_academic_years WHERE id = $1`,
      [id],
    );
    if (r.rows[0]) return r.rows[0];
  }
  return currentYear(pool);
}

async function ensureClass(pool, yearId, item) {
  const existing = await pool.query(
    `SELECT id FROM ea_classes
     WHERE academic_year_id = $1 AND code_normalized = $2 AND archived_at IS NULL
     LIMIT 1`,
    [yearId, item.class_normalized],
  );
  if (existing.rows[0]) return Number(existing.rows[0].id);

  let gradeId = null;
  if (item.parallel) {
    const g = await pool.query(`SELECT id FROM ea_grades WHERE parallel = $1`, [item.parallel]);
    gradeId = g.rows[0] ? Number(g.rows[0].id) : null;
  }

  const ins = await pool.query(
    `INSERT INTO ea_classes (academic_year_id, grade_id, code_display, code_normalized)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (academic_year_id, code_normalized) DO UPDATE
       SET code_display = EXCLUDED.code_display
     RETURNING id`,
    [yearId, gradeId, item.class_display, item.class_normalized],
  );
  return Number(ins.rows[0].id);
}

async function findStudent(pool, item, classId) {
  if (item.birth_date) {
    const byBirth = await pool.query(
      `SELECT id FROM ea_students
       WHERE archived_at IS NULL AND normalized_full_name = $1 AND birth_date = $2
       LIMIT 1`,
      [item.normalized_full_name, item.birth_date],
    );
    if (byBirth.rows[0]) return Number(byBirth.rows[0].id);
  }
  const byClass = await pool.query(
    `SELECT id FROM ea_students
     WHERE archived_at IS NULL AND normalized_full_name = $1 AND class_id = $2
     LIMIT 2`,
    [item.normalized_full_name, classId],
  );
  if (byClass.rows.length === 1) return Number(byClass.rows[0].id);
  return null;
}

async function handleMeta(pool, caps) {
  const year = await currentYear(pool);
  const terms = year
    ? (
        await pool.query(
          `SELECT id, kind, seq, label FROM ea_terms WHERE academic_year_id = $1 ORDER BY kind, seq`,
          [year.id],
        )
      ).rows
    : [];
  const years = await listYears(pool);
  return json(200, {
    year,
    years,
    terms,
    capabilities: caps,
    sections: EA_SECTIONS,
    work_types: EA_WORK_TYPES,
    placement: await placementCatalogLive(pool),
  });
}

async function scopedGroupIds(pool, auth, caps) {
  if (caps.viewAll || caps.scoreAll) return null;
  return teacherGroupIds(pool, auth);
}

async function handleDirectory(pool, auth, caps) {
  const year = await currentYear(pool);
  if (!year) return json(200, { year: null, classes: [], students: [], groups: [], teachers: [] });

  const groupIds = await scopedGroupIds(pool, auth, caps);
  if (groupIds && !groupIds.length) {
    return json(200, { year, classes: [], students: [], groups: [], teachers: [] });
  }

  const params = [year.id];
  let groupScope = '';
  let classScope = '';
  let studentScope = ` AND (
    c.academic_year_id = $1
    OR EXISTS (
      SELECT 1 FROM ea_group_memberships m
      JOIN ea_english_groups gg ON gg.id = m.group_id
      WHERE m.student_id = s.id AND gg.academic_year_id = $1 AND gg.archived_at IS NULL
    )
  )`;
  if (groupIds) {
    params.push(groupIds);
    groupScope = ' AND g.id = ANY($2::int[])';
    classScope = ` AND c.id IN (
      SELECT class_id FROM ea_english_groups WHERE id = ANY($2::int[]) AND class_id IS NOT NULL
    )`;
    studentScope = `${englishMembershipStudentSql('$2::int[]')} AND ($1::int IS NOT NULL)`;
  }

  const teacherScope = groupIds
    ? ' AND t.id IN (SELECT teacher_id FROM ea_group_teachers WHERE group_id = ANY($2::int[]))'
    : '';

  const [classes, students, groups, teachers] = await Promise.all([
    pool
      .query(
        `SELECT c.id, c.code_display, c.code_normalized, gr.parallel,
              COUNT(s.id)::int AS student_count
       FROM ea_classes c
       LEFT JOIN ea_grades gr ON gr.id = c.grade_id
       LEFT JOIN ea_students s ON s.class_id = c.id AND s.archived_at IS NULL
       WHERE c.academic_year_id = $1 AND c.archived_at IS NULL ${classScope}
       GROUP BY c.id, c.code_display, c.code_normalized, gr.parallel
       ORDER BY gr.parallel NULLS LAST, c.code_normalized`,
        params,
      )
      .then((r) => r.rows),
    pool
      .query(
        `SELECT s.id, s.public_id, s.full_name, s.birth_date, s.sex, s.campus,
              c.code_display AS class_label
       FROM ea_students s
       LEFT JOIN ea_classes c ON c.id = s.class_id
       WHERE s.archived_at IS NULL ${studentScope}
       ORDER BY c.code_normalized NULLS LAST, s.normalized_full_name
       LIMIT 5000`,
        params,
      )
      .then((r) => r.rows),
    pool
      .query(
        `SELECT g.id, g.title, g.code, g.parallel, g.campus, g.class_id,
              c.code_display AS class_label,
              COUNT(DISTINCT m.student_id)::int AS student_count,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                  'id', t.id,
                  'full_name', t.full_name,
                  'initials', t.initials,
                  'native_name', t.native_name,
                  'email', t.email
                )) FILTER (WHERE t.id IS NOT NULL),
                '[]'::json
              ) AS teachers
       FROM ea_english_groups g
       LEFT JOIN ea_classes c ON c.id = g.class_id AND c.archived_at IS NULL
       LEFT JOIN ea_group_memberships m ON m.group_id = g.id
       LEFT JOIN ea_group_teachers gt ON gt.group_id = g.id
       LEFT JOIN ea_teachers t ON t.id = gt.teacher_id AND t.archived_at IS NULL
       WHERE g.academic_year_id = $1 AND g.archived_at IS NULL ${groupScope}
       GROUP BY g.id, g.title, g.code, g.parallel, g.campus, g.class_id, c.code_display
       ORDER BY g.campus, g.parallel NULLS LAST, g.code, g.title`,
        params,
      )
      .then((r) => r.rows),
    pool
      .query(
        `SELECT t.id, t.full_name, t.initials, t.native_name, t.email,
              COUNT(DISTINCT gt.group_id)::int AS group_count,
              COUNT(DISTINCT m.student_id)::int AS student_count
       FROM ea_teachers t
       LEFT JOIN ea_group_teachers gt ON gt.teacher_id = t.id
       LEFT JOIN ea_english_groups g ON g.id = gt.group_id AND g.academic_year_id = $1 AND g.archived_at IS NULL
       LEFT JOIN ea_group_memberships m ON m.group_id = g.id
       WHERE t.archived_at IS NULL ${teacherScope}
       GROUP BY t.id, t.full_name, t.initials, t.native_name, t.email
       HAVING COUNT(DISTINCT gt.group_id) > 0
       ORDER BY t.full_name`,
        params,
      )
      .then((r) => r.rows),
  ]);

  return json(200, {
    year,
    classes,
    students,
    groups: groups.map((g) => ({ ...g, teachers: publicEnglishTeacherList(g.teachers) })),
    teachers: omitEnglishHiddenDepartmentTeachers(teachers).map((t) => ({
      ...publicEnglishTeacher(t),
      group_count: t.group_count,
      student_count: t.student_count,
    })),
  });
}

async function handleStudentCard(pool, auth, caps, rawId) {
  try {
  const year = await currentYear(pool);
  if (!year) return json(404, { error: 'not_found', message: 'Нет учебного года' });
  const groupIds = await scopedGroupIds(pool, auth, caps);
  if (groupIds && !groupIds.length) return json(404, { error: 'not_found' });

  const byUuid = UUID_RE.test(String(rawId || ''));
  const params = [byUuid ? String(rawId) : Number(rawId)];
  let scope = '';
  if (groupIds) {
    params.push(groupIds);
    scope = englishMembershipStudentSql('$2::int[]');
  }

  const found = await pool.query(
    `SELECT s.id, s.public_id, s.full_name, s.birth_date, s.sex, s.campus,
            c.id AS class_id, c.code_display, gr.parallel
     FROM ea_students s
     LEFT JOIN ea_classes c ON c.id = s.class_id
     LEFT JOIN ea_grades gr ON gr.id = c.grade_id
     WHERE s.archived_at IS NULL AND ${byUuid ? 's.public_id = $1' : 's.id = $1'} ${scope}
     LIMIT 1`,
    params,
  );
  const student = found.rows[0];
  if (!student) return json(404, { error: 'not_found', message: 'Учащийся не найден' });

  const groups = (
    await pool.query(
      `SELECT g.id, g.title, g.code, g.parallel, g.campus,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                  'id', t.id,
                  'full_name', t.full_name,
                  'initials', t.initials,
                  'native_name', t.native_name,
                  'email', t.email
                )) FILTER (WHERE t.id IS NOT NULL),
                '[]'::json
              ) AS teachers
       FROM ea_group_memberships m
       JOIN ea_english_groups g ON g.id = m.group_id
       LEFT JOIN ea_group_teachers gt ON gt.group_id = g.id
       LEFT JOIN ea_teachers t ON t.id = gt.teacher_id AND t.archived_at IS NULL
       WHERE m.student_id = $1 AND g.academic_year_id = $2 AND g.archived_at IS NULL
       GROUP BY g.id, g.title, g.code, g.parallel, g.campus
       ORDER BY g.campus, g.parallel, g.code`,
      [student.id, year.id],
    )
  ).rows;

  return json(200, {
    student: {
      id: student.id,
      public_id: student.public_id,
      full_name: student.full_name,
      birth_date: student.birth_date,
      sex: student.sex,
      campus: student.campus,
      class: student.class_id
        ? { id: student.class_id, code_display: student.code_display, parallel: student.parallel }
        : null,
    },
    groups: groups.map((g) => ({ ...g, teachers: publicEnglishTeacherList(g.teachers) })),
    history: await handleStudentHistory(pool, student.id, year.id, groupIds),
  });
  } catch (err) {
    console.error('english-assessment student card failed', err?.message || err);
    return json(500, { error: 'internal' });
  }
}

async function handleTeacherCard(pool, auth, caps, rawId) {
  const year = await currentYear(pool);
  if (!year) return json(404, { error: 'not_found' });
  const groupIds = await scopedGroupIds(pool, auth, caps);
  const teacherId = Number(rawId);
  if (!Number.isFinite(teacherId)) return json(404, { error: 'not_found' });

  const found = await pool.query(
    `SELECT t.id, t.full_name, t.initials, t.native_name, t.user_id, t.email
     FROM ea_teachers t
     WHERE t.id = $1 AND t.archived_at IS NULL`,
    [teacherId],
  );
  const teacher = found.rows[0];
  if (!teacher) return json(404, { error: 'not_found', message: 'Преподаватель не найден' });
  if (isEnglishHiddenDepartmentTeacher(teacher)) return json(404, { error: 'not_found' });

  if (!seesDepartmentAnalytics(caps)) {
    const user = auth?.sessionUser || auth?.user;
    const own = user?.id != null && Number(teacher.user_id) === Number(user.id);
    const allowedGroups = groupIds || [];
    const overlap = (
      await pool.query(
        `SELECT 1 FROM ea_group_teachers WHERE teacher_id = $1 AND group_id = ANY($2::int[]) LIMIT 1`,
        [teacher.id, allowedGroups],
      )
    ).rows[0];
    if (!own && !overlap) return json(404, { error: 'not_found' });
  }

  const groupParams = [teacher.id, year.id];
  let groupFilter = '';
  if (!seesDepartmentAnalytics(caps) && groupIds) {
    const user = auth?.sessionUser || auth?.user;
    const own = user?.id != null && Number(teacher.user_id) === Number(user.id);
    if (!own) {
      groupParams.push(groupIds);
      groupFilter = ' AND g.id = ANY($3::int[])';
    }
  }
  const groups = (
    await pool.query(
      `SELECT g.id, g.title, g.code, g.parallel, g.campus,
              COUNT(m.student_id)::int AS student_count
       FROM ea_group_teachers gt
       JOIN ea_english_groups g ON g.id = gt.group_id
       LEFT JOIN ea_group_memberships m ON m.group_id = g.id
       WHERE gt.teacher_id = $1 AND g.academic_year_id = $2 AND g.archived_at IS NULL${groupFilter}
       GROUP BY g.id, g.title, g.code, g.parallel, g.campus
       ORDER BY g.campus, g.parallel, g.code`,
      groupParams,
    )
  ).rows;

  return json(200, {
    teacher: {
      id: teacher.id,
      full_name: teacher.full_name,
      initials: teacher.initials,
      native_name: teacher.native_name,
    },
    groups,
    note: 'Карточка преподавателя не содержит рейтинга и сравнения с коллегами.',
  });
}

async function handleImportPreview(body) {
  const headers = Array.isArray(body.headers) ? body.headers.map((h) => String(h)) : [];
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const preview = previewStudentImport(headers, rows);
  return json(200, {
    filename: String(body.filename || '').slice(0, 240),
    preview,
    commit: canCommitPreview(preview, { confirmLargeClasses: Boolean(body.confirm_large_classes) }),
  });
}

async function handleImportCommit(pool, auth, caps, body) {
  if (!caps.import) return json(403, { error: 'forbidden', message: 'Недостаточно прав для импорта' });
  const headers = Array.isArray(body.headers) ? body.headers.map((h) => String(h)) : [];
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const preview = previewStudentImport(headers, rows);
  const gate = canCommitPreview(preview, { confirmLargeClasses: Boolean(body.confirm_large_classes) });
  if (!gate.ok) {
    return json(400, { error: gate.reason, preview, message: 'Импорт не подтверждён. Исправьте ошибки или подтвердите аномалии.' });
  }

  const year = await currentYear(pool);
  if (!year) return json(400, { error: 'no_year', message: 'Не задан учебный год' });

  const actor = actorFromAuth(auth);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errorRows = [];

  for (const item of preview.rows) {
    if (item.errors.length) {
      skipped += 1;
      errorRows.push({
        row_no: item.row_no,
        code: item.errors[0].code,
        message: item.errors[0].message,
        raw_json: {
          full_name: item.full_name,
          class: item.class_display,
        },
      });
      continue;
    }
    const classId = await ensureClass(pool, year.id, item);
    const existingId = await findStudent(pool, item, classId);
    if (existingId) {
      await pool.query(
        `UPDATE ea_students
         SET class_id = $2, full_name = $3, birth_date = $4, sex = $5, source_row = $6, updated_at = NOW()
         WHERE id = $1`,
        [existingId, classId, item.full_name, item.birth_date, item.sex, item.row_no],
      );
      updated += 1;
    } else {
      await pool.query(
        `INSERT INTO ea_students (class_id, full_name, normalized_full_name, birth_date, sex, source_row, campus)
         VALUES ($1, $2, $3, $4, $5, $6, 'main')`,
        [classId, item.full_name, item.normalized_full_name, item.birth_date, item.sex, item.row_no],
      );
      created += 1;
    }
  }

  const batch = await pool.query(
    `INSERT INTO ea_import_batches
       (kind, filename, author_user_id, author_email, created_count, updated_count, skipped_count, error_count, summary_json)
     VALUES ('students', $1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id, created_at`,
    [
      String(body.filename || 'import.xlsx').slice(0, 240),
      actor.id,
      actor.email,
      created,
      updated,
      skipped,
      errorRows.length,
      JSON.stringify({
        classes: preview.class_summary,
        confirm_large_classes: Boolean(body.confirm_large_classes),
      }),
    ],
  );
  const batchId = Number(batch.rows[0].id);
  for (const err of errorRows) {
    await pool.query(
      `INSERT INTO ea_import_row_errors (batch_id, row_no, code, message, raw_json)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [batchId, err.row_no, err.code, err.message, JSON.stringify(err.raw_json)],
    );
  }

  await writeAudit(pool, auth, 'import.students', 'ea_import_batches', batchId, {
    created,
    updated,
    skipped,
    filename: String(body.filename || '').slice(0, 120),
  });

  return json(200, {
    batch_id: batchId,
    created,
    updated,
    skipped,
    error_count: errorRows.length,
    preview_summary: preview.summary,
  });
}

async function handleRosterImport(pool, auth, caps, body) {
  if (!caps.roster) {
    return json(403, {
      error: 'forbidden',
      message: 'Добавлять и убирать учащихся в группах может только Костюкович',
    });
  }
  const groups = Array.isArray(body.groups) ? body.groups : [];
  const headers = Array.isArray(body.headers) ? body.headers.map((h) => String(h)) : [];
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!headers.length || !rows.length) {
    return json(400, { error: 'empty', message: 'Нет строк контингента' });
  }
  const result = await importRoster(pool, {
    headers,
    rows,
    groups,
    filename: String(body.filename || 'roster.xlsx').slice(0, 240),
    actor: actorFromAuth(auth),
    skipStudents: Boolean(body.skip_students),
  });
  await writeAudit(pool, auth, 'import.roster', 'ea_import_batches', null, {
    students_created: result.students_created,
    students_updated: result.students_updated,
    groups: result.groups,
    memberships: result.memberships,
  });
  return json(200, result);
}

async function handleBatches(pool, caps) {
  if (!caps.audit && !caps.import) return json(403, { error: 'forbidden' });
  const r = await pool.query(
    `SELECT id, kind, filename, author_email, created_count, updated_count, skipped_count, error_count, created_at
     FROM ea_import_batches
     ORDER BY created_at DESC
     LIMIT 50`,
  );
  return json(200, { batches: r.rows });
}

async function handleAudit(pool, caps) {
  if (!caps.audit) return json(403, { error: 'forbidden' });
  const r = await pool.query(
    `SELECT id, actor_email, action, entity_type, entity_id, payload_json, created_at
     FROM ea_audit_events
     ORDER BY created_at DESC
     LIMIT 100`,
  );
  return json(200, { events: r.rows });
}

function serializeTeacher(teacher) {
  return publicEnglishTeacher(teacher);
}

async function loadYearGroups(pool, yearId, teacherId) {
  if (teacherId) {
    return (
      await pool.query(
        `SELECT g.id, g.title, g.code, g.parallel, g.campus, g.class_id,
                c.code_display AS class_label,
                COUNT(m.student_id)::int AS student_count
         FROM ea_group_teachers gt
         JOIN ea_english_groups g ON g.id = gt.group_id
         LEFT JOIN ea_classes c ON c.id = g.class_id AND c.archived_at IS NULL
         LEFT JOIN ea_group_memberships m ON m.group_id = g.id
         WHERE gt.teacher_id = $1 AND g.academic_year_id = $2 AND g.archived_at IS NULL
         GROUP BY g.id, g.title, g.code, g.parallel, g.campus, g.class_id, c.code_display
         ORDER BY g.campus, g.parallel, g.code`,
        [teacherId, yearId],
      )
    ).rows;
  }
  return (
    await pool.query(
      `SELECT g.id, g.title, g.code, g.parallel, g.campus, g.class_id,
              c.code_display AS class_label,
              COUNT(m.student_id)::int AS student_count
       FROM ea_english_groups g
       LEFT JOIN ea_classes c ON c.id = g.class_id AND c.archived_at IS NULL
       LEFT JOIN ea_group_memberships m ON m.group_id = g.id
       WHERE g.academic_year_id = $1 AND g.archived_at IS NULL
       GROUP BY g.id, g.title, g.code, g.parallel, g.campus, g.class_id, c.code_display
       ORDER BY g.campus, g.parallel, g.code`,
      [yearId],
    )
  ).rows;
}

async function handleMe(pool, auth, caps, teacher, year, years, analyticsScope) {
  const publicTeacher = serializeTeacher(teacher);
  const departmentWide = Boolean(caps.viewAll || caps.scoreAll);
  let groups = year
    ? departmentWide
      ? await loadYearGroups(pool, year.id, null)
      : teacher?.id
        ? await loadYearGroups(pool, year.id, teacher.id)
        : []
    : [];
  try {
    groups = await attachTeachersToGroups(pool, groups);
    groups = await attachLatestResults(pool, groups);
  } catch {
    /* keep bare groups if meta tables absent */
  }
  const body = {
    teacher: publicTeacher,
    groups,
    year,
    years: years || [],
    capabilities: caps,
    analytics_scope: analyticsScopePublic(caps, analyticsScope),
  };
  if (publicTeacher) {
    body.note = 'Карточка преподавателя не содержит рейтинга и сравнения с коллегами.';
  }
  return json(200, body);
}

async function handleTeacherRating(pool, auth, caps, year) {
  let rating = null;
  if (caps.teacherRatingView) {
    try {
      rating = await loadTeacherRating(pool, year);
    } catch {
      rating = null;
    }
  }
  const result = ratingViewResponse(caps, rating);
  if (result.status === 200) {
    try {
      await writeAudit(pool, auth, 'rating_view', 'teacher_rating', null, {
        places_published: true,
        ranked: rating?.department?.teachers_ranked ?? null,
        year_id: year?.id ?? null,
      });
    } catch {
      /* audit table may be absent */
    }
  }
  return json(result.status, result.body);
}

async function handleTeacherRatingExport(pool, auth, caps, year) {
  let rating = null;
  if (caps.teacherRatingExport) {
    try {
      rating = await loadTeacherRating(pool, year);
    } catch {
      rating = null;
    }
  }
  const result = ratingExportResponse(caps, rating);
  try {
    await writeAudit(
      pool,
      auth,
      result.status === 403 ? 'rating_export_denied' : 'rating_export',
      'teacher_rating',
      null,
      { status: result.status, exported: Boolean(result.body?.exported), year_id: year?.id ?? null },
    );
  } catch {
    /* audit table may be absent */
  }
  return json(result.status, result.body);
}

async function handleEnglishAssessmentRequest(pool, event, method, segs) {
  const auth = await requireUser(pool, event);
  if (!auth.ok) return json(auth.code || 401, { error: auth.error || 'Unauthorized' });
  const access = await resolveEnglishAccess(pool, auth, event);
  if (access.preview_denied) {
    return json(403, {
      error: 'Forbidden',
      message: 'Просмотр кабинета преподавателя доступен только администратору.',
    });
  }
  const { caps, teacher, preview_mode, analytics_scope } = access;

  const action = segs[2] || '';
  const sub = segs[3] || '';
  const extra = segs[4] || '';
  const query = parseQuery(event) || {};

  if (preview_mode && method !== 'GET') {
    return json(403, {
      error: 'preview_readonly',
      message: 'Режим просмотра: изменения недоступны.',
    });
  }

  if (method === 'GET' && action === 'me') {
    const [year, years] = await Promise.all([resolveYear(pool, query), listYears(pool)]);
    return handleMe(pool, auth, caps, teacher, year, years, analytics_scope);
  }
  if ((method === 'GET' || method === 'PUT' || method === 'POST') && action === 'analytics-scope') {
    if (method === 'GET') return json(200, analyticsScopePublic(caps, analytics_scope));
    if (preview_mode) {
      return json(403, { error: 'preview_readonly', message: 'Режим просмотра: изменения недоступны.' });
    }
    if (!caps.canManageAnalyticsScope) {
      return json(403, { error: 'forbidden', message: 'Переключатель доступен только Новожилову' });
    }
    const body = pickAllowedFields(parseBody(event), ['mode', 'scope']);
    const mode = await saveAnalyticsScope(pool, body.mode || body.scope);
    await writeAudit(pool, auth, 'analytics_scope.set', 'ea_runtime_settings', null, { mode }).catch(() => {});
    return json(200, { ok: true, ...analyticsScopePublic({ ...caps, canManageAnalyticsScope: true }, mode) });
  }
  if (method === 'GET' && action === 'activity') {
    if (!caps.audit) return json(200, { events: [] });
    const actor = actorFromAuth(auth);
    const events = await listEnglishActivityEvents(pool, { limit: 20, viewerEmail: actor.email });
    return json(200, { events });
  }
  if (action === 'rating') {
    if (method === 'GET' && !sub) {
      return handleTeacherRating(pool, auth, caps, await resolveYear(pool, query));
    }
    if ((method === 'GET' || method === 'POST') && sub === 'export') {
      return handleTeacherRatingExport(pool, auth, caps, await resolveYear(pool, query));
    }
  }

  const blocked = denied(caps);
  if (blocked) return blocked;

  const year = await resolveYear(pool, query);

  if (method === 'GET' && action === 'meta') return handleMeta(pool, caps);
  if (method === 'GET' && action === 'sections') return handleSections();
  if (action === 'specs') {
    if (method === 'GET' && !sub) return handleSpecsList(pool, caps);
    if (method === 'POST' && !sub) {
      const body = pickAllowedFields(parseBody(event), [
        'create',
        'filename',
        'source_file',
        'spec',
        'fields',
        'tests',
        'academic_year',
        'schema_version',
        'grade',
        'variant',
        'sections',
        'catalog',
        'diagnostic',
      ]);
      if (body.create) return handleCreateSpec(pool, auth, caps, body);
      return handleUploadSpecs(pool, auth, caps, body);
    }
    if (method === 'GET' && sub) return handleSpecCard(pool, caps, sub);
    if (method === 'PUT' && sub) {
      return handleSaveSpec(
        pool,
        auth,
        caps,
        sub,
        pickAllowedFields(parseBody(event), [
          'fields',
          'filename',
          'academic_year',
          'grade',
          'variant',
          'variant_basis',
          'source_file',
          'source_kind',
          'source_total_max',
          'total_max_basis',
          'proposed_total_max',
          'excel_label_policy',
          'group_scope',
          'issues',
          'schema_version',
        ]),
      );
    }
    if (method === 'DELETE' && sub) return handleDeleteSpec(pool, auth, caps, sub);
    if (method === 'POST' && sub && extra === 'approve') {
      return handleApproveSpec(
        pool,
        auth,
        caps,
        sub,
        pickAllowedFields(parseBody(event), ['confirm_proposed_max', 'note']),
      );
    }
  }
  if (method === 'GET' && action === 'directory') {
    if (!caps.contingent) {
      return json(403, {
        error: 'forbidden',
        message: 'Контингент кафедры доступен заведующим',
      });
    }
    return handleDirectory(pool, auth, caps);
  }
  if (method === 'GET' && action === 'dashboard') {
    if (!year) return json(404, { error: 'no_year' });
    return handleTeacherDashboard(pool, auth, caps, year, teacher);
  }
  if (method === 'GET' && action === 'leader') {
    if (!year) return json(404, { error: 'no_year' });
    return handleLeaderDashboard(pool, auth, caps, year, query);
  }
  if (action === 'groups' && sub) {
    const groupId = Number(sub);
    if (!Number.isFinite(groupId)) return json(404, { error: 'not_found' });
    if (!year) return json(404, { error: 'no_year' });
    if (method === 'GET' && !extra) return handleGroupCard(pool, auth, caps, year, groupId);
    if (method === 'GET' && extra === 'scores') return handleGetScores(pool, auth, caps, year, groupId, query);
    if ((method === 'PUT' || method === 'POST') && extra === 'scores') {
      return handlePutScores(
        pool,
        auth,
        caps,
        year,
        groupId,
        pickAllowedFields(parseBody(event), ['held_on', 'section_code', 'work_type', 'max_score', 'rows']),
      );
    }
    if (method === 'PATCH' && extra === 'scores') {
      return handlePatchScoresDate(
        pool,
        auth,
        caps,
        year,
        groupId,
        pickAllowedFields(parseBody(event), ['held_on', 'from_held_on', 'new_held_on', 'to_held_on']),
      );
    }
    if (method === 'GET' && extra === 'placement') return handleGetPlacement(pool, auth, caps, year, groupId, query);
    if ((method === 'PUT' || method === 'POST') && extra === 'placement') {
      return handlePutPlacement(
        pool,
        auth,
        caps,
        year,
        groupId,
        pickAllowedFields(parseBody(event), ['held_on', 'rows', 'confirm_group_scope']),
      );
    }
    if (method === 'PATCH' && extra === 'placement') {
      return handlePatchPlacementDate(
        pool,
        auth,
        caps,
        year,
        groupId,
        pickAllowedFields(parseBody(event), ['held_on', 'from_held_on', 'new_held_on', 'to_held_on']),
      );
    }
    if (method === 'GET' && extra === 'placement.xlsx') {
      return handlePlacementExcel(pool, auth, caps, year, groupId, query);
    }
    if (method === 'POST' && extra === 'students') {
      return handleAddGroupStudent(
        pool,
        auth,
        caps,
        year,
        groupId,
        pickAllowedFields(parseBody(event), ['full_name', 'class_label', 'class_display']),
      );
    }
    if (method === 'DELETE' && extra === 'students') {
      return handleRemoveGroupStudent(pool, auth, caps, year, groupId, segs[5]);
    }
  }
  if (method === 'GET' && action === 'students' && sub) return handleStudentCard(pool, auth, caps, sub);
  if (method === 'GET' && action === 'teachers' && sub) return handleTeacherCard(pool, auth, caps, sub);
  if (method === 'GET' && action === 'import' && sub === 'batches') return handleBatches(pool, caps);
  if (method === 'GET' && action === 'audit') return handleAudit(pool, caps);
  if (method === 'POST' && action === 'import' && sub === 'preview') {
    return handleImportPreview(
      pickAllowedFields(parseBody(event), ['headers', 'rows', 'filename', 'confirm_large_classes']),
    );
  }
  if (method === 'POST' && action === 'import' && sub === 'commit') {
    return handleImportCommit(
      pool,
      auth,
      caps,
      pickAllowedFields(parseBody(event), ['headers', 'rows', 'filename', 'confirm_large_classes']),
    );
  }
  if (method === 'POST' && action === 'import' && sub === 'roster') {
    return handleRosterImport(
      pool,
      auth,
      caps,
      pickAllowedFields(parseBody(event), ['groups', 'headers', 'rows', 'filename', 'skip_students']),
    );
  }

  return json(404, { error: 'not_found' });
}

module.exports = { handleEnglishAssessmentRequest };
