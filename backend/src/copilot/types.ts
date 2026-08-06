/**
 * AI Operations Copilot (Beta) — shared types.
 *
 * The Copilot answers only from trusted application knowledge (the knowledge
 * base in ./knowledge) plus the caller's own session context (uploads, parsed
 * rows, generated payloads, execution results). It never invents Stonebranch
 * behaviour and never reaches outside these two sources.
 */

// ── Knowledge base ───────────────────────────────────────────────────────────

/** Every knowledge chunk belongs to exactly one kind, used for filtering. */
export type KnowledgeKind =
  | 'feature'      // a page / automation and what it does
  | 'workflow'     // an ordered procedure the user follows
  | 'api'          // a backend endpoint
  | 'field'        // an input field / payload field definition
  | 'validation'   // a validation or safety rule enforced by the code
  | 'scheduling'   // a scheduling option or schedule syntax
  | 'integration'  // Teams / ServiceNow / Power Automate / UAC
  | 'concept';     // background concept (task vs trigger, session model, …)

/** Page identifiers the Copilot understands. Mirrors the frontend surfaces. */
export type PageId =
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

export interface KnowledgeChunk {
  /** Stable unique id — also used for citations shown in the UI. */
  id: string;
  kind: KnowledgeKind;
  /** Short human title. */
  title: string;
  /** The body the retriever searches and the answer is grounded in. */
  body: string;
  /** Pages this chunk is most relevant to — boosts retrieval in context. */
  pages: PageId[];
  /** Extra search terms (synonyms, field aliases, UI labels). */
  keywords?: string[];
  /** Source of truth in the repo, shown so answers are auditable. */
  source?: string;
}

// ── Session context supplied by the frontend ─────────────────────────────────

/** What the user is looking at right now. */
export interface CopilotContext {
  page: PageId;
  /** Free-form label of the current step, e.g. 'preview', 'verify'. */
  step?: string;
  /** Name of the record in focus (task, trigger, agent, instance). */
  focus?: string;
  /** Arbitrary non-sensitive page state the page chooses to share. */
  detail?: Record<string, unknown>;
}

/** A parsed spreadsheet row — same shape as backend ExcelRow / frontend JobRow. */
export type JobRowLike = Record<string, any>;

export interface UploadSnapshot {
  filename: string;
  uploadedAt: string;
  rowCount: number;
  rows: JobRowLike[];
  /** Column headers actually present in the sheet. */
  columns: string[];
}

export interface PayloadSnapshot {
  name: string;
  task: Record<string, any>;
  trigger: Record<string, any>;
  /** Plain-English schedule summary produced by the app. */
  summary?: string;
}

export interface ExecutionSnapshot {
  name: string;
  type: 'task' | 'trigger';
  status: 'pending' | 'success' | 'failed';
  message?: string;
  at?: string;
}

// ── Findings — the output of every analyzer ──────────────────────────────────

export type Severity = 'error' | 'warning' | 'info' | 'success';

export interface Finding {
  id: string;
  severity: Severity;
  /** Which job / row / field the finding is about. */
  subject: string;
  /** What is wrong, in plain English. */
  message: string;
  /** How to fix it. */
  fix?: string;
  /** The rule that produced this finding, for traceability. */
  rule: string;
  /** Row index in the upload, when applicable. */
  row?: number;
  field?: string;
}

// ── Conversation ─────────────────────────────────────────────────────────────

export interface CopilotTurn {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

export interface Citation {
  id: string;
  title: string;
  source?: string;
}

export interface QuickAction {
  /** Machine-readable action the UI can run. */
  action:
    | 'open-page'
    | 'start-wizard'
    | 'analyze-upload'
    | 'explain-payload'
    | 'suggest-schedule'
    | 'ask'
    | 'autofill';
  label: string;
  /** Payload for the action (page id, prompt text, field values, …). */
  arg?: string | Record<string, unknown>;
}

export interface CopilotAnswer {
  answer: string;
  citations: Citation[];
  findings: Finding[];
  actions: QuickAction[];
  /** Always 'grounded' — answers are assembled from the local knowledge base. */
  mode: 'llm' | 'grounded';
  /** True when the question could not be answered from trusted sources. */
  outOfScope: boolean;
  /**
   * The steps taken to produce this answer, in order.
   *
   * Kept on the answer rather than only streamed, so the reasoning is still
   * inspectable after the fact — including on a reply that arrived while the user
   * was looking elsewhere.
   */
  trace?: {
    step: 'retrieve' | 'classify' | 'scope' | 'specialist' | 'compose' | 'done';
    label: string;
    detail?: string;
    ms: number;
  }[];
}

// ── Inline Assistant (wizard) ────────────────────────────────────────────────

export type WizardFieldType = 'text' | 'choice' | 'time' | 'date' | 'number' | 'schedule';

export interface WizardFieldSpec {
  /** Maps onto an ExcelRow / JobRow key. */
  key: string;
  /** The question the assistant asks. */
  question: string;
  type: WizardFieldType;
  required: boolean;
  /** Inline documentation shown next to the input. */
  help: string;
  /** Allowed values for 'choice' fields. */
  options?: { value: string; label: string }[];
  /** Example answers shown as hints. */
  examples?: string[];
  /** Skip this question when the predicate says it is not applicable. */
  appliesWhen?: (answers: Record<string, string>) => boolean;
  /** Value proposed from session memory / previous entries. */
  suggest?: (answers: Record<string, string>, memory: WizardMemoryHints) => string | undefined;
  /** Field-level validation. Return an error string to re-ask. */
  validate?: (value: string, answers: Record<string, string>) => string | undefined;
}

/** Values harvested from earlier work in the same session, used to auto-fill. */
export interface WizardMemoryHints {
  agents: string[];
  timezones: string[];
  credentials: string[];
  businessServices: string[];
  serviceNowGroups: string[];
  existingNames: string[];
}

export interface WizardState {
  active: boolean;
  /** Index into the resolved question list. */
  cursor: number;
  answers: Record<string, string>;
  /** Keys the user explicitly skipped. */
  skipped: string[];
  startedAt: string;
  completedAt?: string;
}

export interface WizardStep {
  done: boolean;
  /** The question to ask now — null when the wizard is finished. */
  field: (Omit<WizardFieldSpec, 'appliesWhen' | 'suggest' | 'validate'> & {
    suggestion?: string;
    index: number;
    total: number;
  }) | null;
  /** Validation error for the previous answer, if it was rejected. */
  error?: string;
  /** Assistant prose for this step. */
  message: string;
  /** Everything collected so far. */
  answers: Record<string, string>;
  /** Present once done — the assembled row plus payloads and findings. */
  summary?: {
    row: JobRowLike;
    task: Record<string, any>;
    trigger: Record<string, any>;
    scheduleSummary: string;
    findings: Finding[];
    lines: { label: string; value: string; optional: boolean }[];
  };
}

// ── Full per-session memory ──────────────────────────────────────────────────

export interface CopilotSession {
  id: string;
  createdAt: number;
  lastUsed: number;
  context: CopilotContext;
  upload: UploadSnapshot | null;
  payloads: PayloadSnapshot[];
  findings: Finding[];
  executions: ExecutionSnapshot[];
  turns: CopilotTurn[];
  wizard: WizardState;
  /** Free-form facts the user told the Copilot, e.g. preferred timezone. */
  facts: Record<string, string>;
}
