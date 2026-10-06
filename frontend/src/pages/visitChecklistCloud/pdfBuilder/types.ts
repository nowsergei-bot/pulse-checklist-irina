export const PDF_DOCUMENT_TYPE = 'visit-checklist-teacher-card' as const;

export type PdfBlockType =
  | 'teacher'
  | 'kpis'
  | 'profile'
  | 'compare'
  | 'observeSelf'
  | 'trend'
  | 'watchers'
  | 'coverage'
  | 'strengths'
  | 'slices'
  | 'sections'
  | 'narrative'
  | 'visits';

export type PdfEmptyPolicy = 'hide' | 'placeholder';
export type PdfWidth = 'full' | 'half';
export type PdfDensity = 'normal' | 'compact';
export type PdfCompareMode = 'none' | 'department' | 'school';
export type PdfVisitDetail = 'short' | 'detailed';
export type PdfProfileChart = 'auto' | 'radar' | 'bars';

export type PdfBlockOptions = {
  emptyPolicy: PdfEmptyPolicy;
  density: PdfDensity;
  compareMode?: PdfCompareMode;
  visitDetail?: PdfVisitDetail;
  profileChart?: PdfProfileChart;
};

export type PdfTemplateBlock = {
  id: string;
  type: PdfBlockType;
  enabled: boolean;
  width: PdfWidth;
  breakBefore: boolean;
  options: PdfBlockOptions;
};

export type CardPdfTemplate = {
  schemaVersion: 1;
  documentType: typeof PDF_DOCUMENT_TYPE;
  page: { format: 'A4'; orientation: 'portrait'; marginMm: number };
  blocks: PdfTemplateBlock[];
};

export type PdfCardStatus = 'draft' | 'agreed' | 'published';

export type TeacherCardPdfKpi = {
  scorePct: number | null;
  visitCount: number | null;
  observeCount: number | null;
  selfCount: number | null;
  lastVisit: string | null;
};

export type TeacherCardPdfSection = {
  code: string;
  title: string;
  earned: number | null;
  max: number | null;
  fillPct: number | null;
};

export type TeacherCardPdfVisitItem = {
  code: string;
  title: string;
  earned: number;
  max: number;
  unanswered: boolean;
};

export type TeacherCardPdfVisit = {
  id: string;
  date: string;
  subject: string;
  className: string;
  visitor: string;
  format: string;
  summary: string;
  recommendations: string;
  earned: number;
  max: number;
  sections: Array<{
    title: string;
    earned: number;
    max: number;
    items: TeacherCardPdfVisitItem[];
  }>;
};

export type TeacherCardPdfModel = {
  teacherName: string;
  initials: string;
  department: string;
  projectTitle: string;
  generatedAt: string;
  status: PdfCardStatus;
  statusLabel: string;
  photoKey: 'photo' | null;
  photoWarning: string | null;
  kpis: TeacherCardPdfKpi;
  sections: TeacherCardPdfSection[];
  compare: {
    available: { department: boolean; school: boolean };
    mode: PdfCompareMode;
    cohortLabel: string;
    cohortSize: number;
    teacherPct: number | null;
    cohortPct: number | null;
    rows: Array<{ title: string; teacher: number | null; cohort: number | null }>;
  };
  observeSelf: {
    observePct: number | null;
    selfPct: number | null;
    observeCount: number;
    selfCount: number;
  };
  trend: { points: Array<{ date: string; scorePct: number }>; insufficient: boolean };
  watchers: { visitors: Array<{ name: string; count: number }>; offline: number; online: number; self: number };
  coverage: { scored: number; explicitZero: number; unanswered: number; total: number };
  strengths: Array<{ title: string; scorePct: number; note: string }>;
  growth: Array<{ title: string; scorePct: number; note: string }>;
  bySubject: Array<{ name: string; visits: number; scorePct: number }>;
  byClass: Array<{ name: string; visits: number; scorePct: number }>;
  narrative: { title: string; body: string; source: string | null };
  visits: TeacherCardPdfVisit[];
  singleVisitCaution: boolean;
  loadErrors: string[];
};

export type PdfColor = [number, number, number];

export type PdfOp =
  | { t: 'text'; x: number; y: number; s: string; font: 'body' | 'head'; size: number; bold?: boolean; color: PdfColor }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: PdfColor; stroke?: PdfColor; lw?: number; r?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: PdfColor; lw: number }
  | { t: 'poly'; pts: Array<[number, number]>; stroke?: PdfColor; fill?: PdfColor; lw?: number; close?: boolean }
  | { t: 'image'; x: number; y: number; w: number; h: number; key: 'photo' };

export type PdfPageLayout = {
  index: number;
  width: number;
  height: number;
  ops: PdfOp[];
};

export type TeacherCardPdfLayout = {
  pages: PdfPageLayout[];
  warnings: string[];
  unknownBlocks: string[];
};

export type PdfFontMetrics = {
  width: (text: string, size: number, font: 'body' | 'head', bold: boolean) => number;
  wrap: (text: string, size: number, font: 'body' | 'head', bold: boolean, maxW: number) => string[];
  line: (size: number) => number;
};
