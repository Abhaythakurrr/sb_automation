'use client';
/**
 * Per-answer feedback, and the correction affordance behind it.
 *
 * WHY A THUMBS-DOWN OPENS A PICKER
 *
 * A bare down-vote cannot teach the model anything — it says an answer was wrong
 * without saying what right would have been. So the down-vote reveals the two
 * things the Copilot can actually be corrected on: how often the job should run,
 * and which days it should run on. Those map onto the two classifier heads, which
 * is why they are the only structured options offered; anything else goes in the
 * free-text box and lands in the ledger for a human to read.
 *
 * WHY THE ACKNOWLEDGEMENT IS SHOWN VERBATIM
 *
 * The backend applies a correction to the live network and then re-checks several
 * hundred schedules it already read correctly, rolling the change back if any of
 * them break. So "I have learned that" and "I could not learn that without
 * breaking other schedules" are both real outcomes, and which one happened is
 * genuinely useful to the person who just typed the correction. Replacing either
 * with a generic "thanks for the feedback" would be throwing away the only part
 * of this interaction that carries information.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCopilotStore } from '@/store/useCopilotStore';
import { CopilotMessage, ExpectedLabel } from '@/types/copilot';
import { playHover, playClick } from '@/utils/soundEffects';

const spring = { type: 'spring' as const, damping: 26, stiffness: 320 };

/** The two dimensions the schedule classifier predicts, in plain words. */
const TIME_CHOICES: { value: string; label: string }[] = [
  { value: 'interval', label: 'Repeats on an interval' },
  { value: 'absolute', label: 'Once, at a set time' },
];

const DAY_CHOICES: { value: string; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'businessDays', label: 'Business days' },
  { value: 'specificDays', label: 'Chosen weekdays' },
  { value: 'monthlyDay', label: 'A day of the month' },
  { value: 'monthlyOrdinal', label: 'Nth weekday of the month' },
  { value: 'everyNDays', label: 'Every N days' },
];

function ThumbIcon({ up, filled }: { up: boolean; filled: boolean }) {
  return (
    <svg
      className="w-3.5 h-3.5"
      style={{ transform: up ? undefined : 'rotate(180deg)' }}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M7 11l3-8a2 2 0 012 0l0 0a2 2 0 011 1.8V9h4.6a2 2 0 012 2.4l-1.4 6A2 2 0 0116.2 19H7m0-8v8m0-8H5a1 1 0 00-1 1v6a1 1 0 001 1h2" />
    </svg>
  );
}

export default function MessageFeedback({ msg }: { msg: CopilotMessage }) {
  const { sendFeedback } = useCopilotStore();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [time, setTime] = useState<string>('');
  const [day, setDay] = useState<string>('');
  const [sending, setSending] = useState(false);

  const voted = msg.vote;

  const submitCorrection = async () => {
    const expected: ExpectedLabel[] = [];
    if (time) expected.push({ kind: 'timeShape', value: time });
    if (day) expected.push({ kind: 'dayShape', value: day });
    if (expected.length === 0 && !note.trim()) return;

    setSending(true);
    await sendFeedback(msg.id, 'down', {
      correction: note.trim() || undefined,
      expected: expected.length ? expected : undefined,
    });
    setSending(false);
    setOpen(false);
    setNote(''); setTime(''); setDay('');
  };

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1">
        <button
          onMouseEnter={playHover}
          onClick={() => sendFeedback(msg.id, 'up')}
          disabled={!!voted}
          title="This answer was right"
          aria-label="Helpful"
          className="p-1 rounded-md transition-colors disabled:cursor-default"
          style={{ color: voted === 'up' ? '#6ee7b7' : 'rgba(100,116,139,0.9)' }}
        >
          <ThumbIcon up filled={voted === 'up'} />
        </button>

        <button
          onMouseEnter={playHover}
          onClick={() => { playClick(); setOpen(v => !v); }}
          title="This was not right — tell me what it should have been"
          aria-label="Not helpful"
          aria-expanded={open}
          className="p-1 rounded-md transition-colors"
          style={{ color: voted === 'down' ? '#fca5a5' : 'rgba(100,116,139,0.9)' }}
        >
          <ThumbIcon up={false} filled={voted === 'down'} />
        </button>

        {/* The outcome, in the Copilot's own words. */}
        {msg.feedbackNote && (
          <motion.span
            initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={spring}
            className="text-[8.5px] leading-snug flex-1 min-w-0"
            style={{ color: msg.didLearn ? '#6ee7b7' : '#94a3b8' }}
          >
            {msg.didLearn && (
              <span className="font-black tracking-[0.08em] mr-1">LEARNED</span>
            )}
            {msg.feedbackNote}
          </motion.span>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2 rounded-xl px-2.5 py-2.5"
              style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.16)' }}>
              <p className="text-[9px] text-slate-400 leading-relaxed">
                What should it have been? Pick a shape and I will retrain on it now — or just describe it and
                I will log it for review.
              </p>

              <div className="space-y-1">
                <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.14em]">How often</p>
                <div className="flex flex-wrap gap-1">
                  {TIME_CHOICES.map(c => (
                    <button
                      key={c.value}
                      onMouseEnter={playHover}
                      onClick={() => setTime(time === c.value ? '' : c.value)}
                      className="px-1.5 py-[3px] rounded-md text-[8.5px] font-bold transition-all"
                      style={time === c.value ? {
                        background: 'linear-gradient(135deg, rgba(34,211,238,0.20), rgba(139,92,246,0.14))',
                        border: '1px solid rgba(34,211,238,0.40)', color: '#cffafe',
                      } : {
                        background: 'rgba(148,163,184,0.06)',
                        border: '1px solid rgba(148,163,184,0.14)', color: '#94a3b8',
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.14em]">Which days</p>
                <div className="flex flex-wrap gap-1">
                  {DAY_CHOICES.map(c => (
                    <button
                      key={c.value}
                      onMouseEnter={playHover}
                      onClick={() => setDay(day === c.value ? '' : c.value)}
                      className="px-1.5 py-[3px] rounded-md text-[8.5px] font-bold transition-all"
                      style={day === c.value ? {
                        background: 'linear-gradient(135deg, rgba(34,211,238,0.20), rgba(139,92,246,0.14))',
                        border: '1px solid rgba(34,211,238,0.40)', color: '#cffafe',
                      } : {
                        background: 'rgba(148,163,184,0.06)',
                        border: '1px solid rgba(148,163,184,0.14)', color: '#94a3b8',
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitCorrection(); } }}
                placeholder="Or describe what was wrong…"
                aria-label="Describe the correction"
                className="lq-input w-full px-2.5 py-1.5 rounded-lg text-[10px]"
              />

              <div className="flex items-center gap-1.5">
                <button
                  onMouseEnter={playHover}
                  onClick={submitCorrection}
                  disabled={sending || (!time && !day && !note.trim())}
                  className="lq-btn px-2.5 py-1.5 rounded-lg text-[9px] font-bold"
                >
                  {sending ? 'Retraining…' : time || day ? 'Correct and retrain' : 'Send correction'}
                </button>
                <button
                  onMouseEnter={playHover}
                  onClick={() => { setOpen(false); setNote(''); setTime(''); setDay(''); }}
                  className="text-[9px] text-slate-600 hover:text-slate-300 transition-colors px-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
