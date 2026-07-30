'use client';
/**
 * One-click explanation affordances.
 *
 * Drop these next to an error message, a field label or a payload and the user
 * gets the Copilot's explanation without composing a question. They render
 * nothing when the Copilot is disabled, so pages can use them unconditionally.
 */
import { useCopilotStore } from '@/store/useCopilotStore';

const CHIP = {
  background: 'rgba(6,182,212,0.06)',
  border: '1px solid rgba(6,182,212,0.18)',
  color: '#67e8f9',
} as const;

function SparkIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

/** Explains an error message in terms of what this application does. */
export function ExplainError({ message, label = 'Explain this error' }: { message: string; label?: string }) {
  const { enabled, explainError } = useCopilotStore();
  if (!enabled || !message) return null;

  return (
    <button
      onClick={() => explainError(message)}
      title="Ask the AI Operations Copilot what this means"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold transition-all hover:brightness-125"
      style={CHIP}
    >
      <SparkIcon />
      {label}
    </button>
  );
}

/** Inline documentation for a single input or payload field. */
export function ExplainField({
  field,
  payload,
  label,
}: {
  field: string;
  payload?: { task?: any; trigger?: any };
  label?: string;
}) {
  const { enabled, explainField } = useCopilotStore();
  if (!enabled || !field) return null;

  return (
    <button
      onClick={() => explainField(field, payload)}
      title={`What does ${field} mean?`}
      className="inline-flex items-center gap-1 text-[9px] text-slate-600 hover:text-cyan-400 transition-colors"
    >
      <SparkIcon className="w-2.5 h-2.5" />
      {label || 'explain'}
    </button>
  );
}

/** Explains a generated payload field by field. */
export function ExplainPayload({
  name,
  payload,
  label = 'Explain this payload',
}: {
  name?: string;
  payload?: { name?: string; task?: any; trigger?: any };
  label?: string;
}) {
  const { enabled, explainPayload } = useCopilotStore();
  if (!enabled) return null;

  return (
    <button
      onClick={() => explainPayload(name, payload)}
      title="Ask the Copilot what every field means and where this goes"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold transition-all hover:brightness-125"
      style={CHIP}
    >
      <SparkIcon />
      {label}
    </button>
  );
}

/** Asks a fixed question — useful for page-specific guidance buttons. */
export function AskCopilot({ question, label }: { question: string; label?: string }) {
  const { enabled, ask } = useCopilotStore();
  if (!enabled) return null;

  return (
    <button
      onClick={() => ask(question)}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold transition-all hover:brightness-125"
      style={CHIP}
    >
      <SparkIcon />
      {label || question}
    </button>
  );
}
