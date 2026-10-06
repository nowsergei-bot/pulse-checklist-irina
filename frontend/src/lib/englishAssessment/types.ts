export type EaCapabilities = {
  access: boolean;
  manage: boolean;
  import: boolean;
  viewAll: boolean;
  audit: boolean;
  contingent?: boolean;
  roster?: boolean;
  specIssues?: boolean;
  scoreAll?: boolean;
  viewDepartmentAnalytics?: boolean;
  canManageAnalyticsScope?: boolean;
  teacherRatingView?: boolean;
  teacherRatingExport?: boolean;
  role: string;
};

export function seesEaDepartmentAnalytics(caps?: EaCapabilities | null) {
  return Boolean(caps?.viewAll || caps?.viewDepartmentAnalytics);
}

export type EaImportError = {
  row_no: number;
  code: string;
  message: string;
};

export type EaImportRow = {
  row_no: number;
  full_name: string;
  normalized_full_name: string;
  class_display: string;
  class_normalized: string;
  parallel: number | null;
  birth_date: string | null;
  sex: 'm' | 'f' | 'unknown';
  errors: { code: string; message: string }[];
};

export type EaImportPreview = {
  missing_headers: string[];
  rows: EaImportRow[];
  errors: EaImportError[];
  summary: {
    total: number;
    error_rows: number;
    classes: number;
    large_classes: { code: string; count: number; large: boolean }[];
    needs_large_class_confirm: boolean;
  };
  class_summary: { code: string; count: number; large: boolean }[];
  thresholds: { warn: number; confirm: number };
};

export type EaDirectoryStudent = {
  id: number;
  public_id?: string;
  full_name: string;
  birth_date: string | null;
  sex: string;
  campus?: string;
  class_label: string | null;
};

export type EaDirectoryClass = {
  id: number;
  code_display: string;
  code_normalized: string;
  parallel: number | null;
  student_count: number;
};

export type EaDirectoryTeacher = {
  id: number;
  full_name: string;
  initials?: string | null;
  native_name?: string | null;
};

export type EaAcademicYear = {
  id: number;
  label: string;
  is_current?: boolean;
};

export type EaDirectoryGroup = {
  id: number;
  title: string;
  code: string | null;
  parallel: number | null;
  campus: string;
  class_id?: number | null;
  class_label?: string | null;
  student_count: number;
  teachers: EaDirectoryTeacher[];
};

export type EaTeacherListItem = EaDirectoryTeacher & {
  group_count: number;
  student_count: number;
};

export type EaStudentCard = {
  student: {
    id: number;
    public_id: string;
    full_name: string;
    birth_date: string | null;
    sex: string;
    campus: string;
    class: { id: number; code_display: string; parallel: number | null } | null;
  };
  groups: EaDirectoryGroup[];
  history: EaScoreRow[];
};

export type EaTeacherCard = {
  teacher: EaDirectoryTeacher;
  groups: (Omit<EaDirectoryGroup, 'teachers'> & { student_count: number })[];
  note?: string;
};

export type EaMe = {
  teacher: EaDirectoryTeacher | null;
  groups: (Omit<EaDirectoryGroup, 'teachers'> & {
    student_count: number;
    teachers?: EaDirectoryTeacher[];
    teacher_label?: string;
    latest_result?: {
      held_on: string | null;
      mode: 'placement' | 'section';
      section_code?: string | null;
      section_title?: string | null;
      work_type?: string | null;
      label: string;
      complete: number;
      absent: number;
      incomplete: number;
      updated_at?: string | null;
    } | null;
  })[];
  year?: EaAcademicYear | null;
  years?: EaAcademicYear[];
  capabilities?: EaCapabilities;
  analytics_scope?: {
    mode: 'teachers' | 'three';
    can_manage?: boolean;
  };
  activity?: EaActivityEvent[];
  note?: string;
};

export type EaActivityEvent = {
  id: number | null;
  action: string;
  actor_email: string;
  title: string;
  body: string;
  href: string;
  payload?: Record<string, unknown>;
  created_at: string | null;
};

export type EaSection = {
  code: string;
  title: string;
  title_en: string;
  sort_order: number;
  default_max: number;
};

export type EaWorkType = {
  code: string;
  title: string;
};

export type EaScoreStatus = 'complete' | 'incomplete' | 'absent';

