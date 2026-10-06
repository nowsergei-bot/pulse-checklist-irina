"use strict";
const {effectiveGrants} = require("./visit-checklist-department-access");
const norm = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
const invalid = (message, code = 400) =>
  Object.assign(new Error(message), { httpStatus: code });
function sourceMeta(row, directory = {}) {
  const g = row.answers_json?.general || {};
  const rawTeacher = String(g.teacher_id || "").trim();
  const canonicalName = value => norm(value) === "anthony smith" ? "энтони смит" : norm(value);
  const teacher =
    String((directory.teachers || []).find(t => t.id === rawTeacher || canonicalName(t.name) === canonicalName(rawTeacher || g.teacher_name || g.teacher))?.id || "").trim() ||
    rawTeacher ||
    String(
      (directory.teachers || []).find(
        (t) => norm(t.name) === norm(g.teacher_name || g.teacher),
      )?.id || "",
    );
  const date = String(g.visit_date || g.date || "").slice(0, 10);
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(+new Date(`${date}T00:00Z`)) &&
    new Date(`${date}T00:00Z`).toISOString().slice(0, 10) === date;
  const format =
    g.visit_format || g.format || g.visitFormat || g.lesson_format || "";
  const self = /само[\s-]?анализ|самооценка|^self(?:$|[ -])|^samoanaliz$/i.test(
    format,
  );
  const letters = { а: "a", в: "b", с: "c", д: "d", е: "e", н: "h" };
  const className = norm(g.class_name || g.class || g.className).replace(/\s+/g, "").replace(/[авсден]/g, letter => letters[letter]),
    subject = norm(g.subject || g.lesson_subject || g.discipline);
  const lessonKey = teacher && validDate && className && subject
      ? [teacher, date, subject, className].join("|")
      : `response:${row.id}`;
  return {
    id: Number(row.id),
    teacher,
    date: validDate ? date : "",
    self,
    lessonKey,
  };
}
function automaticCandidates(rows, directory = {}, existing = []) {
  const meta = rows.map((r) => sourceMeta(r, directory));
  const grouped = new Map();
  for (const item of meta.filter((m) => !m.self && m.teacher && m.date)) {
    if (!grouped.has(item.lessonKey)) grouped.set(item.lessonKey, item);
    else if (item.id < grouped.get(item.lessonKey).id)
      grouped.set(item.lessonKey, item);
  }
  const bound = new Set(existing.map((l) => Number(l.self_response_id)));
  return meta
    .filter((m) => m.self && m.teacher && m.date && !bound.has(m.id))
    .flatMap((self) => {
      const candidates = [...grouped.values()].filter(
        (m) => m.teacher === self.teacher && m.date === self.date,
      );
      return candidates.length === 1
        ? [
            {
              self_response_id: self.id,
              lesson_response_id: candidates[0].id,
              method: "teacher_date",
            },
          ]
        : [];
    });
}
function validatePair(rows, directory, pair) {
  const self = rows.find((r) => Number(r.id) === Number(pair.self_response_id)),
    lesson = rows.find((r) => Number(r.id) === Number(pair.lesson_response_id));
  if (!self || !lesson)
    throw invalid("Источник или урок не найден в выбранном проекте", 404);
  const a = sourceMeta(self, directory),
    b = sourceMeta(lesson, directory);
  if (!a.self || b.self || !a.teacher || a.teacher !== b.teacher)
    throw invalid("Связать можно самоанализ и урок одного учителя");
  return {
    self_response_id: a.id,
    lesson_response_id: b.id,
    method: pair.method === "teacher_date" ? "teacher_date" : "manual",
  };
}
async function authorize(db, actor, projectId) {
  if (!actor?.id)
    throw invalid("Нет доступа к привязке самоанализов", 403);
  const project = (
    await db.query(
      "SELECT id,user_id,state_json,COALESCE(state_json->'draft'->'directory',state_json->'directory') AS directory FROM lesson_visit_projects WHERE id=$1",
      [projectId],
    )
  ).rows[0];
  if (!project) throw invalid("Проект недоступен", 404);
  const grants = await effectiveGrants(db, actor.id, "view", projectId, project.state_json?.pulse_v3 || {});
  const owner = String(process.env.PULSE_PLATFORM_OWNER_USER_ID || "");
  if (!grants.some(g => g.lesson_id == null && g.department_id == null) && !(owner && String(actor.id) === owner))
    throw invalid("Нужен доступ к общей сводке всех кафедр", 403);
  return project;
}
async function listLinks(db, actor, projectId) {
  await authorize(db, actor, projectId);
  return (
    await db.query(
      "SELECT l.*,u.display_name AS confirmed_by_label FROM pulse_self_analysis_links l LEFT JOIN users u ON u.id=l.confirmed_by WHERE l.project_id=$1 ORDER BY l.self_response_id",
      [projectId],
    )
  ).rows;
}
async function saveLinks(pool, actor, projectId, body) {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const project = await authorize(tx, actor, projectId);
    // One project lock prevents racing first inserts and makes repeated actions idempotent.
    await tx.query("SELECT pg_advisory_xact_lock(103136,$1)", [projectId]);
    const rows = (
      await tx.query(
        "SELECT id,answers_json FROM lesson_visit_responses WHERE project_id=$1 ORDER BY id",
        [projectId],
      )
    ).rows;
    const existing = (
      await tx.query(
        "SELECT * FROM pulse_self_analysis_links WHERE project_id=$1 FOR UPDATE",
        [projectId],
      )
    ).rows;
    let pairs;
    if (body.mode === "automatic")
      pairs = automaticCandidates(rows, project.directory, existing);
    else {
      if (
        !Number.isSafeInteger(body.self_response_id) ||
        !Number.isSafeInteger(body.lesson_response_id)
      )
        throw invalid("Нужны идентификаторы самоанализа и урока");
      pairs = [validatePair(rows, project.directory, body)];
    }
    for (const pair of pairs) {
      validatePair(rows, project.directory, pair);
      const previous = existing.find(
        (l) => Number(l.self_response_id) === pair.self_response_id,
      );
      if (
        previous &&
        Number(previous.lesson_response_id) === pair.lesson_response_id
      )
        continue;
      const revision = (previous?.revision || 0) + 1;
      await tx.query(
        `INSERT INTO pulse_self_analysis_links(project_id,self_response_id,lesson_response_id,method,revision,confirmed_by)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(project_id,self_response_id) DO UPDATE SET lesson_response_id=EXCLUDED.lesson_response_id,
    method=EXCLUDED.method,revision=EXCLUDED.revision,confirmed_by=EXCLUDED.confirmed_by,confirmed_at=now()`,
        [
          projectId,
          pair.self_response_id,
          pair.lesson_response_id,
          pair.method,
          revision,
          actor.id,
        ],
      );
      await tx.query(
        `INSERT INTO pulse_self_analysis_link_history(project_id,self_response_id,previous_lesson_response_id,lesson_response_id,method,revision,confirmed_by)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          projectId,
          pair.self_response_id,
          previous?.lesson_response_id || null,
          pair.lesson_response_id,
          pair.method,
          revision,
          actor.id,
        ],
      );
    }
    const links = (
      await tx.query(
        "SELECT l.*,u.display_name AS confirmed_by_label FROM pulse_self_analysis_links l LEFT JOIN users u ON u.id=l.confirmed_by WHERE l.project_id=$1 ORDER BY l.self_response_id",
        [projectId],
      )
    ).rows;
    await tx.query("COMMIT");
    return links;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}
module.exports = {
  sourceMeta,
  automaticCandidates,
  validatePair,
  authorize,
  listLinks,
  saveLinks,
};
