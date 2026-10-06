const { isSmtpConfigured, sendHtmlEmail } = require('./mailer');
const { allowStaffNotification } = require('./staff-notify-policy');

const STATUS_LABEL_RU = {
  open: 'Открыто',
  in_progress: 'В работе',
  done: 'Выполнено',
  permanent: 'Постоянное',
  cancelled: 'Отменено',
};

const PROTOCOL_DECISION_ROLES = ['admin', 'director', 'assistant_director'];

function publicAppBase() {
  return String(process.env.PUBLIC_APP_BASE || '').trim().replace(/\/+$/, '');
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

function statusLabel(status) {
  const key = String(status || '').trim();
  return STATUS_LABEL_RU[key] || key || '—';
}

function truncate(text, max = 160) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function mailWrap(title, bodyHtml, link) {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.45;color:#1a1512">
  <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>
  ${bodyHtml}
  ${
    link
      ? `<p style="margin:18px 0"><a href="${escapeHtml(link)}" style="color:#7f0a10">Открыть в Пульсе</a></p>`
      : ''
  }
  <p style="color:#666;font-size:12px">Письмо отправлено автоматически с кабинета Пульса</p>
  </body></html>`;
}

async function sendNotifyEmail(to, subject, title, bodyHtml, link) {
  const dest = String(to || '').trim().toLowerCase();
  if (!dest || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
    return { sent: false, reason: 'no_email', to: dest || null };
  }
  if (dest.endsWith('@system.internal') || dest === 'public@audio-protocol') {
    return { sent: false, reason: 'system_email', to: dest };
  }
  if (!isSmtpConfigured()) return { sent: false, reason: 'smtp_not_configured', to: dest };
  try {
    await sendHtmlEmail({
      to: dest,
      subject,
      html: mailWrap(title, bodyHtml, link),
      text: `${title}\n\n${link || ''}`.trim(),
    });
    return { sent: true, to: dest };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('protocol notify mail failed', dest, msg);
    return { sent: false, reason: msg, to: dest };
  }
}

async function insertCabinetNotification(pool, { kind, title, body, payload, recipientEmail, recipientStaffId }) {
  const email = String(recipientEmail || '').trim().toLowerCase() || null;
  if (!email && recipientStaffId == null) return null;
  if (!allowStaffNotification({ email, recipient_email: email }, kind)) return null;
  const r = await pool.query(
    `INSERT INTO jd_notifications (kind, title, body, payload, recipient_staff_id, recipient_email)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)
     RETURNING id`,
    [
      String(kind || '').slice(0, 80),
      String(title || '').slice(0, 300),
      String(body || '').slice(0, 4000),
      JSON.stringify(payload || {}),
      recipientStaffId != null ? Number(recipientStaffId) : null,
      email,
    ],
  );
  return r.rows[0]?.id != null ? Number(r.rows[0].id) : null;
}

/**
 * In-app + email to one recipient. Email only when SMTP is configured.
 * @returns {{ notificationId: number|null, mail: object }}
 */
async function notifyRecipient(pool, recipient, { kind, title, body, payload, link, emailSubject, emailHtml }) {
  const email = String(recipient?.email || '').trim().toLowerCase();
  const staffId = recipient?.staffId != null ? Number(recipient.staffId) : null;
  if (!allowStaffNotification({ email, recipient_email: email }, kind)) {
    return { notificationId: null, mail: { sent: false, reason: 'policy_blocked', to: email || null } };
  }
  const notificationId = await insertCabinetNotification(pool, {
    kind,
    title,
    body,
    payload,
    recipientEmail: email,
    recipientStaffId: staffId,
  });
  const mail = await sendNotifyEmail(
    email,
    emailSubject || title,
    title,
    emailHtml || `<p>${escapeHtml(body)}</p>`,
    link,
  );
  return { notificationId, mail };
}

async function listUsersByRoles(pool, roles, { excludeUserId = null, excludeEmail = null } = {}) {
  const roleList = (Array.isArray(roles) ? roles : []).map((r) => String(r || '').trim()).filter(Boolean);
  if (!roleList.length) return [];
  const r = await pool.query(
    `SELECT id, email, role::text AS role, display_name
     FROM users
     WHERE role::text = ANY($1::text[])
       AND coalesce(account_status, 'active') = 'active'
       AND email IS NOT NULL
       AND trim(email) <> ''
       AND position('@' in email) > 0
       AND lower(trim(email)) NOT LIKE '%@system.internal'
       AND lower(trim(email)) <> 'public@audio-protocol'
       AND ($2::int IS NULL OR id <> $2)
       AND ($3::text IS NULL OR lower(trim(email)) <> lower(trim($3)))
     ORDER BY id ASC
     LIMIT 80`,
    [roleList, excludeUserId != null ? Number(excludeUserId) : null, excludeEmail || null],
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    email: String(row.email || '').trim().toLowerCase(),
    role: row.role,
    display_name: row.display_name || null,
  }));
}

async function resolveJdStaffIdByEmail(pool, email) {
  const dest = String(email || '').trim().toLowerCase();
  if (!dest || !dest.includes('@')) return null;
  try {
    const r = await pool.query(
      `SELECT id FROM job_description_staff
       WHERE lower(trim(email)) = $1 AND archived = FALSE
       LIMIT 1`,
      [dest],
    );
    return r.rows[0]?.id != null ? Number(r.rows[0].id) : null;
  } catch {
    return null;
  }
}

/**
 * Assignee for cabinet+email: email from corporate directory;
 * recipient_staff_id only when matched in job_description_staff (FK).
 */
async function resolveAssigneeRecipient(pool, task) {
  const corpId = task?.assignee_staff_id != null ? Number(task.assignee_staff_id) : null;
  if (!corpId) return null;
  try {
    const r = await pool.query(
      `SELECT id, email, full_name FROM corporate_staff_directory WHERE id = $1 LIMIT 1`,
      [corpId],
    );
    const row = r.rows[0];
    const email = String(row?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return null;
    const jdStaffId = await resolveJdStaffIdByEmail(pool, email);
    return { email, staffId: jdStaffId, label: row.full_name || null };
  } catch {
    return null;
  }
}

async function notifyMany(pool, recipients, message) {
  const seen = new Set();
  const results = [];
  for (const recipient of recipients) {
    const email = String(recipient?.email || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    results.push(await notifyRecipient(pool, { ...recipient, email }, message));
  }
  return results;
}

/** Methodist proposed a status change → directors / admins. */
async function notifyStatusChangePending(pool, opts = {}) {
  const taskId = String(opts.taskId || '').trim();
  const taskText = truncate(opts.taskText || 'Поручение');
  const fromStatus = statusLabel(opts.previousStatus);
  const toStatus = statusLabel(opts.proposedStatus);
  const link = cabinetUrl(`/protocol-tasks/director${taskId ? `?task=${encodeURIComponent(taskId)}` : ''}`);
  const title = 'Смена статуса на согласование';
  const body = `Запрошена смена статуса «${fromStatus}» → «${toStatus}»: ${taskText}`;
  const recipients = await listUsersByRoles(pool, PROTOCOL_DECISION_ROLES, {
    excludeUserId: opts.changedByUserId,
    excludeEmail: opts.changedByEmail,
  });
  return notifyMany(pool, recipients, {
    kind: 'protocol_status_pending',
    title,
    body,
    payload: {
      task_id: taskId || null,
      proposed_status: opts.proposedStatus || null,
      previous_status: opts.previousStatus || null,
      href: '/protocol-tasks/director',
    },
    link,
    emailSubject: title,
    emailHtml: `<p>${escapeHtml(body)}</p><p>Откройте панель директора в кабинете Пульса.</p>`,
  });
}

/** Director/admin decided a pending status change → requester. */
async function notifyStatusChangeDecided(pool, opts = {}) {
  const userId = opts.changedByUserId != null ? Number(opts.changedByUserId) : null;
  if (!userId) return [];
  const u = await pool.query(
    `SELECT id, email FROM users WHERE id = $1 AND coalesce(account_status, 'active') = 'active' LIMIT 1`,
    [userId],
  );
  const row = u.rows[0];
  if (!row?.email) return [];
  const decision = String(opts.decision || '') === 'approved' ? 'согласована' : 'отклонена';
  const taskText = truncate(opts.taskText || 'Поручение');
  const toStatus = statusLabel(opts.proposedStatus);
  const title = `Смена статуса ${decision}`;
  const body =
    String(opts.decision || '') === 'approved'
      ? `Заявка на статус «${toStatus}» согласована: ${taskText}`
      : `Заявка на статус «${toStatus}» отклонена: ${taskText}`;
  const link = cabinetUrl(`/protocol-tasks${opts.taskId ? `?task=${encodeURIComponent(opts.taskId)}` : ''}`);
  return [
    await notifyRecipient(
      pool,
      { email: row.email, staffId: null },
      {
        kind: 'protocol_status_decided',
        title,
        body,
        payload: {
          task_id: opts.taskId || null,
          decision: opts.decision || null,
          href: '/protocol-tasks',
        },
        link,
        emailSubject: title,
        emailHtml: `<p>${escapeHtml(body)}</p>`,
      },
    ),
  ];
}

/** Drafts moved to director queue. */
async function notifyPendingDirectorReview(pool, opts = {}) {
  const count = Number(opts.count) || 0;
  if (count <= 0) return [];
  const eventTitle = truncate(opts.eventTitle || 'протокол', 80);
  const title = 'Поручения на согласование директора';
  const body =
    count === 1
      ? `Одно поручение из «${eventTitle}» ожидает согласования директора.`
      : `${count} поручений из «${eventTitle}» ожидают согласования директора.`;
  const link = cabinetUrl('/protocol-tasks/director');
  const recipients = await listUsersByRoles(pool, ['admin', 'director'], {
    excludeUserId: opts.actorUserId,
    excludeEmail: opts.actorEmail,
  });
  return notifyMany(pool, recipients, {
    kind: 'protocol_pending_director',
    title,
    body,
    payload: {
      event_group_id: opts.eventGroupId || null,
      count,
      href: '/protocol-tasks/director',
    },
    link,
    emailSubject: title,
    emailHtml: `<p>${escapeHtml(body)}</p>`,
  });
}

/** Task published / assigned → assignee (if email in directory). */
async function notifyTaskAssigned(pool, task, opts = {}) {
  if (!task) return null;
  const approval = String(task.approval_status || opts.approvalStatus || 'approved');
  if (approval !== 'approved') return null;
  const recipient = await resolveAssigneeRecipient(pool, task);
  if (!recipient) return null;
  const actorEmail = String(opts.actorEmail || '').trim().toLowerCase();
  if (actorEmail && actorEmail === recipient.email) return null;
  const taskId = String(task.id || '').trim();
  const taskText = truncate(task.task_text || 'Поручение');
  const title = 'Вам назначено поручение';
  const body = `Новое поручение в панели: ${taskText}`;
  const link = cabinetUrl(`/protocol-tasks${taskId ? `?task=${encodeURIComponent(taskId)}` : ''}`);
  return notifyRecipient(
    pool,
    { email: recipient.email, staffId: recipient.staffId },
    {
      kind: 'protocol_task_assigned',
      title,
      body,
      payload: {
        task_id: taskId || null,
        href: '/protocol-tasks',
      },
      link,
      emailSubject: title,
      emailHtml: `<p>${escapeHtml(body)}</p><p>Откройте поручения в кабинете Пульса.</p>`,
    },
  );
}

/**
 * New protocol task → admin composition (admin / director / assistant) by corporate email.
 * In-app notification too when recipient is in JD staff.
 */
async function notifyAdminsTaskCreated(pool, task, opts = {}) {
  if (!task) return [];
  const taskId = String(task.id || '').trim();
  const taskText = truncate(task.task_text || 'Поручение');
  const assignee = String(task.assignee_name || '').trim() || 'не назначен';
  const title = 'Добавлено поручение';
  const body = `${assignee}: ${taskText}`;
  const link = cabinetUrl(`/protocol-tasks/director${taskId ? `?task=${encodeURIComponent(taskId)}` : ''}`);
  const recipients = await listUsersByRoles(pool, PROTOCOL_DECISION_ROLES, {
    excludeUserId: opts.actorUserId,
    excludeEmail: opts.actorEmail,
  });
  const withStaff = [];
  for (const u of recipients) {
    const staffId = await resolveJdStaffIdByEmail(pool, u.email);
    withStaff.push({ email: u.email, staffId });
  }
  return notifyMany(pool, withStaff, {
    kind: 'protocol_task_created_admin',
    title,
    body,
    payload: {
      task_id: taskId || null,
      assignee_name: assignee,
      href: '/protocol-tasks/director',
    },
    link,
    emailSubject: title,
    emailHtml: `<p>${escapeHtml(body)}</p><p>Новое поручение в панели Пульса.</p>`,
  });
}

/** After create/publish: assignee + admin composition. */
async function notifyTaskCreatedBundle(pool, task, opts = {}) {
  const out = { assignee: null, admins: [] };
  try {
    out.assignee = await notifyTaskAssigned(pool, task, opts);
  } catch (e) {
    console.warn('protocol task assigned notify failed', e instanceof Error ? e.message : e);
  }
  try {
    out.admins = await notifyAdminsTaskCreated(pool, task, opts);
  } catch (e) {
    console.warn('protocol task admin notify failed', e instanceof Error ? e.message : e);
  }
  return out;
}

/** Applied status change (auto-approved by privileged role) → assignee. */
async function notifyTaskStatusApplied(pool, task, opts = {}) {
  if (!task) return null;
  const previous = String(opts.previousStatus || '').trim();
  const next = String(opts.status || task.status || '').trim();
  if (!previous || !next || previous === next) return null;
  if (!['done', 'in_progress', 'open', 'permanent', 'cancelled'].includes(next)) return null;
  // Skip noisy open→open style; only meaningful transitions to done / in_progress / permanent.
  if (!['done', 'in_progress', 'permanent'].includes(next) && next !== 'cancelled') return null;

  const recipient = await resolveAssigneeRecipient(pool, task);
  if (!recipient) return null;
  const actorEmail = String(opts.actorEmail || '').trim().toLowerCase();
  if (actorEmail && actorEmail === recipient.email) return null;

  const taskId = String(task.id || '').trim();
  const taskText = truncate(task.task_text || 'Поручение');
  const title = 'Изменён статус поручения';
  const body = `Статус «${statusLabel(previous)}» → «${statusLabel(next)}»: ${taskText}`;
  const link = cabinetUrl(`/protocol-tasks${taskId ? `?task=${encodeURIComponent(taskId)}` : ''}`);
  return notifyRecipient(
    pool,
    { email: recipient.email, staffId: recipient.staffId },
    {
      kind: 'protocol_task_status',
      title,
      body,
      payload: {
        task_id: taskId || null,
        status: next,
        previous_status: previous,
        href: '/protocol-tasks',
      },
      link,
      emailSubject: title,
      emailHtml: `<p>${escapeHtml(body)}</p>`,
    },
  );
}

module.exports = {
  STATUS_LABEL_RU,
  statusLabel,
  notifyStatusChangePending,
  notifyStatusChangeDecided,
  notifyPendingDirectorReview,
  notifyTaskAssigned,
  notifyAdminsTaskCreated,
  notifyTaskCreatedBundle,
  notifyTaskStatusApplied,
  listUsersByRoles,
  resolveAssigneeRecipient,
  resolveJdStaffIdByEmail,
  notifyRecipient,
};