export type EaScoreRow = {
  student_id: number;
  public_id?: string | null;
  full_name: string;
  score: number | null;
  status: EaScoreStatus;
  percent: number | null;
  held_on?: string | null;
  section_code?: string | null;
  section_title?: string | null;
  group_title?: string | null;
  work_type?: string | null;
  max_score?: number | null;
};

export type EaScoreSummary = {
  complete: number;
  incomplete: number;
  absent: number;
  counted: number;
  students_scored?: number;
  mean: number | null;
  median: number | null;
  min?: number | null;
  max?: number | null;
};

export type EaScoreSession = {
  id: number | null;
  held_on: string | null;
  section_code: string;
  max_score: number;
  work_type: string;
  created_at?: string | null;
  updated_at?: string | null;
  edit_locked?: boolean;
  edit_locked_until?: string | null;
  edit_lock_remaining_ms?: number | null;
  edit_lock_bypass?: boolean;
  section_title?: string;
  complete?: number;
  absent?: number;
  incomplete?: number;
};

export type EaEditLock = {
  edit_locked?: boolean;
  edit_locked_until?: string | null;
  edit_lock_remaining_ms?: number | null;
  edit_lock_bypass?: boolean;
  created_at?: string | null;
};

export type EaPlacementField = {
  id: string;
  section: string;
  section_code: string | null;
  excel_label: string;
  source_ref?: string | null;
  focus?: string | null;
  max_score: number | null;
  proposed_max_score: number | null;
  effective_max: number | null;
  proposed: boolean;
  approved_max: boolean;
};

export type EaPlacementApproval = {
  status: string;
  stale: boolean;
  official: boolean;
  proposed_max_confirmed: boolean;
  approved_by?: number | null;
  approved_at?: string | null;
  note?: string | null;
};

export type EaPlacementSpec = {
  id: string;
  grade: number;
  academic_year: string;
  variant: string | null;
  variant_basis?: string | null;
  source_file: string;
  source_kind?: string | null;
  source_sha256?: string | null;
  uploaded?: boolean;
  uploaded_at?: string | null;
  uploaded_filename?: string | null;
  status: string;
  official: boolean;
  approval: EaPlacementApproval;
  source_total_max: number | null;
  proposed_total_max: number | null;
  total_max: number | null;
  total_max_proposed: boolean;
  total_max_basis?: string | null;
  excel_label_policy?: string | null;
  thresholds: null;
  group_scope?: string | null;
  requires_proposed_max_decision: boolean;
  issues: string[];
  fields: EaPlacementField[];
  sections: {
    code: string;
    title: string;
    title_en: string;
    max: number;
    proposed: boolean;
    approved: boolean;
    field_ids: string[];
  }[];
  excel_columns: { field_id: string; excel_label: string; section: string; effective_max: number | null }[];
};

export type EaPlacementCatalog = {
  schema_version: string;
  academic_year: string;
  status: string;
  approval_role: string;
  excluded_grades: number[];
  bundled_excluded_grades?: number[];
  grades: number[];
  speaking_included: boolean;
  thresholds: null;
};

export type EaPlacementFieldScore = {
  field_id: string;
  excel_label: string;
  section: string;
  score: number | null;
  status: EaScoreStatus;
  percent: number | null;
};

export type EaPlacementRow = {
  student_id: number;
  public_id?: string | null;
  full_name: string;
  status: EaScoreStatus;
  fields: EaPlacementFieldScore[];
  section_scores: {
    section_code: string;
    section: string;
    score: number | null;
    max: number;
    status: string;
    percent: number | null;
  }[];
  total_score: number | null;
  total_max: number | null;
  percent: number | null;
};

export type EaPlacementSheet = {
  group: Omit<EaDirectoryGroup, 'teachers'>;
  spec: EaPlacementSpec | null;
  excluded?: boolean;
  scope?: { ok: boolean; reason?: string | null; message?: string };
  session: (EaEditLock & {
    id: number | null;
    spec_id: string;
    held_on: string | null;
    updated_at?: string | null;
  }) | null;
  students: EaDirectoryStudent[];
  rows: EaPlacementRow[];
  can_write?: boolean;
};

export type EaGroupCard = {
  year?: { id: number; label: string } | null;
  group: Omit<EaDirectoryGroup, 'teachers'> & { student_count?: number };
  students: EaDirectoryStudent[];
  sessions: EaScoreSession[];
  sections: EaSection[];
  work_types: EaWorkType[];
  can_write?: boolean;
  can_edit_roster?: boolean;
  placement?: EaPlacementSpec | null;
  placement_excluded?: boolean;
};

