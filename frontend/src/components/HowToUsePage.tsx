'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playClick, playSuccess, playComplete, playWhoosh, playTick, playError } from '@/utils/soundEffects';

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════
interface Achievement { id: string; title: string; icon: string; desc: string; }

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', title: 'First Steps', icon: '🎯', desc: 'Complete first challenge' },
  { id: 'parser', title: 'Parser Pro', icon: '📊', desc: 'Master the file parser' },
  { id: 'schedule', title: 'Timekeeper', icon: '⏰', desc: 'Master schedule formats' },
  { id: 'verify', title: 'Inspector', icon: '🔍', desc: 'Complete verification module' },
  { id: 'delete', title: 'Cleanup Crew', icon: '🧹', desc: 'Master safe deletion' },
  { id: 'all', title: 'Graduated', icon: '🎓', desc: 'Complete everything' },
];

// ══════════════════════════════════════════════════════════════════════════════
// CHALLENGE COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function QuizChallenge({ question, options, correct, onDone }: {
  question: string; options: string[]; correct: number; onDone: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const handlePick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === correct) { playSuccess(); setTimeout(onDone, 600); }
    else playError();
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-300 font-medium mb-3">{question}</p>
      {options.map((o, i) => {
        let cls = 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:border-cyan-500/30';
        if (picked !== null && i === correct) cls = 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400';
        else if (picked === i && i !== correct) cls = 'bg-red-500/20 border-red-500/40 text-red-400';
        return (
          <motion.button key={i} onClick={() => handlePick(i)}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-xs border transition-all ${cls}`}
            whileHover={picked === null ? { x: 4 } : {}}>
            <span className="inline-flex items-center gap-2">
              <span className="w-5 h-5 rounded-full border border-current/30 flex items-center justify-center text-[10px] shrink-0">
                {String.fromCharCode(65 + i)}
              </span>{o}
            </span>
          </motion.button>
        );
      })}
      {picked !== null && picked !== correct && (
        <button onClick={onDone} className="text-[10px] text-cyan-400 underline mt-2">Continue →</button>
      )}
    </div>
  );
}

function SequenceChallenge({ items, onDone }: { items: string[]; onDone: () => void }) {
  const [order, setOrder] = useState<number[]>([]);
  const [avail, setAvail] = useState<number[]>(() => items.map((_, i) => i).sort(() => Math.random() - 0.5));
  const [wrong, setWrong] = useState(false);

  const pick = (idx: number) => {
    playTick();
    const next = [...order, idx];
    const nextAvail = avail.filter(i => i !== idx);
    setOrder(next);
    setAvail(nextAvail);
    if (next.length === items.length) {
      const correct = items.map((_, i) => i);
      if (JSON.stringify(next) === JSON.stringify(correct)) { playSuccess(); setTimeout(onDone, 500); }
      else { setWrong(true); setTimeout(() => { setOrder([]); setAvail(items.map((_, i) => i).sort(() => Math.random() - 0.5)); setWrong(false); }, 1200); }
    }
  };

  return (
    <div className="space-y-3">
      <div className="min-h-[40px] p-2 rounded-lg border border-dashed border-slate-700/50 bg-slate-900/30 flex flex-wrap gap-2">
        {order.length === 0 && <span className="text-[10px] text-slate-600 self-center">Click in correct order...</span>}
        {order.map((idx, pos) => (
          <motion.span key={pos} initial={{ scale: 0 }} animate={{ scale: 1 }}
            className={`px-3 py-1.5 rounded text-xs font-medium ${wrong ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'}`}>
            {pos + 1}. {items[idx]}
          </motion.span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {avail.map(idx => (
          <motion.button key={idx} onClick={() => pick(idx)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/60 text-slate-300 border border-slate-700/50 hover:border-amber-500/30 transition-all"
            whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.9 }}>
            {items[idx]}
          </motion.button>
        ))}
      </div>
      {wrong && <p className="text-xs text-red-400">Wrong order — try again!</p>}
    </div>
  );
}

function MatchChallenge({ pairs, onDone }: { pairs: [string, string][]; onDone: () => void }) {
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const shuffledRight = useRef(pairs.map((_, i) => i).sort(() => Math.random() - 0.5));

  const handleRight = (rightIdx: number) => {
    if (selectedLeft === null) return;
    const actualRight = shuffledRight.current[rightIdx];
    if (actualRight === selectedLeft) {
      playTick();
      const next = new Set(matched);
      next.add(selectedLeft);
      setMatched(next);
      setSelectedLeft(null);
      if (next.size === pairs.length) { playSuccess(); setTimeout(onDone, 500); }
    } else {
      playError();
      setSelectedLeft(null);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <p className="text-[9px] text-slate-600 uppercase tracking-wider font-bold mb-1">Column / Input</p>
        {pairs.map(([left], i) => (
          <motion.button key={i} onClick={() => !matched.has(i) && setSelectedLeft(i)}
            className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-mono border transition-all ${
              matched.has(i) ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 line-through opacity-50'
              : selectedLeft === i ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:border-cyan-500/20'
            }`} whileHover={!matched.has(i) ? { x: 2 } : {}}>
            {left}
          </motion.button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-[9px] text-slate-600 uppercase tracking-wider font-bold mb-1">Maps To</p>
        {shuffledRight.current.map((pairIdx, displayIdx) => (
          <motion.button key={displayIdx} onClick={() => handleRight(displayIdx)}
            disabled={matched.has(pairIdx)}
            className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-mono border transition-all ${
              matched.has(pairIdx) ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 opacity-50'
              : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:border-purple-500/20'
            }`} whileHover={!matched.has(pairIdx) ? { x: -2 } : {}}>
            {pairs[pairIdx][1]}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function SimulatorChallenge({ scenario, steps, onDone }: { scenario: string; steps: { action: string; result: string }[]; onDone: () => void }) {
  const [current, setCurrent] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const advance = () => {
    playTick();
    if (showResult) {
      if (current < steps.length - 1) { setCurrent(current + 1); setShowResult(false); }
      else { playSuccess(); onDone(); }
    } else {
      setShowResult(true);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(6,182,212,0.1)' }}>
      <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: 'rgba(51,65,85,0.15)' }}>
        <div className="flex gap-1"><span className="w-2 h-2 rounded-full bg-red-500/60" /><span className="w-2 h-2 rounded-full bg-yellow-500/60" /><span className="w-2 h-2 rounded-full bg-green-500/60" /></div>
        <span className="text-[9px] text-slate-600 font-mono ml-2">{scenario}</span>
        <span className="ml-auto text-[9px] text-slate-700 font-mono">{current + 1}/{steps.length}</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-cyan-500 text-xs shrink-0">▸</span>
          <p className="text-xs text-cyan-300 font-mono">{steps[current].action}</p>
        </div>
        <AnimatePresence>
          {showResult && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 ml-4">
              <span className="text-emerald-500 text-xs shrink-0">→</span>
              <p className="text-[11px] text-emerald-300 font-mono">{steps[current].result}</p>
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={advance}
          className="px-4 py-2 rounded-lg text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/15 transition-all">
          {!showResult ? 'Execute' : current < steps.length - 1 ? 'Next Step' : 'Complete ✓'}
        </button>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// MODULE DATA — All the deep content for each feature
// ══════════════════════════════════════════════════════════════════════════════

interface ModuleStep {
  id: string;
  title: string;
  content: string[];
  challenge?: { type: string; props: any };
}

interface Module {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  icon: string;
  steps: ModuleStep[];
  achievementId?: string;
}

const MODULES: Module[] = [
  // ── MODULE 1: CONNECTION & NAVIGATION ─────────────────────────────────────
  {
    id: 'connection', title: 'Connection & Setup', subtitle: 'UAC Authentication',
    color: '#f59e0b', icon: '🔗',
    steps: [
      {
        id: 'auth', title: 'Authenticate with UAC',
        content: [
          'Go to the Home page and find the UAC Connection panel.',
          'Enter your Stonebranch base URL (e.g. https://instance.stonebranch.cloud).',
          'Enter your Bearer token — this is your UAC API token from Settings > API Tokens.',
          'Optionally set a Display Name (your name) and Environment label (Production/Dev).',
          'Click "Authenticate" — the token is sent once to establish a server-side session.',
          'The token is NEVER stored in the browser — only a session ID is kept.',
        ],
        challenge: { type: 'sequence', props: { items: ['Enter Base URL', 'Enter Bearer Token', 'Set Display Name', 'Set Environment', 'Click Authenticate'] } },
      },
      {
        id: 'navigate', title: 'Navigate Modules',
        content: [
          'The home page shows all automation modules as cards.',
          'Status badges: Operational (live), Beta, In Dev, Offline.',
          'Click any operational card to open it in a new tab.',
          'Multiple tabs can be open simultaneously — state is preserved across switches.',
          'Use the tab bar at the top to switch. Close tabs with the X button.',
          'The Home tab cannot be closed.',
        ],
        challenge: { type: 'quiz', props: { question: 'What happens to your form data when you switch tabs?', options: ['Data is lost', 'Data is preserved in memory', 'Page reloads', 'You need to save first'], correct: 1 } },
      },
    ],
  },
  // ── MODULE 2: FILE PARSER (DEEP) ──────────────────────────────────────────
  {
    id: 'parser', title: 'File Parser & Columns', subtitle: 'Excel → Parsed Data',
    color: '#06b6d4', icon: '📄', achievementId: 'parser',
    steps: [
      {
        id: 'upload', title: 'Upload a File',
        content: [
          'Supported formats: .xlsx (Excel), .ods (OpenDocument), .csv',
          'Max file size: 10 MB.',
          'Drag & drop onto the upload zone OR click to browse.',
          'The backend uses the xlsx library to parse the first sheet.',
          'All column headers are normalized to internal field names (case-insensitive).',
        ],
        challenge: { type: 'quiz', props: { question: 'Which file formats are supported?', options: ['Only .xlsx', '.xlsx, .ods, .csv', '.pdf, .docx', '.json, .xml'], correct: 1 } },
      },
      {
        id: 'columns', title: 'Column Mapping (Critical)',
        content: [
          'The parser maps user-friendly column names → internal fields.',
          'You can use EITHER the UI label from Stonebranch OR the API field name.',
          'Examples: "Job Name" → task_name, "Job Workstation" → agent, "Job Script" → command',
          '"Job Login Account" → credential, "Job Starttime" → schedule_string',
          '"Scheduled Frequency" → frequency_type, "Reference Job" → ref_job',
          '"Maximum Runtime" → max_runtime (in minutes)',
          '"Member of Business Services" → business_services (comma-separated)',
          '"ServiceNow Ticket" → servicenow_ticket, "Queue" → servicenow_group',
          '"Job Recovery1" → recovery1, "Job Recovery2" → recovery2',
          '"Job End Time" → end_time (for interval jobs window)',
        ],
        challenge: { type: 'match', props: { pairs: [
          ['Job Name', 'task_name'],
          ['Job Workstation', 'agent'],
          ['Job Script', 'command'],
          ['Job Login Account', 'credential'],
          ['Scheduled Frequency', 'frequency_type'],
          ['Maximum Runtime', 'max_runtime'],
        ] } },
      },
      {
        id: 'task-types', title: 'Task Types & Agent Rules',
        content: [
          'Default task type: taskUnix (Linux/AIX shell commands).',
          'Use "taskWindows" for Windows cmd/PowerShell jobs.',
          'Agent-based types: taskUnix, taskWindows, taskUcmd, taskIbmi, taskZos, taskSql, etc.',
          'For agent-based tasks, the "agent" column is resolved to either an agent OR agentCluster.',
          'Resolution priority: exact agent name → exact cluster → prefix match → contains → fallback.',
          'If your agent string matches a cluster prefix, it auto-resolves to the full cluster name.',
        ],
        challenge: { type: 'quiz', props: { question: 'If you type "PROD-UNIX" and there\'s a cluster named "PROD-UNIX-CLUSTER-01", what happens?', options: ['Error - not found', 'Prefix match → uses PROD-UNIX-CLUSTER-01', 'Sends PROD-UNIX as-is', 'Prompts you to choose'], correct: 1 } },
      },
    ],
  },
  // ── MODULE 3: SCHEDULE PARSER (DEEP) ──────────────────────────────────────
  {
    id: 'schedule', title: 'Schedule Formats', subtitle: 'Time & Frequency Parsing',
    color: '#8b5cf6', icon: '⏰', achievementId: 'schedule',
    steps: [
      {
        id: 'absolute', title: 'Absolute Time (Run Once Per Day)',
        content: [
          'Format in "Job Starttime" column: AT HHMM TIMEZONE tz',
          'Example: "AT 1800 TIMEZONE Asia/Kolkata" → triggers daily at 18:00 IST.',
          'Bare format: just "1800" or "18:00" works too.',
          'Natural: "at 14:30 UTC" also works.',
          'The system sets timeStyle: "Absolute", time: "18:00", timeZone: "Asia/Kolkata".',
          'For the "Scheduled Frequency" column, use "Daily" or leave blank.',
        ],
        challenge: { type: 'quiz', props: { question: 'What does "AT 0630 TIMEZONE America/New_York" produce?', options: ['Interval every 6:30', 'Absolute trigger at 06:30 New York time', 'Runs for 6 hours 30 mins', 'Error - invalid format'], correct: 1 } },
      },
      {
        id: 'interval', title: 'Interval Jobs (Run Repeatedly)',
        content: [
          'Format: "AT 0600 EVERY 0030 UNTIL 2200 TIMEZONE UTC"',
          'This means: start at 06:00, repeat every 30 minutes, stop at 22:00.',
          'EVERY 0030 = every 30 minutes, EVERY 0100 = every 1 hour.',
          'The system sets: timeStyle: "Interval", timeInterval: 30, timeIntervalUnits: "Minutes".',
          'enabledStart: "06:00", enabledEnd: "22:00", restrictedTimes: true.',
          'CRITICAL: Interval triggers must NOT have a "time" field — the system auto-removes it.',
          'Alternative FREQ format: "FREQ=INTERVAL;interval=15;units=minutes;starttime=06:00;endtime=22:00"',
        ],
        challenge: { type: 'simulator', props: {
          scenario: 'interval-parse.log',
          steps: [
            { action: 'Input: "AT 0800 EVERY 0100 UNTIL 2000 TIMEZONE Asia/Kolkata"', result: 'Parsed: timeStyle=Interval, timeInterval=60, units=Minutes' },
            { action: 'Setting enabledStart = "08:00"', result: 'Window: 08:00 to 20:00 IST' },
            { action: 'Setting enabledEnd = "20:00", restrictedTimes=true', result: 'UAC will run every 60 min from 08:00-20:00 IST' },
            { action: 'Removing "time" field (interval safety)', result: '✓ Payload ready — no conflicting "time" field' },
          ],
        } },
      },
      {
        id: 'frequency', title: 'Scheduled Frequency Column',
        content: [
          '"Daily" → Simple daily, all days.',
          '"Weekdays" or "Mon-Fri" → Mon through Fri only.',
          '"Mon,Wed,Fri" → specific weekdays.',
          '"Monthly" → complex, monthly schedule.',
          '"Monthly Day 15" → fires on 15th of every month.',
          '"Monthly 2nd Sunday" → complex: 2nd Sunday of every month.',
          '"Business Days" → same as weekdays.',
          '"Every 15 minutes" → interval (timeInterval=15, units=Minutes).',
          '"Monday Every 7 minutes" → weekday Monday + interval every 7 min.',
          'FREQ=MONTHLY;INTERVAL=1;byday=24 → monthly on 24th.',
          'FREQ=WEEKLY;byday=Mon,Wed,Fri → weekly on those days.',
        ],
        challenge: { type: 'match', props: { pairs: [
          ['Daily', 'Simple dayStyle, all days'],
          ['Mon,Wed,Fri', 'Specific weekday flags'],
          ['Every 15 minutes', 'Interval, 15 Minutes'],
          ['Monthly Day 24', 'Complex: Month Day 24'],
          ['Weekdays', 'Mon-Fri flags set'],
        ] } },
      },
      {
        id: 'ref-job', title: 'Reference Job Inheritance',
        content: [
          'If "ref_job" column is filled, the system fetches that job\'s trigger from UAC.',
          'It copies ALL schedule fields (dayStyle, dateNouns, time, interval, etc.) from the ref trigger.',
          'Your input values OVERRIDE inherited ones — empty fields get ref values.',
          'The merge comparison table shows: YOUR INPUT | REF VALUE | FINAL VALUE.',
          'Fields inherited: start_time, timezone, frequency_type, max_runtime.',
          'maxRunTime is derived from lfDuration (Late Finish Duration) on the ref task.',
          'Formula: lfDuration "DD:HH:MM:SS" → total minutes.',
        ],
        challenge: { type: 'quiz', props: { question: 'If your input has empty start_time but ref_job trigger has time="14:00", what happens?', options: ['Error - time required', 'Uses 00:00 default', 'Inherits 14:00 from ref job', 'Skips trigger creation'], correct: 2 } },
      },
    ],
  },
  // ── MODULE 4: VERIFICATION & PROOF ────────────────────────────────────────
  {
    id: 'verify', title: 'Verification & Proof', subtitle: 'Post-Creation Checks',
    color: '#22c55e', icon: '✓', achievementId: 'verify',
    steps: [
      {
        id: 'auto-verify', title: 'Automatic Verification',
        content: [
          'After each task+trigger is created, the system auto-verifies by fetching from UAC.',
          'It checks: task exists, command matches, agent matches, trigger exists, schedule correct.',
          'Each check shows pass/fail/warn status in the verification panel.',
          'Verification starts 1.5s after trigger creation (waiting for UAC indexing).',
          'The panel shows a progress bar: green dots = verified, purple = verifying, yellow = warning.',
        ],
        challenge: { type: 'sequence', props: { items: ['Task + Trigger created', 'Wait 1.5s for UAC indexing', 'Fetch task back from UAC', 'Verify task fields match', 'Fetch trigger back from UAC', 'Verify schedule is correct', 'Mark as verified ✓'] } },
      },
      {
        id: 'qualifying-times', title: 'Qualifying Times (Run Cycle)',
        content: [
          'After verification, the system fetches "qualifying times" for each trigger.',
          'These are the next scheduled run dates/times calculated by UAC.',
          'This proves the trigger schedule is configured correctly.',
          'The proof document includes these times for audit purposes.',
          'If triggers are disabled, qualifying times show "Enable trigger first".',
        ],
        challenge: { type: 'quiz', props: { question: 'What do qualifying times prove?', options: ['The job ran successfully', 'The trigger schedule will fire at correct times', 'The command syntax is valid', 'The agent is online'], correct: 1 } },
      },
      {
        id: 'enable-triggers', title: 'Enable Triggers (Go Live)',
        content: [
          'All triggers are created DISABLED by default — safety measure.',
          'After verifying everything looks correct, click "Enable All Triggers".',
          'This calls the UAC enabledisable API for each trigger.',
          'Once enabled, jobs are LIVE and will fire on their schedules.',
          'Status shows how many enabled vs failed.',
          'If a trigger fails to enable, check UAC directly for errors.',
        ],
        challenge: { type: 'quiz', props: { question: 'Why are triggers created disabled?', options: ['Bug in the system', 'UAC requirement', 'Safety — allows verification before going live', 'Performance reason'], correct: 2 } },
      },
      {
        id: 'proof-doc', title: 'Download Proof Document',
        content: [
          'Click "Download Proof" to get an Excel with 3 sheets:',
          'Sheet 1 — Summary: Job name, trigger, command, checks passed, status.',
          'Sheet 2 — Checks: Detailed field-by-field verification results.',
          'Sheet 3 — Qualifying Times: Next N run dates for each trigger.',
          'Use this for audit trail, change management, and GTS governance.',
          'The proof shows EXACT state in UAC after creation — not just what was sent.',
        ],
        challenge: { type: 'quiz', props: { question: 'The proof document shows data from:', options: ['The uploaded Excel file', 'What was sent to the API', 'What UAC actually stored (fetched back)', 'A template'], correct: 2 } },
      },
    ],
  },
  // ── MODULE 5: JOB DELETION ────────────────────────────────────────────────
  {
    id: 'deletion', title: 'Safe Job Deletion', subtitle: 'Backup → Inspect → Delete',
    color: '#ef4444', icon: '🗑️', achievementId: 'delete',
    steps: [
      {
        id: 'input-jobs', title: 'Input Job Names',
        content: [
          'Enter task names one per line or comma-separated.',
          'Click "Load Jobs" to queue them for deletion.',
          'The system accepts any text — names are validated against UAC during inspection.',
          'Enable "Backup Before Delete" toggle (on by default) for safety.',
        ],
        challenge: { type: 'quiz', props: { question: 'How do you input jobs for deletion?', options: ['Upload a file', 'One name per line or comma-separated', 'Select from a dropdown', 'Only via API'], correct: 1 } },
      },
      {
        id: 'inspection', title: 'Inspection Phase',
        content: [
          'Before deleting, each job is INSPECTED:',
          '1. Check if the task exists in UAC (GET /resources/task).',
          '2. Find all triggers attached to this task.',
          '3. Find all parent workflows containing this task.',
          '4. Check for ACTIVE INSTANCES (currently running).',
          'If active instances found → prompts you: "Force Finish" or "Skip".',
          'Force Finish kills running instances before deletion.',
        ],
        challenge: { type: 'sequence', props: { items: ['Check task exists', 'Find attached triggers', 'Find parent workflows', 'Check active instances', 'Prompt if active found'] } },
      },
      {
        id: 'safe-delete', title: 'Safe Deletion Sequence',
        content: [
          'The actual deletion follows a SAFE ORDER:',
          '1. Disable all triggers (prevents new runs during deletion).',
          '2. Delete all triggers attached to the task.',
          '3. Delete the task itself.',
          'If any step fails, subsequent steps are skipped and marked as failed.',
          'Results show per-job: DELETED (green) or FAILED (red) with error details.',
        ],
        challenge: { type: 'sequence', props: { items: ['Disable triggers', 'Delete triggers', 'Delete task'] } },
      },
      {
        id: 'backup-recovery', title: 'Backup & Recovery',
        content: [
          'With backup enabled, BEFORE deletion the system:',
          '1. Fetches full task data from UAC for each job.',
          '2. Fetches all trigger data.',
          '3. Exports as an Excel file (auto-downloaded).',
          'The Excel has a "Job_Creation_Template" sheet — same format as the upload template!',
          'To RECOVER: upload the backup file to the Job Creation module.',
          'Or click individual "Recover" buttons in the Recovery Center.',
          'The confirm dialog requires typing "DELETE" to proceed.',
        ],
        challenge: { type: 'quiz', props: { question: 'How do you recover accidentally deleted jobs?', options: ['Contact support', 'Upload the backup Excel to Job Creation', 'Undo button', 'Not possible'], correct: 1 } },
      },
    ],
  },
  // ── MODULE 6: ANALYTICS ───────────────────────────────────────────────────
  {
    id: 'analytics', title: 'Analytics & Insights', subtitle: 'Monitoring Operations',
    color: '#a855f7', icon: '📊',
    steps: [
      {
        id: 'tabs', title: 'Three Analytics Views',
        content: [
          'Failed Jobs — shows all task instances that failed in the selected month.',
          'Created Items — tracks tasks and triggers created via this tool.',
          'Operations — combined view with top failing jobs and type breakdown charts.',
          'Switch months: Current or Last Month buttons.',
          'Auto-refreshes every 1 hour. Manual refresh button available.',
        ],
        challenge: { type: 'quiz', props: { question: 'How often does analytics auto-refresh?', options: ['Every 5 minutes', 'Every 15 minutes', 'Every 1 hour', 'Every 24 hours'], correct: 2 } },
      },
      {
        id: 'charts', title: 'Charts & Heatmaps',
        content: [
          'Daily bar chart: failures or creations per day of the month.',
          'Heatmap: failures by hour × last 7 days (shows peak failure times).',
          'Top Failing Jobs: horizontal bar chart of most-failing job names.',
          'Type Breakdown: donut chart showing failures by task type (Unix/Windows/etc).',
          'Hover over bars/cells for exact values.',
        ],
        challenge: { type: 'quiz', props: { question: 'What does the heatmap show?', options: ['CPU usage', 'Failures by hour and day', 'Job run durations', 'Network traffic'], correct: 1 } },
      },
    ],
  },
  // ── MODULE 7: AGENT CONTROL ───────────────────────────────────────────────
  {
    id: 'agent-control', title: 'Agent Control', subtitle: 'Suspend / Resume / Schedule',
    color: '#06b6d4', icon: '🖥️',
    steps: [
      {
        id: 'overview', title: 'Agent Donut & Selection',
        content: [
          'After connecting, click "Refresh Agents" to load all agents from UAC.',
          'The donut chart shows: Active (green), Suspended (yellow), Offline (grey).',
          'Click a donut segment to filter and show agent cards.',
          'Click cards to SELECT agents for action. "Select All" / "Clear" buttons available.',
          'Each card shows: name, type, status, hostname, IP, and a live heartbeat animation.',
        ],
        challenge: { type: 'quiz', props: { question: 'How do you select agents for action?', options: ['Type names manually only', 'Click donut segment → click cards', 'Import from file', 'All agents are always selected'], correct: 1 } },
      },
      {
        id: 'execute', title: 'Execute Actions',
        content: [
          'Choose Action: Suspend or Resume.',
          'Choose Timing: Immediate or Scheduled.',
          'For Scheduled: pick date, time, and timezone (full IANA list).',
          'The system converts local time to UTC using Intl timezone calculations.',
          'You can ALSO type manual agent names (comma-separated) — even without loading the list.',
          'Click "Execute" — results show success/error per agent in real-time.',
          'Terminal log shows all activity with timestamps.',
        ],
        challenge: { type: 'simulator', props: {
          scenario: 'agent-suspend.log',
          steps: [
            { action: 'Select 3 agents from grid + type 2 manual names', result: '5 agents total queued' },
            { action: 'Set Action=Suspend, Timing=Immediate', result: 'Configuration ready' },
            { action: 'Click Execute Suspend', result: 'POST /resources/agent/ops-suspend-agent × 5' },
            { action: 'Results: 4 success, 1 error (agent offline)', result: '✓ 4/5 suspended, 1 failed (already offline)' },
          ],
        } },
      },
    ],
  },
  // ── MODULE 8: MONITORING ──────────────────────────────────────────────────
  {
    id: 'monitoring', title: 'Monitoring & Alerts', subtitle: 'Agent + Job Monitoring',
    color: '#f97316', icon: '🔔',
    steps: [
      {
        id: 'config', title: 'Configure Monitoring',
        content: [
          'Set polling interval: 1, 5, 10, or 15 minutes.',
          'Toggle what to monitor: Agents (offline detection) and/or Jobs (failure alerts).',
          'Click "Start" to begin the monitoring loop.',
          '"Run Now" forces an immediate check cycle.',
          '"Stop" halts the polling loop.',
        ],
        challenge: { type: 'quiz', props: { question: 'What happens when you click "Run Now"?', options: ['Starts monitoring', 'Forces one immediate check', 'Stops monitoring', 'Resets alerts'], correct: 1 } },
      },
      {
        id: 'alerts', title: 'Alert System',
        content: [
          'When an agent goes offline → generates an "agent_offline" alert.',
          'When a job fails → generates a "job_failure" alert.',
          'Alerts are sent to Microsoft Teams via Adaptive Cards.',
          'ServiceNow incidents can be auto-created (incident numbers shown in UI).',
          'Alert history shows all alerts with type, time, Teams status, and incident links.',
          'Filter by: All, Agents only, Jobs only.',
        ],
        challenge: { type: 'quiz', props: { question: 'Where are alerts sent?', options: ['Email only', 'Microsoft Teams + ServiceNow', 'Slack', 'SMS'], correct: 1 } },
      },
    ],
  },
];


// ══════════════════════════════════════════════════════════════════════════════
// PROGRESS RING
// ══════════════════════════════════════════════════════════════════════════════
function ProgressRing({ progress, size = 48, color = '#f59e0b' }: { progress: number; size?: number; color?: string }) {
  const r = (size - 4) / 2;
  const c = r * 2 * Math.PI;
  const offset = c - (progress / 100) * c;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(51,65,85,0.3)" strokeWidth={3} />
      <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeLinecap="round" strokeDasharray={c} animate={{ strokeDashoffset: offset }} transition={{ duration: 0.8 }} />
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function HowToUsePage() {
  const [activeModule, setActiveModule] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [xp, setXp] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [achievements, setAchievements] = useState<string[]>([]);
  const [toast, setToast] = useState<Achievement | null>(null);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));

  const totalSteps = MODULES.reduce((a, m) => a + m.steps.length, 0);
  const progress = (completed.size / totalSteps) * 100;
  const level = Math.floor(xp / 100) + 1;

  const unlock = useCallback((id: string) => {
    if (achievements.includes(id)) return;
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return;
    setAchievements(prev => [...prev, id]);
    setToast(a);
    playComplete();
    setTimeout(() => setToast(null), 3500);
  }, [achievements]);

  const handleComplete = useCallback(() => {
    const mod = MODULES[activeModule];
    const step = mod.steps[activeStep];
    const key = `${mod.id}-${step.id}`;
    if (completed.has(key)) return;
    const next = new Set(completed);
    next.add(key);
    setCompleted(next);
    setXp(prev => prev + 30);

    // Check achievements
    if (next.size === 1) unlock('first');
    if (mod.achievementId) {
      const allDone = mod.steps.every(s => next.has(`${mod.id}-${s.id}`));
      if (allDone) unlock(mod.achievementId);
    }
    if (next.size === totalSteps) unlock('all');

    // Auto advance
    if (activeStep < mod.steps.length - 1) setTimeout(() => setActiveStep(activeStep + 1), 600);
  }, [activeModule, activeStep, completed, totalSteps, unlock]);

  const switchModule = (i: number) => {
    playWhoosh();
    setActiveModule(i);
    setActiveStep(0);
    setVisited(prev => new Set(prev).add(i));
  };

  const mod = MODULES[activeModule];
  const step = mod.steps[activeStep];
  const stepKey = `${mod.id}-${step.id}`;
  const isDone = completed.has(stepKey);

  return (
    <div className="min-h-screen" style={{ background: '#020812' }}>
      {/* Achievement Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }}
            className="fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl"
            style={{ background: 'linear-gradient(135deg, rgba(13,17,23,0.98), rgba(6,15,30,0.98))', border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <span className="text-2xl">{toast.icon}</span>
            <div><p className="text-xs font-bold text-amber-400">Achievement Unlocked!</p><p className="text-sm font-semibold text-slate-200">{toast.title}</p></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50" style={{ background: 'rgba(2,8,18,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(245,158,11,0.08)' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Home
            </a>
            <div className="w-[1px] h-4 bg-slate-800" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(245,158,11,0.25)' }}>
                <img src="/logo.png" alt="SB" className="w-full h-full object-contain" />
              </div>
              <span className="text-sm font-bold text-slate-200">How to Use</span>
              <span className="text-[9px] text-slate-600 font-mono uppercase hidden md:inline">Interactive Guide</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <span className="text-amber-400 text-xs font-bold">LVL {level}</span>
              <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} animate={{ width: `${xp % 100}%` }} />
              </div>
              <span className="text-[10px] text-slate-500 font-mono">{xp}XP</span>
            </div>
            <div className="flex gap-1">
              {achievements.slice(-4).map(id => {
                const a = ACHIEVEMENTS.find(x => x.id === id);
                return a ? <span key={id} className="text-base" title={a.title}>{a.icon}</span> : null;
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">
            Master <span style={{ color: mod.color }}>Stonebranch Automation</span>
          </h1>
          <p className="text-sm text-slate-500 max-w-xl mx-auto">
            Deep interactive tutorials covering every feature — file parsing, schedule formats, verification, deletion safety, and more.
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <ProgressRing progress={progress} color={mod.color} />
            <div className="text-left">
              <p className="text-xs text-slate-400">{completed.size}/{totalSteps} completed</p>
              <p className="text-[10px] text-slate-600">{Math.round(progress)}% mastery</p>
            </div>
          </div>
        </motion.div>

        {/* Module Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {MODULES.map((m, i) => {
            const mSteps = m.steps.map(s => `${m.id}-${s.id}`);
            const mDone = mSteps.filter(k => completed.has(k)).length;
            const active = i === activeModule;
            return (
              <motion.button key={m.id} onClick={() => switchModule(i)}
                className={`relative px-4 py-2.5 rounded-xl text-[11px] font-medium transition-all ${active ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
                style={{ background: active ? `${m.color}12` : 'rgba(15,23,42,0.6)', border: active ? `1px solid ${m.color}40` : '1px solid rgba(51,65,85,0.2)' }}
                whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}>
                <span className="mr-1.5">{m.icon}</span>
                <span className="font-bold">{m.title}</span>
                <div className="flex gap-0.5 justify-center mt-1.5">
                  {m.steps.map((_, si) => (
                    <span key={si} className="w-1.5 h-1.5 rounded-full" style={{ background: completed.has(`${m.id}-${m.steps[si].id}`) ? m.color : 'rgba(51,65,85,0.5)' }} />
                  ))}
                </div>
                {mDone === m.steps.length && <span className="absolute -top-1 -right-1 text-[10px]">✓</span>}
              </motion.button>
            );
          })}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-xl p-4" style={{ background: 'rgba(6,15,30,0.8)', border: '1px solid rgba(51,65,85,0.2)' }}>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Steps — {mod.title}</h3>
              <div className="space-y-1">
                {mod.steps.map((s, i) => {
                  const done = completed.has(`${mod.id}-${s.id}`);
                  const act = i === activeStep;
                  return (
                    <button key={s.id} onClick={() => { setActiveStep(i); playClick(); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${act ? 'bg-slate-800/80 text-slate-200' : done ? 'text-emerald-400/80' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${done ? 'bg-emerald-500/20 text-emerald-400' : act ? 'text-amber-400' : 'bg-slate-800 text-slate-600'}`}
                        style={act && !done ? { background: `${mod.color}20` } : {}}>
                        {done ? '✓' : i + 1}
                      </span>
                      <span className="truncate">{s.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Achievements */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(6,15,30,0.8)', border: '1px solid rgba(51,65,85,0.2)' }}>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Achievements ({achievements.length}/{ACHIEVEMENTS.length})</h3>
              <div className="grid grid-cols-3 gap-2">
                {ACHIEVEMENTS.map(a => (
                  <div key={a.id} title={`${a.title}: ${a.desc}`}
                    className={`aspect-square rounded-lg flex items-center justify-center text-lg ${achievements.includes(a.id) ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-800/50 border border-slate-800 opacity-40'}`}>
                    {achievements.includes(a.id) ? a.icon : '🔒'}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-9">
            <AnimatePresence mode="wait">
              <motion.div key={stepKey} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                className="rounded-2xl overflow-hidden" style={{ background: 'rgba(6,15,30,0.9)', border: `1px solid ${isDone ? 'rgba(52,211,153,0.2)' : `${mod.color}20`}` }}>
                
                {/* Step Header */}
                <div className="p-6 border-b" style={{ borderColor: 'rgba(51,65,85,0.2)' }}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${mod.color}15`, border: `1px solid ${mod.color}30` }}>
                        {mod.icon}
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-slate-100">{step.title}</h2>
                        <p className="text-[10px] text-slate-500">Step {activeStep + 1}/{mod.steps.length} • {mod.title}</p>
                      </div>
                    </div>
                    {isDone && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                        className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">✓ Done</motion.span>
                    )}
                  </div>
                </div>

                {/* Step Content */}
                <div className="p-6">
                  {/* Detailed bullet points */}
                  <div className="space-y-2 mb-6">
                    {step.content.map((line, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        className="flex items-start gap-2.5 text-[12px] text-slate-300 leading-relaxed">
                        <span className="text-amber-500/60 mt-0.5 shrink-0 text-[10px]">▸</span>
                        <span>{line}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Challenge */}
                  {step.challenge && (
                    <div className="rounded-xl p-5" style={{ background: 'rgba(2,8,18,0.6)', border: `1px solid ${mod.color}15` }}>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-amber-400">⚡</span>
                        <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Challenge</h3>
                        {!isDone && <span className="ml-auto text-[10px] text-slate-600 bg-slate-800/80 px-2 py-0.5 rounded">+30 XP</span>}
                      </div>
                      {isDone ? (
                        <p className="text-emerald-400 text-sm text-center py-4">✓ Completed! +30 XP</p>
                      ) : (
                        <>
                          {step.challenge.type === 'quiz' && <QuizChallenge {...step.challenge.props} onDone={handleComplete} />}
                          {step.challenge.type === 'sequence' && <SequenceChallenge {...step.challenge.props} onDone={handleComplete} />}
                          {step.challenge.type === 'match' && <MatchChallenge {...step.challenge.props} onDone={handleComplete} />}
                          {step.challenge.type === 'simulator' && <SimulatorChallenge {...step.challenge.props} onDone={handleComplete} />}
                        </>
                      )}
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: 'rgba(51,65,85,0.2)' }}>
                    <button onClick={() => { if (activeStep > 0) { setActiveStep(activeStep - 1); playClick(); } }}
                      disabled={activeStep === 0} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                      Previous
                    </button>
                    {!isDone && !step.challenge && (
                      <button onClick={handleComplete} className="px-4 py-2 rounded-lg text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 transition-all">
                        Mark Complete (+30 XP)
                      </button>
                    )}
                    {!isDone && step.challenge && (
                      <button onClick={handleComplete} className="text-[10px] text-slate-600 hover:text-slate-400 underline">Skip</button>
                    )}
                    <button onClick={() => {
                      if (activeStep < mod.steps.length - 1) { setActiveStep(activeStep + 1); playClick(); }
                      else if (activeModule < MODULES.length - 1) switchModule(activeModule + 1);
                    }} disabled={activeStep === mod.steps.length - 1 && activeModule === MODULES.length - 1}
                      className="flex items-center gap-1.5 text-xs font-medium disabled:opacity-30 transition-colors" style={{ color: mod.color }}>
                      {activeStep === mod.steps.length - 1 ? 'Next Module' : 'Next'}
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-6 mt-8 border-t" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>
        <p className="text-center text-[9px] text-slate-700 font-mono">STONEBRANCH AUTOMATION — INTERACTIVE GUIDE • BUILT BY ABHAY THAKUR</p>
      </footer>
    </div>
  );
}
