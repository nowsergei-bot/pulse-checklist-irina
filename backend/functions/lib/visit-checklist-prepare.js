'use strict';

const { gigaChatParallelLimit } = require('./default-chat-model');
const { needsVisitChecklistAiNarrative } = require('./visit-checklist-cloud-ai');
const {
  fillSchoolAiIfNeeded,
  fillTeacherCardAiIfNeeded,
  readDashboard,
  readTeacherCard,
  rebuildProjectSnapshot,
} = require('./visit-checklist-cloud-snapshot');

const SEC_PER_CARD = 12;

function ruCards(n) {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} карточку`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} карточки`;
  return `${n} карточек`;
}

function formatEta(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 20) return 'меньше минуты';
  if (s < 90) return 'около минуты';
  const min = Math.round(s / 60);
  if (min === 1) return 'около 1 минуты';
  if (min >= 2 && min <= 4) return `около ${min} минут`;
  return `около ${min} минут`;
}

function progressCopy({ phase, done, total, pending, parallel }) {
  if (phase === 'snapshot') {
    return 'Собираем сводку посещений. Карточки ещё не показываем — так страница не зависает.';
  }
  if (phase === 'cards') {
    return `Готовим карточки педагогов: готово ${done} из ${total}. Сейчас пишем ${ruCards(
      Math.min(parallel, pending),
    )}. Обычно ещё ${formatEta(pending * (SEC_PER_CARD / Math.max(1, parallel)))}.`;
  }
  if (phase === 'school') {
    return 'Готовим общую справку по школе. Это последний шаг.';
  }
  return 'Сводка собрана. Можно смотреть карточки.';
}

async function listPendingTeacherKeys(pool, projectId, teachers) {
  const pending = [];
  for (const row of teachers || []) {
    const key = row && row.teacher_key;
    if (!key) continue;
    const card = await readTeacherCard(pool, projectId, key);
    if (card && needsVisitChecklistAiNarrative(card)) pending.push(key);
  }
  return pending;
}

async function prepareVisitChecklistDashboard(pool, projectId, actor) {
  const parallel = gigaChatParallelLimit();
  await rebuildProjectSnapshot(pool, projectId, { pruneMissing: true });
  const dash = await readDashboard(pool, projectId);
  const teachers = (dash && dash.teachers) || [];
  const total = teachers.length;
  const pending = await listPendingTeacherKeys(pool, projectId, teachers);
  if (!pending.length) {
    await fillSchoolAiIfNeeded(pool, projectId, { force: false });
    const readyDash = await readDashboard(pool, projectId);
    return {
      ready: true,
      phase: 'done',
      done: total,
      total,
      pending: 0,
      parallel,
      eta_sec: 0,
      message: progressCopy({ phase: 'done', done: total, total, pending: 0, parallel }),
      dashboard: readyDash,
    };
  }

  const batch = pending.slice(0, parallel);
  await Promise.all(
    batch.map((key) =>
      fillTeacherCardAiIfNeeded(pool, projectId, key, {
        force: true,
        actor: actor || {},
        refreshSchool: false,
      }).catch((err) => {
        console.warn('visit checklist prepare card failed', key, err instanceof Error ? err.message : err);
        return null;
      }),
    ),
  );

  const still = await listPendingTeacherKeys(pool, projectId, teachers);
  if (!still.length) {
    await fillSchoolAiIfNeeded(pool, projectId, { force: false });
  }
  const done = Math.max(0, total - still.length);
  const stalled = still.length === pending.length;
  const phase = still.length && !stalled ? 'cards' : 'done';
  const nextDash = await readDashboard(pool, projectId);
  return {
    ready: still.length === 0 || stalled,
    phase,
    done,
    total,
    pending: still.length,
    parallel,
    eta_sec: still.length ? Math.round((still.length * SEC_PER_CARD) / Math.max(1, parallel)) : 0,
    message: progressCopy({ phase, done, total, pending: still.length, parallel }),
    dashboard: nextDash,
  };
}

module.exports = {
  formatEta,
  gigaChatParallelLimit,
  prepareVisitChecklistDashboard,
  progressCopy,
  ruCards,
};
