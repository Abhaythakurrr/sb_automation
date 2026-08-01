/**
 * AI Operations Copilot (Beta) — frontend types.
 * Mirrors backend/src/copilot/types.ts.
 */

export type CopilotPageId =
  | 'home'
  | 'job-creation'
  | 'upload'
  | 'preview'
  | 'validation'
  | 'execution'
  | 'monitoring'
  | 'recovery'
  | 'job-deletion'
  | 'search'
  | 'adhoc-launch'
  | 'agent-control'
  | 'scheduling'
  | 'configuration'
  | 'logs'
  | 'dashboard';

export interface CopilotContext {
  page: CopilotPageId;
  step?: string;
  focus?: string;
  detail?: Record<string, unknown>;
}

export type Severity = 'error' | 'warning' | 'info' | 'success';

export interface CopilotFinding {
  id: string;
  severity: Severity;
  subject: string;
  message: string;
  fix?: string;
  rule: string;
  row?: number;
  field?: string;
}

export interface Citation {
  id: string;
  title: string;
  source?: string;
}

export type QuickActionKind =
  | 'open-page'
  | 'start-wizard'
  | 'analyze-upload'
  | 'explain-payload'
  | 'suggest-schedule'
  | 'ask'
  | 'autofill';

export interface QuickAction {
  action: QuickActionKind;
  label: string;
  arg?: string | Record<string, unknown>;
}

export interface CopilotAnswer {
  answer: string;
  citations: Citation[];
  findings: CopilotFinding[];
  actions: QuickAction[];
  /** Always 'grounded' — answers are assembled from the local knowledge base. */
  mode: 'grounded';
  outOfScope: boolean;
}

export interface PageGuidance {
  page: CopilotPageId;
  headline: string;
  tips: string[];
  prompts: string[];
  actions: QuickAction[];
  findings: CopilotFinding[];
}

export interface UploadAnalysis {
  rowCount: number;
  findings: CopilotFinding[];
  counts: { error: number; warning: number; info: number };
  readyToExecute: boolean;
  schedules: { name: string; summary: string }[];
  blockedJobs: string[];
  message?: string;
  impact?: { subject: string; lines: string[] };
}

export interface ScheduleInterpretation {
  understood: boolean;
  confidence: number;
  scheduleString: string;
  frequency: string;
  timezone?: string;
  endTime?: string;
  fields: Record<string, any>;
  summary: string;
  reasoning: string[];
  questions: string[];
  spreadsheetSupported: boolean;
  caveat?: string;
  examples?: string[];
}

// ── Inline Assistant ─────────────────────────────────────────────────────────

export type WizardFieldType = 'text' | 'choice' | 'time' | 'date' | 'number' | 'schedule';

export interface WizardField {
  key: string;
  question: string;
  type: WizardFieldType;
  required: boolean;
  help: string;
  options?: { value: string; label: string }[];
  examples?: string[];
  suggestion?: string;
  index: number;
  total: number;
}

export interface WizardSummary {
  row: Record<string, any>;
  task: Record<string, any>;
  trigger: Record<string, any>;
  scheduleSummary: string;
  findings: CopilotFinding[];
  lines: { label: string; value: string; optional: boolean }[];
}

export interface WizardStep {
  done: boolean;
  field: WizardField | null;
  error?: string;
  message: string;
  answers: Record<string, string>;
  summary?: WizardSummary;
}

export type WizardAction = 'start' | 'answer' | 'skip' | 'back' | 'cancel' | 'status';

// ── Health ───────────────────────────────────────────────────────────────────

export interface CopilotHealth {
  feature: string;
  status: 'operational' | 'disabled';
  beta: boolean;
  betaNote: string;
  knowledge: { chunks: number; endpoints: number; byKind: Record<string, number> };
  retrieval: { documents: number; strategy: string };
  warmUpMs?: number;
  /** The self-contained ML layer. No external model is involved. */
  ml: {
    selfContained: boolean;
    externalCalls: string;
    deterministic: string;
    models: {
      intent: { algorithm: string; trainingExamples: number; classes: number; vocabulary: number };
      schedulePattern: {
        algorithm: string; parameters: number; classes: number;
        trainAccuracy: number; heldOutAccuracy: number; finalLoss: number;
      };
      semanticIndex: { algorithm: string; documents: number; dimensions: number; vocabulary: number };
      answerComposer: { algorithm: string; note: string };
      anomalyDetection: { algorithm: string; note: string };
    };
  };
  activeSessions: number;
}

// ── Explanations ─────────────────────────────────────────────────────────────

export interface FieldExplanation {
  found: boolean;
  key: string;
  label: string;
  scope: string;
  text: string;
  value?: string;
}

export interface PayloadExplanation {
  name: string;
  scheduleSummary: string;
  fields: { key: string; label: string; value: string; why: string }[];
  destinations: { step: number; api: string; what: string }[];
  effects: string[];
  text: string;
}

export interface ErrorExplanation {
  matched: boolean;
  title: string;
  cause: string;
  fix: string;
  rule?: string;
  text: string;
}

// ── Feedback and runtime learning ────────────────────────────────────────────

export type TimeShape = 'interval' | 'absolute';
export type DayShape =
  | 'daily' | 'businessDays' | 'specificDays'
  | 'monthlyDay' | 'monthlyOrdinal' | 'everyNDays';

/** A label the Copilot can actually be corrected on. */
export interface ExpectedLabel {
  kind: 'timeShape' | 'dayShape' | 'intent';
  value: string;
}

export interface FeedbackResult {
  recorded: boolean;
  id: string;
  acknowledgement: string;
  /** True when the correction changed the live model, not just the ledger. */
  learned: boolean;
  changes?: {
    applied: boolean;
    before?: string;
    after?: string;
    reason: string;
    guard?: { timeBefore: number; timeAfter: number; dayBefore: number; dayAfter: number; cases: number };
  }[];
}

/** What the Copilot has learned since it was deployed. */
export interface CopilotScore {
  measured: boolean;
  weights: {
    loaded: boolean;
    version: number;
    generatedAt: string | null;
    parameters: number;
    reason: string;
    invariantCount: number;
  };
  metrics: Record<string, any> | null;
  runtimeLearning: {
    mechanism: string;
    shapeCorrections: number;
    intentExemplars: number;
    refused: number;
    stats: { applied: number; refused: number; rolledBack: number; replays: number };
    guardCases: number;
    guardAccuracy: { time: number; day: number } | null;
    persistedAt: string;
  };
  feedback: {
    total: number; up: number; down: number; disagreements: number;
    approval: number | null; learned: number; refused: number;
  };
}

/** A message in the Copilot conversation. */
export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
  citations?: Citation[];
  findings?: CopilotFinding[];
  actions?: QuickAction[];
  mode?: 'grounded';
  outOfScope?: boolean;
  /** Set while an assistant reply is in flight. */
  pending?: boolean;
  /** The question this reply answered, which is what a correction refers to. */
  question?: string;
  /** Local record of a verdict already given, so the control does not reset. */
  vote?: 'up' | 'down';
  /** What the backend said when it tried to learn from a correction. */
  feedbackNote?: string;
  /** True when a correction actually moved the model. */
  didLearn?: boolean;
}
