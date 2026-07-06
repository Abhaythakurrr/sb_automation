/**
 * ML Schedule Parser Test Suite
 * 
 * Demonstrates the ML-based NLP schedule parser capabilities
 */

const { getScheduleRecommendation, analyzeSchedulePatterns } = require('./dist/utils/scheduleMLParser');

console.log('═══════════════════════════════════════════════════════');
console.log('  ML-Based Schedule Parser - Test Suite');
console.log('═══════════════════════════════════════════════════════\n');

// ── Test Cases ────────────────────────────────────────────────────────────────

const testCases = [
  // Original problematic inputs
  'AT 0001 every 30 minutes 7 days a week',
  'everyday, Time: midnight 12:00 EST',
  
  // Common patterns
  'every 15 minutes',
  'every 30 minutes from 06:00 to 22:00',
  'daily at 08:30',
  'weekdays at 09:00',
  'Monday Wednesday Friday at 10:00',
  'monthly on day 15',
  'every 2 hours',
  'business days at 07:00',
  
  // Natural language
  'run every hour',
  'daily',
  'every day at noon',
  'weekdays only',
  'first day of month',
];

console.log('Testing Individual Patterns:\n');
console.log('─'.repeat(80));

testCases.forEach((input, index) => {
  console.log(`\n${index + 1}. INPUT: "${input}"`);
  const recommendation = getScheduleRecommendation(input);
  
  if (recommendation) {
    console.log(`   ✅ RECOGNIZED (${(recommendation.confidence * 100).toFixed(0)}% confidence)`);
    console.log(`   Category: ${recommendation.category.toUpperCase()}`);
    console.log(`   Explanation: ${recommendation.explanation}`);
    console.log(`   \n   📋 RECOMMENDED FORMAT:`);
    console.log(`   Job Starttime: ${recommendation.starttime}`);
    console.log(`   Scheduled Frequency: ${recommendation.frequency}`);
    console.log(`   Job Timezone: ${recommendation.timezone}`);
    if (recommendation.endtime) {
      console.log(`   Job End Time: ${recommendation.endtime}`);
    }
    
    if (recommendation.alternatives.length > 0) {
      console.log(`   \n   💡 Alternative interpretations: ${recommendation.alternatives.length}`);
    }
  } else {
    console.log('   ❌ NOT RECOGNIZED');
    console.log('   Suggestion: Use explicit format like "every N minutes" or "daily at HH:MM"');
  }
});

console.log('\n' + '─'.repeat(80));
console.log('\nAnalyzing Pattern Distribution:\n');

const analysis = analyzeSchedulePatterns(testCases);
console.log(`Total Patterns Analyzed: ${analysis.totalPatterns}`);
console.log(`\nCategory Distribution:`);
Object.entries(analysis.categoryDistribution).forEach(([cat, count]) => {
  const percentage = (count / analysis.totalPatterns * 100).toFixed(1);
  console.log(`  ${cat.padEnd(15)} ${count.toString().padStart(3)} (${percentage}%)`);
});

console.log(`\nMost Common Phrases:`);
analysis.commonPhrases.slice(0, 5).forEach((phrase, i) => {
  console.log(`  ${i + 1}. "${phrase}"`);
});

console.log('\n' + '═'.repeat(80));
console.log('✅ ML Parser Test Complete');
console.log('═'.repeat(80));
