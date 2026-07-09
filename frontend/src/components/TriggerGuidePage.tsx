'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FrequencyExample {
  id: string;
  title: string;
  description: string;
  excelFormat: string;
  chatFormat: string;
  category: 'simple' | 'interval' | 'complex';
}

const FREQUENCY_TYPES: FrequencyExample[] = [
  {
    id: 'daily',
    title: 'Daily Execution',
    description: 'Run job every day at a specific time',
    excelFormat: 'Job Starttime: AT 0600 TIMEZONE America/New_York\nScheduled Frequency: Daily',
    chatFormat: 'Daily at 06:00 America/New_York',
    category: 'simple',
  },
  {
    id: 'weekdays',
    title: 'Weekdays Only',
    description: 'Run job Monday through Friday (business days)',
    excelFormat: 'Job Starttime: AT 0800 TIMEZONE UTC\nScheduled Frequency: Weekdays',
    chatFormat: 'Weekdays at 08:00 UTC',
    category: 'simple',
  },
  {
    id: 'specific-days',
    title: 'Specific Days',
    description: 'Run on selected days of the week',
    excelFormat: 'Job Starttime: AT 1200 TIMEZONE Asia/Kolkata\nScheduled Frequency: Monday,Wednesday,Friday',
    chatFormat: 'Monday, Wednesday, Friday at 12:00 Asia/Kolkata',
    category: 'simple',
  },
  {
    id: 'monthly',
    title: 'Monthly on Specific Day',
    description: 'Run once per month on a specific day number (1-31)',
    excelFormat: 'Job Starttime: AT 0300 TIMEZONE UTC\nScheduled Frequency: FREQ=MONTHLY;INTERVAL=1;byday=15',
    chatFormat: 'Monthly on day 15 at 03:00 UTC',
    category: 'complex',
  },
  {
    id: 'interval-daily',
    title: 'Interval - Every Day',
    description: 'Run every N minutes/hours all day long',
    excelFormat: 'Job Starttime: AT 0001 every 30 minutes\nScheduled Frequency: Daily',
    chatFormat: 'Every 30 minutes daily',
    category: 'interval',
  },
  {
    id: 'interval-window',
    title: 'Interval with Time Window',
    description: 'Run every N minutes/hours between start and end time',
    excelFormat: 'Job Starttime: AT 0600 EVERY 0030 UNTIL 2200 TIMEZONE UTC\nScheduled Frequency: Daily',
    chatFormat: 'Every 30 minutes from 06:00 to 22:00 UTC daily',
    category: 'interval',
  },
  {
    id: 'interval-weekdays',
    title: 'Interval - Weekdays Only',
    description: 'Run every N minutes/hours on business days only',
    excelFormat: 'Job Starttime: AT 0700 every 15 minutes UNTIL 1900\nScheduled Frequency: Weekdays',
    chatFormat: 'Every 15 minutes from 07:00 to 19:00 on weekdays',
    category: 'interval',
  },
  {
    id: 'monthly-interval',
    title: 'Monthly with Interval',
    description: 'Run every N minutes on a specific day of the month',
    excelFormat: 'Job Starttime: AT 0001 every 15 minutes\nScheduled Frequency: FREQ=MONTHLY;byday=24',
    chatFormat: 'Every 15 minutes on day 24 of every month',
    category: 'complex',
  },
  {
    id: 'month-day-range',
    title: 'Monthly Day Range',
    description: 'Run daily during a specific day range each month',
    excelFormat: 'Job Starttime: AT 0600 TIMEZONE UTC\nScheduled Frequency: from 1st till 10th each month',
    chatFormat: 'Daily at 06:00 from day 1 to day 10 of each month',
    category: 'complex',
  },
];