export type EaGroupScores = {
  group: Omit<EaDirectoryGroup, 'teachers'>;
  session: EaScoreSession | null;
  rows: EaScoreRow[];
  sections: EaSection[];
  work_types: EaWorkType[];
  summary: EaScoreSummary;
};

export type EaDashboardGroup = Omit<EaDirectoryGroup, 'teachers'> &
  EaScoreSummary & {
    teachers?: EaDirectoryTeacher[];
    teacher_label?: string;
    student_count?: number;
    level_code?: string | null;
    level_label?: string | null;
    zone?: EaTrafficZone | null;
    sections: (EaSection & EaScoreSummary & { zone?: EaTrafficZone | null })[];
  };

export type EaTrafficZone = 'green' | 'yellow' | 'red' | 'risk';

export type EaDashboardStudent = {
  student_id: number;
  public_id?: string | null;
  full_name: string;
  group_id: number;
  group_title: string;
  teacher_label?: string;
  teachers?: EaDirectoryTeacher[];
  parallel: number | null;
  campus?: string;
  level_code?: string;
  level_label?: string;
  mean: number | null;
  complete_sections: number;
  total_score?: number | null;
  total_max?: number | null;
  place?: number | null;
  place_in_group?: number | null;
  place_in_parallel?: number | null;
  zone?: EaTrafficZone | null;
  sections: {
    code: string;
    title: string;
    title_en: string;
    percent: number | null;
    status: string;
    score: number | null;
    zone?: EaTrafficZone | null;
  }[];
};

export type EaTaskStat = {
  field_id: string;
  label: string;
  section?: string | null;
  section_code?: string | null;
  mean: number;
  counted: number;
  zone?: EaTrafficZone | null;
  group_id?: number | null;
  group_title?: string | null;
  parallel?: number | null;
  source?: string;
};

export type EaDashboard = {
  year?: { id: number; label: string } | null;
  summary: EaScoreSummary & { zone?: EaTrafficZone | null };
  completeness?: {
    complete: number;
    incomplete: number;
    absent: number;
    total: number;
    complete_pct: number | null;
    groups_with_scores: number;
    groups_total: number;
  };
  parallels: {
    parallel: number | null;
    counted: number;
    mean: number | null;
    median: number | null;
    group_count?: number;
    student_count?: number;
    zone?: EaTrafficZone | null;
    sections?: (EaSection & EaScoreSummary & { zone?: EaTrafficZone | null })[];
  }[];
  levels?: {
    level_code: string;
    level_label: string;
    group_count: number;
    counted: number;
    mean: number | null;
    median: number | null;
  }[];
  groups: EaDashboardGroup[];
  sections: (EaSection & EaScoreSummary & { zone?: EaTrafficZone | null })[];
  work_types?: (EaWorkType & EaScoreSummary & { zone?: EaTrafficZone | null })[];
  distribution?: { key: string; label: string; count: number }[];
  trends?: (EaScoreSummary & { held_on: string | null })[];
  sessions?: (EaScoreSummary & {
    key: string;
    held_on: string | null;
    group_id: number | null;
    group_title: string | null;
    section_code: string | null;
    section_title: string | null;
    work_type?: string | null;
  })[];
  filters?: {
    parallel: number | null;
    level: string | null;
    group_id: number | null;
    bucket: string | null;
  };
  students?: EaDashboardStudent[] | null;
  ranking?: {
    zone_counts: { green: number; yellow: number; red: number; risk: number; empty: number };
    by_group: {
      group_id: number;
      group_title: string;
      parallel: number | null;
      zone_counts: { green: number; yellow: number; red: number; risk: number; empty: number };
      students: EaDashboardStudent[];
    }[];
    by_parallel: {
      parallel: number | null;
      zone_counts: { green: number; yellow: number; red: number; risk: number; empty: number };
      students: EaDashboardStudent[];
    }[];
  };
  tasks?: {
    highest: EaTaskStat[];
    lowest: EaTaskStat[];
    all?: EaTaskStat[];
    by_group?: (EaTaskStat & { highest?: EaTaskStat[]; lowest?: EaTaskStat[]; tasks?: EaTaskStat[] })[];
    by_parallel?: { parallel: number | null; highest: EaTaskStat[]; lowest: EaTaskStat[]; tasks?: EaTaskStat[] }[];
    source?: string;
  };
  section_matrix?: {
    overall: (EaSection & EaScoreSummary & { zone?: EaTrafficZone | null })[];
    by_group: {
      group_id: number;
      group_title: string;
      parallel: number | null;
      mean: number | null;
      zone?: EaTrafficZone | null;
      sections: (EaSection & EaScoreSummary & { zone?: EaTrafficZone | null })[];
    }[];
    by_parallel: {
      parallel: number | null;
      mean: number | null;
      zone?: EaTrafficZone | null;
      sections: (EaSection & EaScoreSummary & { zone?: EaTrafficZone | null })[];
    }[];
  };
  traffic?: {
    green_min: number;
    yellow_min: number;
    red_min: number;
    labels: Record<EaTrafficZone, string>;
  };
  note?: string;
};

