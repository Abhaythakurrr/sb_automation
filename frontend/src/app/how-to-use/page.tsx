'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SCHEDULE_TYPES = [
  {
    id: 'daily',
    title: 'Daily Single Run',
    icon: '☀️',
    desc: 'Runs once per day at a specific time',
    example: { starttime: '18:00', timezone: 'America/New_York', frequency: 'Daily', endtime: '' },
    tip: 'No end time needed — runs once and done.',
  },
  {
    id: 'weekdays',
    title: 'Business Days Only',
    icon: '💼',
    desc: 'Runs Mon-Fri, once per day',
    example: { starttime: '07:00', timezone: 'Asia/Kolkata', frequency: 'Weekdays', endtime: '' },
    tip: 'Same as "Daily" but skips Saturday and Sunday.',
  },
  {
    id: 'specific',
    title: 'Specific Weekdays',
    icon: '📅',
    desc: 'Runs on chosen days only, once per day',
    example: { starttime: '09:00', timezone: 'UTC', frequency: 'Monday,Wednesday,Friday', endtime: '' },
    tip: 'Comma-separate the day names. Full names or abbreviations both work.',
  },
  {
    id: 'monthly',
    title: 'Monthly',
    icon: '🗓️',
    desc: 'Runs once on a specific day of the month',
    example: { starttime: '18:00', timezone: 'America/New_York', frequency: 'FREQ=MONTHLY;INTERVAL=1;byday=24', endtime: '' },
    tip: 'Change byday=24 to any day number (1-31). Job fires on that day every month.',
  },
  {
    id: 'daily-interval',
    title: 'Daily Recurring',
    icon: '🔄',
    desc: 'Runs every N minutes/hours, every day',
    example: { starttime: '06:00', timezone: 'Asia/Kolkata', frequency: 'FREQ=INTERVAL;interval=5;units=minutes;byday=Daily', endtime: '22:00' },
    tip: 'MUST have End Time to prevent overlap with next day. Start=when it begins, End=when it stops.',
  },
  {
    id: 'weekday-interval',
    title: 'Weekday Recurring',
    icon: '⚡',
    desc: 'Runs every N minutes, Mon-Fri only',
    example: { starttime: '08:00', timezone: 'UTC', frequency: 'FREQ=INTERVAL;interval=15;units=minutes;byday=Mon,Tue,Wed,Thu,Fri', endtime: '18:00' },
    tip: 'Same as Daily Recurring but restricted to business days via byday= field.',
  },
  {
    id: 'weekly-interval',
    title: 'Weekly Day Recurring',
    icon: '🎯',
    desc: 'Runs every N hours on specific days',
    example: { starttime: '07:00', timezone: 'Europe/London', frequency: 'FREQ=INTERVAL;interval=2;units=hours;byday=Mon,Wed,Fri', endtime: '21:00' },
    tip: 'Use units=hours for longer intervals. byday controls which days.',
  },
  {
    id: 'monthly-interval',
    title: 'Monthly Recurring',
    icon: '🌟',
    desc: 'Runs every N minutes on a specific month day',
    example: { starttime: '06:00', timezone: 'Asia/Kolkata', frequency: 'FREQ=MONTHLY;INTERVAL=1;byday=24;recurInterval=15;recurUnits=minutes', endtime: '20:00' },
    tip: 'Combines monthly day selection with interval execution within that day.',
  },
];

function ExcelPreview({ example }: { example: any }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-lg overflow-hidden mt-4" style={{ background: 'rgba(2,8,16,0.9)', border: '1px solid rgba(51,65,85,0.2)' }}>
      <div className="grid grid-cols-4 text-[9px] font-bold text-slate-500 uppercase tracking-wider"
        style={{ background: 'rgba(6,15,30,0.8)' }}>
        <div className="px-3 py-2 border-r" style={{ borderColor: 'rgba(51,65,85,0.15)' }}>Job Starttime</div>
        <div className="px-3 py-2 border-r" style={{ borderColor: 'rgba(51,65,85,0.15)' }}>Job Timezone</div>
        <div className="px-3 py-2 border-r" style={{ borderColor: 'rgba(51,65,85,0.15)' }}>Scheduled Frequency</div>
        <div className="px-3 py-2">Job End Time</div>
      </div>
      <div className="grid grid-cols-4 text-xs font-mono">
        <div className="px-3 py-3 text-cyan-400 border-r" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>{example.starttime}</div>
        <div className="px-3 py-3 text-purple-400 border-r" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>{example.timezone}</div>
        <div className="px-3 py-3 text-emerald-400 border-r text-[10px] break-all" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>{example.frequency}</div>
        <div className="px-3 py-3 text-amber-400">{example.endtime || '—'}</div>
      </div>
    </motion.div>
  );
}