export default function TriggerGuidePage() {
  const [activeCategory, setActiveCategory] = useState<'simple' | 'interval' | 'complex'>('simple');
  const [selectedFreq, setSelectedFreq] = useState<string>(FREQUENCY_TYPES[0].id);
  const [copiedExcel, setCopiedExcel] = useState(false);
  const [copiedChat, setCopiedChat] = useState(false);

  const selectedExample = FREQUENCY_TYPES.find(f => f.id === selectedFreq) || FREQUENCY_TYPES[0];
  const filteredTypes = FREQUENCY_TYPES.filter(f => f.category === activeCategory);

  const handleCopy = (text: string, type: 'excel' | 'chat') => {
    navigator.clipboard.writeText(text);
    if (type === 'excel') {
      setCopiedExcel(true);
      setTimeout(() => setCopiedExcel(false), 2000);
    } else {
      setCopiedChat(true);
      setTimeout(() => setCopiedChat(false), 2000);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0F0B0A 0%, #1B1813 100%)' }}>
      {/* Header */}
      <header className="sticky top-0 z-50" style={{ 
        background: 'rgba(15,11,10,0.95)', 
        backdropFilter: 'blur(20px)', 
        borderBottom: '1px solid rgba(251,191,36,0.1)' 
      }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ 
              background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.05))', 
              border: '1px solid rgba(245,158,11,0.2)' 
            }}>
              <img src="/logo.png" alt="SB" className="w-5 h-5 object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-bold" style={{ color: '#fbbf24' }}>Trigger Creation Guide</h1>
              <p className="text-[9px] font-mono uppercase" style={{ color: '#6b7280' }}>
                Interactive Reference
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Category Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-3 mb-8"
        >
          {[
            { key: 'simple', label: 'Simple Schedules', desc: 'Daily, Weekdays, Specific Days' },
            { key: 'interval', label: 'Interval Jobs', desc: 'Every N minutes/hours' },
            { key: 'complex', label: 'Complex Patterns', desc: 'Monthly, Day Ranges' },
          ].map(cat => (
            <motion.button
              key={cat.key}
              onClick={() => { 
                setActiveCategory(cat.key as any); 
                setSelectedFreq(FREQUENCY_TYPES.find(f => f.category === cat.key)?.id || FREQUENCY_TYPES[0].id); 
              }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 rounded-2xl p-4 text-left transition-all"
              style={{
                background: activeCategory === cat.key 
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.05))'
                  : 'rgba(40,40,43,0.3)',
                border: activeCategory === cat.key
                  ? '2px solid rgba(245,158,11,0.4)'
                  : '1px solid rgba(100,116,139,0.2)',
              }}
            >
              <h3 className="text-sm font-bold mb-1" style={{ 
                color: activeCategory === cat.key ? '#fbbf24' : '#cbd5e1' 
              }}>
                {cat.label}
              </h3>
              <p className="text-[10px]" style={{ color: '#64748b' }}>{cat.desc}</p>
            </motion.button>
          ))}
        </motion.div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Frequency List */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl p-4" style={{ 
              background: 'rgba(40,40,43,0.3)', 
              border: '1px solid rgba(100,116,139,0.1)' 
            }}>
              <h2 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: '#94a3b8' }}>
                {activeCategory === 'simple' ? 'Simple' : activeCategory === 'interval' ? 'Interval' : 'Complex'} Patterns
              </h2>
              <div className="space-y-2">
                {filteredTypes.map((freq, i) => (
                  <motion.button
                    key={freq.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelectedFreq(freq.id)}
                    whileHover={{ x: 4 }}
                    className="w-full text-left rounded-xl p-3 transition-all"
                    style={{
                      background: selectedFreq === freq.id
                        ? 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.08))'
                        : 'rgba(30,41,59,0.3)',
                      border: selectedFreq === freq.id
                        ? '1px solid rgba(245,158,11,0.3)'
                        : '1px solid transparent',
                    }}
                  >
                    <h3 className="text-xs font-semibold mb-1" style={{ 
                      color: selectedFreq === freq.id ? '#fbbf24' : '#cbd5e1' 
                    }}>
                      {freq.title}
                    </h3>
                    <p className="text-[10px]" style={{ color: '#64748b' }}>{freq.description}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Detail View */}
          <div className="lg:col-span-2 space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedFreq}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Title */}
                <div className="rounded-2xl p-6 mb-4" style={{ 
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(251,191,36,0.04))', 
                  border: '1px solid rgba(245,158,11,0.2)' 
                }}>
                  <h2 className="text-2xl font-bold mb-2" style={{ color: '#fbbf24' }}>
                    {selectedExample.title}
                  </h2>
                  <p className="text-sm" style={{ color: '#94a3b8' }}>
                    {selectedExample.description}
                  </p>
                </div>

                {/* Excel Format */}
                <div className="rounded-2xl p-5" style={{ 
                  background: 'rgba(40,40,43,0.4)', 
                  border: '1px solid rgba(100,116,139,0.2)' 
                }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                      Excel Format
                    </h3>
                    <button
                      onClick={() => handleCopy(selectedExample.excelFormat, 'excel')}
                      className="px-3 py-1 rounded-lg text-[10px] font-medium transition-all"
                      style={{ 
                        background: copiedExcel ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', 
                        color: copiedExcel ? '#22c55e' : '#fbbf24', 
                        border: `1px solid ${copiedExcel ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.2)'}` 
                      }}
                    >
                      {copiedExcel ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap" style={{ 
                    color: '#e2e8f0', 
                    background: 'rgba(15,11,10,0.5)', 
                    padding: '12px', 
                    borderRadius: '8px' 
                  }}>
                    {selectedExample.excelFormat}
                  </pre>
                </div>

                {/* Chat Format */}
                <div className="rounded-2xl p-5" style={{ 
                  background: 'rgba(40,40,43,0.4)', 
                  border: '1px solid rgba(100,116,139,0.2)' 
                }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                      Job Builder Chat Format
                    </h3>
                    <button
                      onClick={() => handleCopy(selectedExample.chatFormat, 'chat')}
                      className="px-3 py-1 rounded-lg text-[10px] font-medium transition-all"
                      style={{ 
                        background: copiedChat ? 'rgba(34,197,94,0.1)' : 'rgba(139,92,246,0.1)', 
                        color: copiedChat ? '#22c55e' : '#c4b5fd', 
                        border: `1px solid ${copiedChat ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.2)'}` 
                      }}
                    >
                      {copiedChat ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap" style={{ 
                    color: '#e2e8f0', 
                    background: 'rgba(15,11,10,0.5)', 
                    padding: '12px', 
                    borderRadius: '8px' 
                  }}>
                    {selectedExample.chatFormat}
                  </pre>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Quick Reference Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 rounded-2xl p-6"
          style={{ background: 'rgba(40,40,43,0.3)', border: '1px solid rgba(100,116,139,0.1)' }}
        >
          <h3 className="text-sm font-bold mb-4" style={{ color: '#fbbf24' }}>Quick Reference</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs" style={{ color: '#cbd5e1' }}>
            <div>
              <h4 className="font-semibold mb-2" style={{ color: '#94a3b8' }}>Timezone Format:</h4>
              <p className="text-[10px]" style={{ color: '#64748b' }}>
                Always use IANA timezone names (America/New_York, Asia/Kolkata, UTC)
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2" style={{ color: '#94a3b8' }}>Time Format:</h4>
              <p className="text-[10px]" style={{ color: '#64748b' }}>
                Use 24-hour format (HH:MM or HHMM). Examples: 06:00, 1830, 23:45
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2" style={{ color: '#94a3b8' }}>Day Names:</h4>
              <p className="text-[10px]" style={{ color: '#64748b' }}>
                Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday (or Mon, Tue, etc.)
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2" style={{ color: '#94a3b8' }}>Keywords:</h4>
              <p className="text-[10px]" style={{ color: '#64748b' }}>
                Daily, Weekdays, Business Days, Monthly, Every, From, To, Until
              </p>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