export type EaRatingBand = 'above' | 'typical' | 'below';

export type EaRatingSection = {
  code: string;
  title: string;
  title_en?: string;
  mean: number | null;
  counted: number;
};

export type EaRatingTeacher = {
  id: number;
  full_name: string;
  initials?: string | null;
  short_name: string;
  place: number | null;
  eligible: boolean;
  status: 'ranked' | 'insufficient';
  band: EaRatingBand;
  composite: number | null;
  components: {
    residual: number | null;
    mean: number | null;
    completeness: number | null;
    balance: number | null;
  };
  mean: number | null;
  median: number | null;
  expected: number | null;
  residual: number | null;
  completeness: number | null;
  balance: number | null;
  counted: number;
  complete: number;
  incomplete: number;
  absent: number;
  students: number;
  groups: number;
  stdev: number | null;
  risk_share: number | null;
  mastery_share: number | null;
  distribution: Record<string, number>;
  sections: EaRatingSection[];
  quartiles: { min: number | null; q1: number | null; median: number | null; q3: number | null; max: number | null };
  levels: Record<string, number>;
  parallels: { parallel: number | null; mean: number | null; counted: number }[];
  trends: { held_on: string; mean: number | null; counted: number }[];
};

export type EaTeacherRating = {
  methodology_approved: boolean;
  places_published: boolean;
  message: string;
  can_export?: boolean;
  methodology?: {
    id: string;
    title: string;
    period: string;
    unit: string;
    speaking: string;
    co_teaching: string;
    ranking: string;
    eligibility: { min_complete: number; min_students: number; note: string };
    expected: { cell: string; min_cell: number; fallback: string };
    residual_window: number;
    weights: { residual: number; mean: number; completeness: number; balance: number };
    components: { key: string; weight: number; title: string; detail: string }[];
    bands: { key: string; label: string; rule: string }[];
  };
  year?: EaAcademicYear | null;
  department?: {
    mean: number | null;
    counted: number;
    teachers_ranked: number;
    teachers_total: number;
    completeness: number | null;
    sections: EaRatingSection[];
  };
  teachers?: EaRatingTeacher[];
  charts?: {
    ranking: Array<{
      teacher_id: number;
      name: string;
      full_name: string;
      place: number | null;
      composite: number | null;
      mean: number | null;
      residual: number | null;
      band: EaRatingBand;
    }>;
    scatter: Array<{
      teacher_id: number;
      name: string;
      mean: number | null;
      residual: number | null;
      completeness: number | null;
      counted: number;
      students: number;
      band: EaRatingBand;
    }>;
    completeness: Array<{
      teacher_id: number;
      name: string;
      completeness: number | null;
      counted: number;
      incomplete: number;
      absent: number;
    }>;
    distribution: Array<Record<string, string | number>>;
    heatmap: {
      teachers: { id: number; name: string }[];
      sections: { code: string; title: string }[];
      cells: (number | null)[][];
    };
    radar: Array<Record<string, string | number | null>>;
    radar_dept: Record<string, string | number | null>;
    trends: {
      dates: string[];
      series: { teacher_id: number; name: string; points: { held_on: string; mean: number | null; counted: number }[] }[];
    };
    quartiles: Array<{
      teacher_id: number;
      name: string;
      min: number | null;
      q1: number | null;
      median: number | null;
      q3: number | null;
      max: number | null;
      stdev: number | null;
    }>;
    levels: Array<Record<string, string | number>>;
    level_keys: string[];
    parallels: {
      teachers: { id: number; name: string }[];
      parallels: string[];
      cells: (number | null)[][];
    };
    bands: { key: string; label: string; count: number }[];
    residual: Array<{ teacher_id: number; name: string; residual: number | null; band: EaRatingBand }>;
  };
};