export default function HowToUsePage() {
  const [active, setActive] = useState<string | null>(null);
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const quiz = [
    { q: 'A job runs every 15 minutes on weekdays from 08:00 to 18:00. What do you put in "Job End Time"?', a: '18:00', options: ['(empty)', '18:00', '23:59', '08:00'] },
    { q: 'A monthly job runs on the 24th at 18:00. What goes in "Scheduled Frequency"?', a: 'FREQ=MONTHLY;INTERVAL=1;byday=24', options: ['Monthly', 'FREQ=MONTHLY;INTERVAL=1;byday=24', 'Daily', '24th'] },
    { q: 'A job runs once daily at 03:00. What goes in "Job End Time"?', a: '(empty)', options: ['(empty)', '23:59', '03:00', '00:00'] },
  ];
  const [quizIdx, setQuizIdx] = useState(0);

  return (
    <div className="min-h-screen scan-line" style={{ background: 'var(--bg-deep)' }}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-black neon-text mb-2">How to Use</h1>
          <p className="text-sm text-slate-500 mb-8">Interactive guide to filling the job scheduling Excel template</p>
        </motion.div>

        {/* Schedule Type Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-12">
          {SCHEDULE_TYPES.map((type, i) => (
            <motion.div key={type.id}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setActive(active === type.id ? null : type.id)}
              className="glass-card p-4 cursor-pointer card-hover">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">{type.icon}</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">{type.title}</h3>
                  <p className="text-[10px] text-slate-500">{type.desc}</p>
                </div>
              </div>
              <AnimatePresence>
                {active === type.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    <ExcelPreview example={type.example} />
                    <p className="text-[10px] text-amber-400/80 mt-3 px-1">💡 {type.tip}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* Quiz Section */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="glass-card p-6 mb-8">
          <h2 className="text-sm font-bold text-slate-200 mb-1">Quick Quiz</h2>
          <p className="text-[10px] text-slate-500 mb-4">Score: {score}/{quiz.length}</p>
          {quizIdx < quiz.length ? (
            <div>
              <p className="text-xs text-slate-300 mb-3">{quiz[quizIdx].q}</p>
              <div className="grid grid-cols-2 gap-2">
                {quiz[quizIdx].options.map(opt => (
                  <button key={opt} onClick={() => {
                    setQuizAnswer(opt);
                    if (opt === quiz[quizIdx].a) setScore(s => s + 1);
                    setTimeout(() => { setQuizAnswer(null); setQuizIdx(i => i + 1); }, 1000);
                  }}
                    className="px-3 py-2 rounded-lg text-xs font-mono transition-all text-left"
                    style={{
                      background: quizAnswer === opt
                        ? opt === quiz[quizIdx].a ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'
                        : 'rgba(15,23,42,0.5)',
                      border: quizAnswer === opt
                        ? opt === quiz[quizIdx].a ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(239,68,68,0.4)'
                        : '1px solid rgba(51,65,85,0.2)',
                      color: quizAnswer === opt
                        ? opt === quiz[quizIdx].a ? '#4ade80' : '#f87171'
                        : '#94a3b8',
                    }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-lg font-bold" style={{ color: score === quiz.length ? '#4ade80' : '#fbbf24' }}>
                {score === quiz.length ? 'Perfect!' : `${score}/${quiz.length}`}
              </p>
              <button onClick={() => { setQuizIdx(0); setScore(0); }}
                className="btn-primary px-4 py-2 rounded-lg text-xs mt-2">Retry</button>
            </div>
          )}
        </motion.div>

        <p className="text-center text-[9px] font-mono text-slate-800">DESIGNED AND ENGINEERED BY ABHAY THAKUR</p>
      </div>
    </div>
  );
}
