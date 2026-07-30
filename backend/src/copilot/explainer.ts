/**
 * Explainability engine.
 *
 * Answers the five questions the Copilot promises about anything it generated:
 *   "What does this field mean?"
 *   "Why was this value generated?"
 *   "What will happen if I execute this?"
 *   "Which API will receive this payload?"
 *   "Which validation rule failed?"
 *
 * Every answer is derived from the field dictionary, the validation rules and
 * the actual payload — never guessed.
 */
import {
  lookupFieldWithAliases,
  FieldDoc,
  ALL_FIELD_DOCS,
} from './knowledge/fields';
import { VALIDATION_RULES, lookupRule, ValidationRule } from './knowledge/validation';
import { API_SPECS } from './knowledge/apis';
import { describeTriggerPayload } from './scheduleAssistant';
import { Finding, JobRowLike, PayloadSnapshot } from './types';

// ── Field explanation ────────────────────────────────────────────────────────

export interface FieldExplanation {
  found: boolean;
  key: string;
  label: string;
  scope: string;
  text: string;
  /** The concrete value in the payload, when one was supplied. */
  value?: string;
}

/**
 * Explains a single field, optionally in the context of a payload so the actual
 * value and the reason it holds that value can be included.
 */
export function explainField(
  name: string,
  opts: { scope?: FieldDoc['scope']; payload?: Record<string, any>; row?: JobRowLike } = {},
): FieldExplanation {
  const doc = lookupFieldWithAliases(name, opts.scope);
  if (!doc) {
    const suggestions = suggestFieldNames(name);
    return {
      found: false,
      key: name,
      label: name,
      scope: opts.scope || 'unknown',
      text: `"${name}" is not a field this application reads or generates.${suggestions.length ? ` Did you mean ${suggestions.join(', ')}?` : ''} Anything not on the UAC allow-list is dropped from the payload before it is sent.`,
    };
  }

  const value = opts.payload ? formatValue(opts.payload[doc.key]) : undefined;

  const parts: string[] = [];
  parts.push(`**${doc.label}** \`${doc.key}\` — ${doc.scope === 'input' ? 'spreadsheet column' : `${doc.scope} payload field`}${doc.required ? ', required' : ''}.`);
  parts.push(doc.meaning);
  if (value !== undefined && value !== '') {
    parts.push(`Current value: \`${value}\`.`);
  } else if (opts.payload) {
    parts.push('Not set in this payload, so it is omitted — empty values are stripped before the request is sent.');
  }
  if (doc.origin) parts.push(`How it gets set: ${doc.origin}`);
  if (doc.allowed?.length) parts.push(`Allowed values: ${doc.allowed.join(', ')}.`);
  if (doc.examples?.length) parts.push(`Examples: ${doc.examples.join(' · ')}.`);
  if (doc.note) parts.push(`Worth knowing: ${doc.note}`);

  // Rules that mention this field by name.
  const related = VALIDATION_RULES.filter(r =>
    r.rule.includes(doc.key) || r.title.toLowerCase().includes(doc.label.toLowerCase()));
  if (related.length) {
    parts.push(`Validation that applies: ${related.map(r => `${r.title} (${r.id})`).join('; ')}.`);
  }

  return {
    found: true,
    key: doc.key,
    label: doc.label,
    scope: doc.scope,
    value,
    text: parts.join('\n\n'),
  };
}

