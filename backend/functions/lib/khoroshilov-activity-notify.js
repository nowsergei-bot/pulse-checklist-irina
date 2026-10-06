'use strict';

const { notifyRecipient } = require('./protocol-task-notify');

const METHOD_HELP_LINK = 'anketa-professionalnyh-zaprosov-pedagoga';
const METHOD_HELP_PREFIX = 'anketa-professionalnyh-zaprosov';

const KHOROSHILOV_EMAILS = ['khoroshilov@primakov.school', 'horoshilov@primakov.school'];

function publicAppBase() {
  return String(process.env.PUBLIC_APP_BASE || '')
    .trim()
    .replace(/\/+$/, '');
}

function cabinetUrl(path) {
  const base = publicAppBase();
  const p = String(path || '').startsWith('/') ? path : `/${path || ''}`;
  return base ? `${base}${p}` : p;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collapseSpaces(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function answerText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return collapseSpaces(value);
  if (Array.isArray(value)) return value.map(answerText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return collapseSpaces(value.text);
    if (typeof value.label === 'string') return collapseSpaces(value.label);
    if (value.value != null && value.value !== value) return answerText(value.value);
  }
  return '';
}

function isMethodHelpSurvey(survey) {
  const link = String(survey && survey.access_link ? survey.access_link : '')
    .trim()
    .toLowerCase();
  if (link === METHOD_HELP_LINK || link.startsWith(METHOD_HELP_PREFIX)) return true;
  const title = String(survey && survey.title ? survey.title : '');
  return /молодых педагог|профессиональн(ых|ые) запрос/i.test(title);
}

function extractMethodHelpFio(survey, answersList) {
  const questions = (survey && survey.questions) || [];
  const answers = Array.isArray(answersList) ? answersList : [];
  for (const q of questions) {
    const text = String(q.text || '').toLowerCase();
    if (!/фио|фамили/.test(text)) continue;
    const ans = answers.find((a) => Number(a.question_id) === Number(q.id));
    const v = answerText(ans && ans.value);
    if (v) return v;
  }
  return '';
}

function visitTeacherName(general, directory) {
  const teacherId = collapseSpaces(general && general.teacher_id);
  const teachers = directory && Array.isArray(directory.teachers) ? directory.teachers : [];
  const row = teachers.find((t) => String(t.id) === teacherId);
  if (row && row.name) return collapseSpaces(row.name);
  return teacherId;
}

function visitChecklistSummary(general, directory) {
  const g = general && typeof general === 'object' ? general : {};
  return {
    visitor: collapseSpaces(g.visitor_name),
    teacher: visitTeacherName(g, directory),
    className: collapseSpaces(g.class_name),
    subject: collapseSpaces(g.subject),
    date: collapseSpaces(g.visit_date),
    format: collapseSpaces(g.visit_format),
  };
}

async function resolveKhoroshilovRecipient(pool) {
  try {
    const r = await pool.query(
      `SELECT id, email FROM job_description_staff
       WHERE COALESCE(archived, FALSE) = FALSE
         AND lower(trim(email)) = ANY($1::text[])
       LIMIT 1`,
      [KHOROSHILOV_EMAILS],
    );
    if (r.rows[0] && r.rows[0].email) {
      return {
        email: String(r.rows[0].email).trim().toLowerCase(),
        staffId: r.rows[0].id != null ? Number(r.rows[0].id) : null,
      };
    }
  } catch {
    /* staff table may be absent in tests */
  }
  return { email: KHOROSHILOV_EMAILS[0], staffId: null };
}

function isKhoroshilovName(name) {
  const n = collapseSpaces(name)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
  return n.includes('хорошилов') && (n.includes('алексей') || n.includes('alexei') || n.includes('alexey'));
}

async function deliverKhoroshilovNotice(pool, message) {
  const recipient = await resolveKhoroshilovRecipient(pool);
  const primary = await notifyRecipient(pool, recipient, message);
  const primaryEmail = String(recipient.email || '')
    .trim()
    .toLowerCase();
  for (const email of KHOROSHILOV_EMAILS) {
    if (email === primaryEmail) continue;
    await notifyRecipient(pool, { email, staffId: null }, message);
  }
  return primary;
}

async function notifyKhoroshilovVisitChecklist(pool, opts = {}) {
  if (!pool) return null;
  return null;
  const summary = visitChecklistSummary(opts.general, opts.directory);
  if (isKhoroshilovName(summary.visitor)) return null;
  const bits = [summary.teacher, summary.className, summary.subject, summary.date].filter(Boolean);
  const title = 'Чек-лист посещения урока';
  const body = summary.visitor
    ? `${summary.visitor} заполнил(а) чек-лист${bits.length ? `: ${bits.join(' · ')}` : '.'}`
    : bits.length
      ? `Новое прохождение чек-листа: ${bits.join(' · ')}`
      : 'Новое прохождение чек-листа посещения урока.';
  const href = '/analytics/lesson-visit/dashboard';
  return deliverKhoroshilovNotice(pool, {
    kind: 'visit_checklist_response',
    title,
    body,
    payload: {
      href,
      response_id: opts.responseId || null,
      teacher: summary.teacher || null,
      visitor: summary.visitor || null,
    },
    link: cabinetUrl(href),
    emailSubject: title,
    emailHtml: `<p>${escapeHtml(body)}</p><p>Откройте аналитику чек-листа в кабинете Пульса.</p>`,
  });
}

async function notifyKhoroshilovMethodHelp(pool, opts = {}) {
  if (!pool) return null;
  const survey = opts.survey || {};
  if (!isMethodHelpSurvey(survey)) return null;
  const fio = extractMethodHelpFio(survey, opts.answersList);
  if (isKhoroshilovName(fio)) return null;
  const surveyTitle = collapseSpaces(survey.title) || 'Анкета профессиональных запросов педагога';
  const title = 'Опрос молодых педагогов';
  const body = fio ? `${fio} заполнил(а) «${surveyTitle}».` : `Новый ответ в опросе «${surveyTitle}».`;
  const accessLink = collapseSpaces(survey.access_link);
  const href = accessLink ? `/s/${encodeURIComponent(accessLink)}/method-help` : '/cabinet/surveys/results';
  return deliverKhoroshilovNotice(pool, {
    kind: 'method_help_response',
    title,
    body,
    payload: {
      href,
      survey_id: survey.id || null,
      access_link: accessLink || null,
      response_id: opts.responseId || null,
      fio: fio || null,
    },
    link: cabinetUrl(href),
    emailSubject: title,
    emailHtml: `<p>${escapeHtml(body)}</p><p>Откройте дашборд школы молодых педагогов в Пульсе.</p>`,
  });
}

async function maybeNotifyKhoroshilovSurveyResponse(pool, survey, answersList, responseId) {
  try {
    return await notifyKhoroshilovMethodHelp(pool, { survey, answersList, responseId });
  } catch (e) {
    console.warn('khoroshilov method-help notify failed', e instanceof Error ? e.message : e);
    return null;
  }
}

async function maybeNotifyKhoroshilovVisitChecklist(pool, opts) {
  try {
    return await notifyKhoroshilovVisitChecklist(pool, opts);
  } catch (e) {
    console.warn('khoroshilov visit-checklist notify failed', e instanceof Error ? e.message : e);
    return null;
  }
}

module.exports = {
  KHOROSHILOV_EMAILS,
  isMethodHelpSurvey,
  extractMethodHelpFio,
  visitChecklistSummary,
  isKhoroshilovName,
  resolveKhoroshilovRecipient,
  notifyKhoroshilovVisitChecklist,
  notifyKhoroshilovMethodHelp,
  maybeNotifyKhoroshilovSurveyResponse,
  maybeNotifyKhoroshilovVisitChecklist,
};
