// Поля входного тестирования по параллелям для страницы schema (только data_admin).
// Названия полей и максимумы берутся из спецификаций старого раздела (pulse_read.placement_spec_uploads,
// pulse_read.placement_spec_catalog), заполненность из баллов текущего года. Без ФИО и без баллов учеников.
// Для каждого поля предлагается общий раздел сравнения; это только предложение, ничего не сохраняется.

const { catalogColumns, columnMap, placementLinks, currentYear } = require('./schema.cjs');
const { COMMON_SECTIONS, suggestCommonSection } = require('./lib/compare.cjs');

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const text = (v) => (v === null || v === undefined ? null : String(v));

// Объекты спецификаций внутри jsonb: у спецификации есть массив fields с подписями или максимумами.
function findSpecs(json, out = [], depth = 0) {
  if (!json || typeof json !== 'object' || depth > 6) return out;
  if (Array.isArray(json)) {
    for (const item of json) findSpecs(item, out, depth + 1);
    return out;
  }
  if (Array.isArray(json.fields) && json.fields.some(f => f && typeof f === 'object' && ('excel_label' in f || 'max_score' in f || 'section' in f))) {
    out.push(json);
    return out;
  }
  for (const value of Object.values(json)) findSpecs(value, out, depth + 1);
  return out;
}

function specFields(spec) {
  return spec.fields.filter(f => f && typeof f === 'object').map(f => {
    const max = num(f.effective_max) ?? num(f.max_score) ?? num(f.max) ?? num(f.proposed_max_score);
    const field = {
      field_id: text(f.id ?? f.field_id),
      section: text(f.section),
      section_code: text(f.section_code),
      excel_label: text(f.excel_label ?? f.label),
      max,
      max_approved: num(f.max_score) !== null || f.approved_max === true,
      proposed: f.proposed === true || (num(f.max_score) === null && num(f.proposed_max_score) !== null),
    };
    field.suggested = suggestCommonSection(field);
    return field;
  });
}

async function optionalRows(db, sql) {
  try {
    return (await db.query(sql)).rows;
  } catch (e) {
    return null;
  }
}