function suggestFieldNames(name: string): string[] {
  const needle = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (needle.length < 3) return [];
  return ALL_FIELD_DOCS
    .filter(f => {
      const k = f.key.toLowerCase().replace(/[^a-z0-9]/g, '');
      return k.includes(needle) || needle.includes(k);
    })
    .slice(0, 4)
    .map(f => `\`${f.key}\``);
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ── Payload explanation ──────────────────────────────────────────────────────

export interface PayloadExplanation {
  name: string;
  scheduleSummary: string;
  /** Field-by-field breakdown. */
  fields: { key: string; label: string; value: string; why: string }[];
  /** Which endpoints receive it, in order. */
  destinations: { step: number; api: string; what: string }[];
  /** What executing it will do. */
  effects: string[];
  text: string;
}

/** Explains a generated task+trigger pair field by field. */
export function explainPayload(snapshot: PayloadSnapshot): PayloadExplanation {
  const { name, task, trigger } = snapshot;

  const describe = (payload: Record<string, any>, scope: FieldDoc['scope']) =>
    Object.keys(payload).map(key => {
      const doc = lookupFieldWithAliases(key, scope);
      return {
        key,
        label: doc?.label || key,
        value: formatValue(payload[key]),
        why: doc?.origin || doc?.meaning || 'Passed through from the spreadsheet because the name matches a UAC field on the allow-list.',
      };
    });

  const taskFields = describe(task, 'task');
  const triggerFields = describe(trigger, 'trigger');

  const scheduleSummary = snapshot.summary || describeTriggerPayload(trigger);

  const createTask = API_SPECS.find(s => s.method === 'POST' && s.path === '/api/stonebranch/task');
  const createTrigger = API_SPECS.find(s => s.method === 'POST' && s.path === '/api/stonebranch/trigger');
  const enable = API_SPECS.find(s => s.path === '/api/stonebranch/triggers/enable');

  const destinations = [
    { step: 1, api: `POST ${createTask?.path}`, what: `Creates the task "${task.name}" of type ${task.type}. The backend forwards it to UAC's /resources/task endpoint.` },
    { step: 2, api: `POST ${createTrigger?.path}`, what: `Creates the time trigger "${trigger.name}" pointing at that task, disabled. Forwarded to UAC's /resources/trigger endpoint.` },
    { step: 3, api: `POST ${enable?.path}`, what: 'Only when you explicitly choose to enable, after verification. Until then the trigger never fires.' },
  ];

  const target = task.agentCluster
    ? `agent cluster ${task.agentCluster}`
    : task.agent
      ? `agent ${task.agent}`
      : 'no agent target — this will fail at launch';

  const effects = [
    `A task named ${task.name} is created in the UAC environment you are connected to, running on ${target}.`,
    task.command ? `It will execute: ${task.command}` : 'It has no command, so it will run and report success without doing any work.',
    `A trigger named ${trigger.name} is created, disabled. ${scheduleSummary}`,
    task.maxRunTime
      ? `Late Finish is on: an instance running longer than ${task.maxRunTime} minute(s) raises a Late Finish condition.`
      : 'No maximum runtime, so nothing will report an overrun.',
    task.retryMaximum === 0 || task.retryMaximum === undefined
      ? 'No automatic retry — a failure surfaces immediately rather than being hidden behind retries.'
      : `Up to ${task.retryMaximum} automatic retries, ${task.retryInterval ?? 60}s apart.`,
    'Nothing existing is modified. If the name already exists UAC rejects the create rather than overwriting it.',
  ];

  const renderFields = (list: typeof taskFields, heading: string) =>
    [`**${heading}**`, ...list.map(f => `- \`${f.key}\` = ${f.value || '(empty)'} — ${f.label}. ${f.why}`)].join('\n');

  const text = [
    `## ${name}`,
    `**Schedule:** ${scheduleSummary}`,
    renderFields(taskFields, `Task payload (${taskFields.length} fields)`),
    renderFields(triggerFields, `Trigger payload (${triggerFields.length} fields)`),
    '**Where it goes**',
    destinations.map(d => `${d.step}. ${d.api} — ${d.what}`).join('\n'),
    '**What executing this will do**',
    effects.map(e => `- ${e}`).join('\n'),
  ].join('\n\n');

  return {
    name,
    scheduleSummary,
    fields: [...taskFields, ...triggerFields],
    destinations,
    effects,
    text,
  };
}

// ── Error explanation ────────────────────────────────────────────────────────

export interface ErrorExplanation {
  matched: boolean;
  title: string;
  cause: string;
  fix: string;
  rule?: string;
  text: string;
}

/**
 * Known error signatures, matched against the message text. Each maps onto a
 * real cause in this codebase or in UAC's responses.
 */
const ERROR_SIGNATURES: {
  match: RegExp;
  title: string;
  cause: string;
  fix: string;
  rule?: string;
}[] = [
  {
    match: /time is required field for timestyle/i,
    title: 'UAC rejected the trigger: Absolute style with no time',
    cause: 'The trigger came out as timeStyle "Absolute" but no time could be parsed from the Job Starttime or Schedule String column, so UAC has no moment to fire at.',
    fix: 'Put a time in the Job Starttime column — 0800, 08:00 and "8 AM" all parse. Or state an interval instead, which uses timeInterval rather than a fixed time.',
    rule: 'schedule.absolute-needs-time',
  },
  {
    match: /session expired|SESSION_EXPIRED/i,
    title: 'Your session expired',
    cause: 'Sessions end after 15 minutes of inactivity, or 2 hours absolutely, and they are held in memory so a backend restart clears them.',
    fix: 'Reconnect from the home page. Work already committed to UAC is unaffected; anything mid-flight needs re-running.',
  },
  {
    match: /authorization required|401/i,
    title: 'Not authorised',
    cause: 'The request arrived without a valid session. Either you are not connected, or the session ended between page load and the request.',
    fix: 'Reconnect. If it happens immediately after connecting, check that the backend can reach the UAC base URL.',
  },
  {
    match: /already exists|duplicate|not unique/i,
    title: 'An object with that name already exists',
    cause: 'UAC refuses to create a task or trigger whose name is taken. It never overwrites.',
    fix: 'Look the name up in Search & Edit. If you meant to change the existing job, edit it there instead of creating. If it is a genuinely new job, pick a different name.',
    rule: 'duplicate.task_name_in_uac',
  },
  {
    match: /not allowed by cors/i,
    title: 'Blocked by CORS',
    cause: 'The browser origin is not on the backend allow-list. CORS_ORIGINS is an explicit list and does not default to a wildcard.',
    fix: 'Add the frontend origin to CORS_ORIGINS in the backend environment and restart it.',
  },
  {
    match: /too many requests|rate limit/i,
    title: 'Rate limited',
    cause: 'Limits are 200 requests per minute per IP globally, 30 per minute for uploads, and 10 per 15 minutes for connect attempts.',
    fix: 'Wait and retry. For bulk work, remember the execution queue already paces itself at 2 concurrent calls.',
  },
  {
    match: /file type|invalid file|unsupported/i,
    title: 'The upload was rejected',
    cause: 'The filename or the file content failed verification. Content is checked against the extension by magic bytes, so a renamed file is caught.',
    fix: 'Upload a genuine .xlsx, .xls, .ods or .csv file, under MAX_FILE_SIZE.',
    rule: 'upload.filename-and-content',
  },
  {
    match: /agent.*(not found|does not exist|invalid)/i,
    title: 'The agent could not be resolved',
    cause: 'The name in the agent column matched neither an agent nor an agent cluster in this UAC environment.',
    fix: 'Check the exact name in Agent Control. Names differ between environments, so a value that works in non-prod may not exist in prod.',
    rule: 'required.agent',
  },
  {
    match: /credential/i,
    title: 'Credential problem',
    cause: 'The named UAC credential does not exist in this environment, or is not permitted for this agent.',
    fix: 'Create or correct the credential in UAC first. This application references credentials, it does not create them.',
  },
  {
    match: /active instance|running instance|cannot be deleted/i,
    title: 'Deletion blocked by a running instance',
    cause: 'UAC will not delete a task that has active instances.',
    fix: 'Inspect the job to see the blocking instances. Force-finish one only after confirming it is genuinely stuck rather than legitimately running.',
    rule: 'deletion.active-instances-block',
  },
  {
    match: /skipbeforedate|skip before/i,
    title: 'UAC rejected the skip date',
    cause: 'skipBeforeDate is validated against the schedule frequency. A value that is not a real date, or that cannot occur under the frequency, is rejected.',
    fix: 'Put a real date in the Firstrun Date column, or leave it empty — empty means no skip fields are set at all.',
    rule: 'schedule.first-run-date-must-be-a-date',
  },
  {
    match: /econnrefused|enotfound|etimedout|network/i,
    title: 'The backend could not reach UAC',
    cause: 'A network-level failure talking to the controller: wrong base URL, DNS, firewall, or the controller is down.',
    fix: 'Check the base URL you connected with and that the backend host can reach it. This is a connectivity problem, not a payload problem.',
  },
];

/** Explains an error message in terms of this application's behaviour. */
export function explainError(message: string): ErrorExplanation {
  const text = String(message || '').trim();

  for (const sig of ERROR_SIGNATURES) {
    if (sig.match.test(text)) {
      const rule = sig.rule ? lookupRule(sig.rule) : undefined;
      return {
        matched: true,
        title: sig.title,
        cause: sig.cause,
        fix: sig.fix,
        rule: sig.rule,
        text: [
          `**${sig.title}**`,
          `What happened: ${sig.cause}`,
          `How to fix it: ${sig.fix}`,
          rule ? `Validation rule: ${rule.title} (\`${rule.id}\`), enforced by ${rule.enforcedBy}.` : '',
        ].filter(Boolean).join('\n\n'),
      };
    }
  }

  return {
    matched: false,
    title: 'Unrecognised error',
    cause: 'This message does not match a known failure signature in this application.',
    fix: 'Check the application and error logs under the configured log directory — they carry the full request context including the UAC response body.',
    text: [
      `I do not have a known cause for this message:`,
      `> ${text || '(empty message)'}`,
      `It does not match any failure signature in this application, so I will not guess at a cause.`,
      `The application and error logs under LOG_DIRECTORY carry the full request context, including UAC's own response body, which is where the real reason will be. If UAC returned the message, it is a controller-side rejection rather than something this application enforced.`,
    ].join('\n\n'),
  };
}

// ── Findings explanation ─────────────────────────────────────────────────────

/** Expands a finding into the full rule behind it. */
export function explainFinding(f: Finding): string {
  const rule: ValidationRule | undefined = lookupRule(f.rule);
  if (!rule) {
    return `${f.subject}: ${f.message}${f.fix ? `\n\nFix: ${f.fix}` : ''}`;
  }
  return [
    `**${rule.title}** — ${f.severity}`,
    `${f.subject}${f.field ? ` (field \`${f.field}\`${f.row ? `, row ${f.row}` : ''})` : ''}: ${f.message}`,
    `The rule: ${rule.rule}`,
    `Why it matters: ${rule.consequence}`,
    `Fix: ${f.fix || rule.fix}`,
    `Enforced by: ${rule.enforcedBy} (rule id \`${rule.id}\`).`,
  ].join('\n\n');
}

/** Which endpoint a given payload kind is sent to. */
export function explainDestination(kind: 'task' | 'trigger' | 'enable'): string {
  const spec = API_SPECS.find(s =>
    kind === 'task' ? s.path === '/api/stonebranch/task' && s.method === 'POST'
      : kind === 'trigger' ? s.path === '/api/stonebranch/trigger' && s.method === 'POST'
        : s.path === '/api/stonebranch/triggers/enable');
  if (!spec) return 'Unknown destination.';
  return `${spec.method} ${spec.path} — ${spec.purpose} From there the backend calls UAC over REST using your session's token; the browser never talks to UAC directly.`;
}
