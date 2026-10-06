export const JD_SECTION_KEYS = ['general', 'functions', 'duties', 'rights', 'responsibility'] as const;
export type JdSectionKey = (typeof JD_SECTION_KEYS)[number];

export const JD_SECTION_TITLES: Record<JdSectionKey, string> = {
  general: '1. Общие положения',
  functions: '2. Трудовые функции',
  duties: '3. Должностные обязанности',
  rights: '4. Права',
  responsibility: '5. Ответственность',
};

export const JD_EDITABLE_STATUSES = ['draft', 'returned', 'revision_requested'] as const;

export const JD_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  returned: 'На доработке',
  revision_requested: 'На доработке',
  pending_supervisor: 'На согласовании',
  pending_deputy: 'На согласовании',
  pending_hr: 'На согласовании',
  pending_director: 'На согласовании',
  approved: 'Утверждено',
};

export const JD_STATUS_FILTER_LABELS: Record<string, string> = {
  draft: 'Черновик',
  returned: 'На доработке',
  revision_requested: 'На доработке',
  pending_supervisor: 'У первого согласующего',
  pending_deputy: 'Дальше по маршруту',
  pending_hr: 'Отдел персонала',
  pending_director: 'Директор',
  approved: 'Утверждено',
};

export const JD_TIMELINE = [
  { key: 'draft', label: 'Черновик' },
  { key: 'pending_supervisor', label: 'На согласовании' },
  { key: 'pending_deputy', label: 'На согласовании' },
  { key: 'pending_hr', label: 'На согласовании' },
  { key: 'pending_director', label: 'На согласовании' },
  { key: 'approved', label: 'Утверждено' },
] as const;

export type JdSection = { notes: string; text: string };
export type JdSections = Record<JdSectionKey, JdSection>;

export type JdStaff = {
  id: number;
  full_name: string;
  position_staff: string;
  position_actual: string;
  department: string;
  department_staff: string;
  is_manager: boolean;
  role_kind: string;
  manager_name: string | null;
  manager_staff_id: number | null;
  /** Excel section head for «Моя команда» / home — not JD approval-route supervisor. */
  team_manager_name?: string | null;
  display_position?: string | null;
  approval_route?: string[];
  email?: string | null;
};

export type JdFlags = {
  is_admin: boolean;
  is_hr: boolean;
  is_director: boolean;
  is_manager: boolean;
  is_specialist: boolean;
  has_staff: boolean;
  can_export_docx?: boolean;
};

export type JdStep = {
  id: number;
  step_index: number;
  role_key: string;
  label: string;
  approver_staff_id: number | null;
  approver_name: string;
  approver_position?: string | null;
  approver_email?: string | null;
  status: string;
  comment: string;
  acted_at: string | null;
};

export type JobDescription = {
  id: number;
  staff_id: number;
  author_user_id: number | null;
  title: string;
  position: string;
  department: string;
  sections: JdSections;
  status: string;
  current_step_index: number;
  route_snapshot: unknown[];
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  staff_name?: string | null;
  staff_email?: string | null;
  steps?: JdStep[];
  content_hidden?: boolean;
  no_document?: boolean;
  current_stage_label?: string;
  current_approver_name?: string | null;
  current_approver_position?: string | null;
  stuck?: boolean;
  days_on_stage?: number | null;
  stage_entered_at?: string | null;
  my_step_index?: number | null;
  steps_until_me?: number | null;
  available_actions?: string[];
};

export type JdMeResponse = {
  user: { id: number; email: string; display_name: string | null; role: string };
  staff: JdStaff | null;
  staff_roles?: JdStaff[];
  flags: JdFlags;
  my_jd: JobDescription | null;
  my_jds?: Array<JobDescription & { staff?: JdStaff | null }>;
  my_steps: JdStep[];
  can_approve_all?: boolean;
  inbox_count: number;
  upcoming_count?: number;
  can_see_queue?: boolean;
  notification_count?: number;
  my_notifications?: JdNotification[];
  unmatched: boolean;
  preview_mode?: boolean;
  preview_as?: string | null;
  mail_config?: { smtp: boolean; public_app_base: string | null };
  broadcast_recipient_count?: number;
};

export type JdTeamMember = {
  id: number;
  full_name: string;
  email: string | null;
  position: string;
  department: string;
  jd_id: number | null;
  jd_status: string | null;
};

export type JdBroadcastResult = {
  recipient_count: number;
  sent: number;
  notified: number;
  smtp: boolean;
  mail_error?: string | null;
};

export type JdQualityIssue = {
  severity: 'error' | 'warn';
  section_key: JdSectionKey | null;
  message: string;
};

export type JdRouteProblem = {
  staff_id: number;
  full_name: string;
  department: string;
  position: string;
  manager_name: string | null;
  manager_staff_id: number | null;
  route_label: string | null;
  missing: Array<{ role_key: string; label: string; reason: string }>;
  resolved_count: number;
};

export type JdNotification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type JdMailResult = {
  sent: boolean;
  reason?: string;
  to?: string | null;
  warnings?: Array<{ code: string; message: string }>;
};

export type JdRouteStepDraft = {
  role_key: string;
  label: string;
  resolve?: string;
  staff_name?: string;
  staff_email?: string;
  staff_id?: number;
};

export type JdRoute = {
  id?: number;
  unit_key: string;
  unit_label: string;
  match_pattern: string;
  steps: JdRouteStepDraft[];
  is_default: boolean;
  sort_order: number;
};