async function placementFields(db) {
  const all = columnMap(await catalogColumns(db));
  const has = (t, c) => (all.get(t) || []).includes(c);
  const year = await currentYear(db);
  const notes = [];

  // Спецификации: сначала загруженные (неархивные), затем каталог; по spec_id берётся первая найденная.
  const specs = new Map();
  const addSpec = (spec, source, extra = {}) => {
    const id = text(spec.id ?? spec.spec_id ?? extra.spec_id);
    if (!id || specs.has(id)) return;
    specs.set(id, {
      spec_id: id, source, grade: num(spec.grade), academic_year: text(spec.academic_year ?? extra.academic_year),
      total_max: num(spec.total_max) ?? num(spec.source_total_max) ?? num(spec.proposed_total_max),
      fields: specFields(spec),
    });
  };
  if (has('placement_spec_uploads', 'spec_json')) {
    const where = has('placement_spec_uploads', 'archived_at') ? 'WHERE archived_at IS NULL' : '';
    const order = has('placement_spec_uploads', 'uploaded_at') ? 'ORDER BY uploaded_at DESC NULLS LAST' : '';
    const cols = ['spec_json', has('placement_spec_uploads', 'spec_id') ? 'spec_id::text AS spec_id' : 'NULL::text AS spec_id',
      has('placement_spec_uploads', 'academic_year') ? 'academic_year::text AS academic_year' : 'NULL::text AS academic_year'];
    const rows = await optionalRows(db, `SELECT ${cols.join(', ')} FROM pulse_read.placement_spec_uploads ${where} ${order}`);
    if (rows === null) notes.push('placement_spec_uploads не прочитано');
    for (const r of rows || []) for (const s of findSpecs(r.spec_json)) addSpec(s, 'загружена', r);
  } else notes.push('нет placement_spec_uploads.spec_json');
  if (has('placement_spec_catalog', 'catalog')) {
    const rows = await optionalRows(db, 'SELECT catalog FROM pulse_read.placement_spec_catalog');
    if (rows === null) notes.push('placement_spec_catalog не прочитано');
    for (const r of rows || []) for (const s of findSpecs(r.catalog)) addSpec(s, 'каталог');
  } else notes.push('нет placement_spec_catalog.catalog');

  // Утверждение спецификации в старом разделе.
  if (has('placement_approvals', 'spec_id') && has('placement_approvals', 'status')) {
    const rows = await optionalRows(db, 'SELECT spec_id::text AS spec_id, status::text AS status FROM pulse_read.placement_approvals');
    for (const r of rows || []) if (specs.has(r.spec_id)) specs.get(r.spec_id).approval = r.status;
  }

  // Какие спецификации и поля использованы в текущем году: параллели, ученики, заполненность полей.
  const used = new Map();
  const { missing, from, session, student, scoreCol, year: yearSql } = placementLinks(all);
  if (!missing.length && year && has('placement_sessions', 'spec_id') && has('placement_field_scores', 'field_id')) {
    const score = scoreCol ? `fs.${scoreCol}` : 'NULL::numeric';
    try {
      const rows = (await db.query(
        `WITH s AS (SELECT ps.id, ps.group_id, ps.spec_id::text AS spec_id FROM pulse_read.placement_sessions ps WHERE ${yearSql.sql}),
              g AS (SELECT DISTINCT ON (id) id, parallel FROM pulse_read.groups ORDER BY id)
         SELECT s.spec_id, fs.field_id::text AS field_id,
                array_agg(DISTINCT g.parallel) FILTER (WHERE g.parallel IS NOT NULL) AS parallels,
                count(DISTINCT ${student})::int AS students, count(${score})::int AS filled, max(${score}) AS max_seen
         FROM s JOIN ${from} ON ${session} = s.id LEFT JOIN g ON g.id = s.group_id
         GROUP BY s.spec_id, fs.field_id`,
        [year.id],
      )).rows;
      for (const r of rows) {
        if (!used.has(r.spec_id)) used.set(r.spec_id, { parallels: new Set(), students: 0, fields: new Map() });
        const u = used.get(r.spec_id);
        for (const p of r.parallels || []) u.parallels.add(Number(p));
        u.students = Math.max(u.students, r.students);
        u.fields.set(r.field_id, { filled: r.filled, max_seen: num(r.max_seen) });
      }
    } catch (e) {
      notes.push(e && e.code ? `баллы не прочитаны (${e.code})` : 'баллы не прочитаны');
    }
  } else notes.push(...missing);

  // В ответ: спецификации текущего года (по сессиям), по параллелям.
  const out = [];
  for (const [specId, u] of used) {
    const spec = specs.get(specId) || { spec_id: specId, source: 'не найдена', grade: null, academic_year: null, total_max: null, fields: [] };
    const fields = spec.fields.map(f => ({ ...f, ...(u.fields.get(f.field_id) || { filled: 0, max_seen: null }) }));
    // Поля, которые есть в баллах, но не в спецификации.
    for (const [fieldId, stat] of u.fields) {
      if (!spec.fields.some(f => f.field_id === fieldId)) {
        fields.push({ field_id: fieldId, section: null, section_code: null, excel_label: null, max: null, max_approved: false, proposed: false, suggested: null, not_in_spec: true, ...stat });
      }
    }
    const sum = fields.reduce((s, f) => s + (f.max || 0), 0);
    out.push({
      spec_id: specId, source: spec.source, grade: spec.grade, approval: spec.approval || null,
      parallels: [...u.parallels].sort((a, b) => a - b), students: u.students,
      total_max: spec.total_max ?? (sum || null), fields,
    });
  }
  out.sort((a, b) => (a.parallels[0] ?? a.grade ?? 99) - (b.parallels[0] ?? b.grade ?? 99) || a.spec_id.localeCompare(b.spec_id));
  return {
    status: 200,
    body: { current_year: year ? year.label : null, sections: COMMON_SECTIONS, specs: out, specs_found: specs.size, notes },
  };
}

module.exports = { placementFields, findSpecs, specFields };
