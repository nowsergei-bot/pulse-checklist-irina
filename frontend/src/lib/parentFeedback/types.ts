export type ParentFeedbackMetricStatus =
  | 'ok'
  | 'no_data'
  | 'suppressed'
  | 'not_comparable'
  | 'partial'
  | 'error';

export type ParentFeedbackWave = {
  waveId: string;
  academicYear: string;
  label: string;
  source: string;
  comparisonWaveId?: string;
};

export type ParentAnalyticsSnapshot = {
  schemaVersion: number;
  dataVersion: string;
  metricVersion: string;
  waveId: string;
  comparisonWaveId?: string;
  filters: { groupIds: string[]; sectionIds: string[] };
  counts: { responses: number; textResponses: number };
  capabilities: Record<string, boolean>;
};

export type ParentFeedbackTextInsightPayload = {
  source: 'heuristic' | 'gigachat' | 'llm_hybrid';
  question_id: number;
  question_text: string;
  answers_used: number;
  meaningful_count: number;
  heuristic_summary: string;
  top_terms: { word: string; count: number }[];
  top_mentions: { label: string; count: number }[];
  themes: { label: string; count: number }[];
  narrative: string | null;
  highlights: string[];
  recommendations: string[];
  normalized_samples: string[];
};

export type ParentFeedbackPresentationCopyPayload = {
  source: 'heuristic' | 'gigachat' | 'llm_hybrid';
  copy: {
    overview_note?: string;
    group_note?: string;
    voice?: Record<
      string,
      { praise?: string[]; improve?: string[]; footnote?: string }
    >;
    discussion?: { section: string; text: string }[];
    chart_notes?: Record<string, string>;
  } | null;
};
