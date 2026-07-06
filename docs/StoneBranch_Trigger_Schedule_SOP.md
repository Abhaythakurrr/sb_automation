# StoneBranch Trigger & Schedule Creation - Standard Operating Procedure

---

## **Document Information**

| Field | Value |
|-------|-------|
| **Document Title** | StoneBranch Trigger & Schedule Creation SOP |
| **Version** | 1.0 |
| **Date** | 2026-07-06 |
| **Purpose** | Complete guide for creating time-based triggers with all supported schedule patterns |
| **Audience** | Automation Engineers, Job Schedulers, System Administrators |
| **Status** | Active |

---

## **Table of Contents**

1. [Overview](#1-overview)
2. [Trigger Types](#2-trigger-types)
3. [Schedule Format Reference](#3-schedule-format-reference)
4. [Common Schedule Patterns](#4-common-schedule-patterns)
5. [Job Builder Chat Examples](#5-job-builder-chat-examples)
6. [Excel Template Examples](#6-excel-template-examples)
7. [Troubleshooting](#7-troubleshooting)
8. [Best Practices](#8-best-practices)

---

## **1. Overview**

### **What is a Trigger?**

A **trigger** in StoneBranch UAC is an automated mechanism that starts a job based on:
- **Time** (schedule-based) ← *This SOP focuses on Time Triggers*
- **File** (file arrival/modification)
- **Workflow** (composite triggers - multiple conditions)
- **Manual** (user-initiated)

### **Time Trigger Components**

Every time trigger has **3 main sections**:

1. **Time Details** (When to run)
   - **Absolute Time:** Runs at specific time (e.g., 08:30 AM)
   - **Interval:** Runs repeatedly every N minutes/hours

2. **Day Details** (Which days)
   - **Simple:** Daily, Weekdays, specific days (Mon, Wed, Fri)
   - **Complex:** Monthly patterns (2nd Sunday, Last business day, etc.)

3. **Restrictions** (Time windows for intervals)
   - **Start Time:** When interval begins (e.g., 06:00)
   - **End Time:** When interval stops (e.g., 22:00)

---

## **2. Trigger Types**

### **2.1 Time Trigger (Focus of this SOP)**

- **triggerTime** - Schedule-based execution
- Most common trigger type (90% of jobs)
- Supports absolute time and intervals
- Can run daily, weekly, monthly, or on specific days

### **2.2 Other Trigger Types** *(Not covered in this SOP)*

- **triggerFile** - Runs when file appears/changes
- **triggerWorkflow** - Composite triggers (multiple conditions)
- **triggerManual** - User-initiated triggers

---

## **3. Schedule Format Reference**

### **3.1 Field Definitions**

| Field | Description | Example | Required? |
|-------|-------------|---------|-----------|
| **Job Starttime** | When the job should run (time only) | `08:30`, `AT 1800`, `00:00` | Yes |
| **Scheduled Frequency** | How often and which days | `FREQ=DAILY;INTERVAL=1`, `FREQ=INTERVAL;interval=30;units=minutes` | Yes |
| **Job Timezone** | IANA timezone name | `America/New_York`, `Asia/Kolkata`, `UTC` | Yes |
| **Job End Time** | For intervals only - when to stop | `23:55`, `22:00` | Optional |
| **Firstrun Date** | Earliest date trigger becomes active | `2026-07-07` | Optional |

### **3.2 Time Format Standards**

#### **✅ RECOMMENDED FORMATS**

| Format | Example | Notes |
|--------|---------|-------|
| **24-hour HH:MM** | `08:30`, `15:45`, `00:00` | Always use 24-hour format |
| **4-digit HHMM** | `0830`, `1545`, `0000` | Legacy format (still supported) |
| **AT HHMM** | `AT 0830`, `AT 1800` | Explicit format |

#### **❌ AVOID THESE FORMATS**

| Format | Why Avoid | Use Instead |
|--------|-----------|-------------|
| `8:30 AM`, `3:45 PM` | Ambiguous, not parsed reliably | `08:30`, `15:45` |
| `midnight`, `noon` | Parser limitations | `00:00`, `12:00` |
| `everyday at 8am` | Too much natural language | `08:00` + `FREQ=DAILY` |

### **3.3 Timezone Format Standards**

#### **✅ RECOMMENDED FORMATS**

| Timezone Type | Example | Notes |
|--------------|---------|-------|
| **IANA Name** | `America/New_York` | Most explicit, handles DST automatically |
| **Standard UTC Offset** | `UTC`, `GMT` | Universal, no DST |
| **Common Abbreviations** | `EST`, `PST`, `IST`, `JST` | Must be explicitly supported |

#### **❌ AVOID THESE FORMATS**

| Format | Why Avoid | Use Instead |
|--------|-----------|-------------|
| `EST` (alone) | Ambiguous during DST | `America/New_York` |
| `Eastern Time` | Not parseable | `America/New_York` |
| `New York` | Not a timezone | `America/New_York` |

**Supported Timezone Abbreviations:**
`EST`, `EDT`, `CST`, `CDT`, `MST`, `MDT`, `PST`, `PDT`, `IST`, `JST`, `AEST`, `AEDT`, `BST`, `CET`, `CEST`

---

## **4. Common Schedule Patterns**

### **Pattern 1: Daily at Specific Time**

**Use Case:** Run every day at the same time

**Format:**
```
Job Starttime: 08:30
Scheduled Frequency: FREQ=DAILY;INTERVAL=1
Job Timezone: America/New_York
```

**Result:** Runs daily at 08:30 AM Eastern Time

---

### **Pattern 2: Weekdays Only (Mon-Fri)**

**Use Case:** Run Monday through Friday only

**Format:**
```
Job Starttime: 09:00
Scheduled Frequency: FREQ=WEEKLY;byday=Mon,Tue,Wed,Thu,Fri
Job Timezone: America/New_York
```

**Alternative Format:**
```
Job Starttime: 09:00
Scheduled Frequency: Weekdays
Job Timezone: America/New_York
```

**Result:** Runs Mon-Fri at 09:00 AM Eastern Time

---

### **Pattern 3: Specific Days of Week**

**Use Case:** Run on Monday, Wednesday, Friday only

**Format:**
```
Job Starttime: 10:00
Scheduled Frequency: FREQ=WEEKLY;byday=Mon,Wed,Fri
Job Timezone: America/New_York
```

**Result:** Runs Mon, Wed, Fri at 10:00 AM Eastern Time

---

### **Pattern 4: Every N Minutes (24/7)**

**Use Case:** Run continuously every 15 minutes, all day, every day

**Format:**
```
Job Starttime: 00:00
Scheduled Frequency: FREQ=INTERVAL;interval=15;units=minutes
Job Timezone: America/New_York
```

**Result:** Runs every 15 minutes starting from midnight, 24/7

---

### **Pattern 5: Every N Minutes (Time Window)**

**Use Case:** Run every 30 minutes, but only between 06:00 and 22:00

**Format:**
```
Job Starttime: 06:00
Job End Time: 22:00
Scheduled Frequency: FREQ=INTERVAL;interval=30;units=minutes;starttime=06:00;endtime=22:00
Job Timezone: America/New_York
```

**Alternative Format:**
```
Job Starttime: 06:00
Job End Time: 22:00
Scheduled Frequency: FREQ=INTERVAL;interval=30;units=minutes
Job Timezone: America/New_York
```

**Result:** Runs every 30 minutes from 06:00 to 22:00 only (32 times/day)

---

### **Pattern 6: Every N Hours**

**Use Case:** Run every 2 hours starting at 08:00

**Format:**
```
Job Starttime: 08:00
Scheduled Frequency: FREQ=INTERVAL;interval=2;units=hours;starttime=08:00
Job Timezone: America/New_York
```

**Result:** Runs at 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00

---

### **Pattern 7: Monthly on Specific Day**

**Use Case:** Run on the 15th of every month at 03:00

**Format:**
```
Job Starttime: 03:00
Scheduled Frequency: FREQ=MONTHLY;monthday=15
Job Timezone: America/New_York
```

**Result:** Runs on the 15th of every month at 03:00 AM

---

### **Pattern 8: Monthly with Interval**

**Use Case:** Run every 30 minutes, but only on the 24th of each month

**Format:**
```
Job Starttime: 00:00
Job End Time: 23:55
Scheduled Frequency: FREQ=INTERVAL;interval=30;units=minutes;monthday=24
Job Timezone: America/New_York
```

**Result:** Runs every 30 minutes on the 24th only (48 times on that day)

---

## **5. Job Builder Chat Examples**

### **Example 1: Daily Job at Midnight**

**Copy & Paste This:**
```
Job Type: Production
Business Unit: NA
Job Function: BU
Job Priority: 1
Job Name: PMFG-BU-NA3-MFG-PPPTRP05-A12P-0477
Job Description: NA - Inventory Valuation by Location
ServiceNow Group: QAD Support Global
Job Recovery1: Do not re-run job
Job Recovery2: Raise Medium priority ticket to support
Firstrun Date: 2026-07-07
Scheduled Frequency: FREQ=DAILY;INTERVAL=1
Maximum Runtime: 2 hrs
Job Starttime: 00:00
Job Timezone: America/New_York
Job Script: /usr/bin/bash -c 'unset TERM && sh /global/qadee/usr/guth_batch.sh ppptrp05 aamer12p 0477 us 2>&1 </dev/null'
Job Workstation: A002112PP1_DD_unixCluster
Job Login Account: mfg
ServiceNow Ticket: SCTASK0885715
Business Services: BJA-QAD, BJA-QAD - NA
```

---

### **Example 2: Every 30 Minutes with Time Window**

**Copy & Paste This:**
```
Job Type: Production
Business Unit: NA
Job Function: BU
Job Priority: 1
Job Name: PMFG-BU-NA1-MFG-MTLRQGEN-A01P-0919
Job Description: NA - Material Request Generation
ServiceNow Group: QAD Support Global
Job Recovery1: Do not re-run job
Job Recovery2: Raise Medium priority ticket to support
Firstrun Date: 2026-07-07
Scheduled Frequency: FREQ=INTERVAL;interval=30;units=minutes
Maximum Runtime: 2 hrs
Job Starttime: 00:01
Job End Time: 23:55
Job Timezone: America/New_York
Job Script: /usr/bin/bash -c 'unset TERM && sh /global/qadee/usr/guth_batch.sh mtlrqgen aamer01p 0919 us 2>&1 </dev/null'
Job Workstation: A002101PP1_DD_unixCluster
Job Login Account: mfg
ServiceNow Ticket: SCTASK0885714
Business Services: BJA-QAD, BJA-QAD - NA
```

---

### **Example 3: Weekdays at Specific Time**

**Copy & Paste This:**
```
Job Type: Production
Job Name: DAILY-REPORT-GENERATION
Job Description: Generate daily reports for business users
Firstrun Date: 2026-07-07
Scheduled Frequency: FREQ=WEEKLY;byday=Mon,Tue,Wed,Thu,Fri
Job Starttime: 07:30
Job Timezone: America/Chicago
Job Script: /usr/local/bin/generate_reports.sh
Job Workstation: REPORTING_SERVER_unixCluster
Job Login Account: reports
Maximum Runtime: 1 hr
```

---

## **6. Excel Template Examples**

### **Template Structure**

| Column Name | Example Value | Notes |
|-------------|---------------|-------|
| Job Name | `PMFG-BU-NA3-MFG-PPPTRP05-A12P-0477` | Unique identifier |
| Job Description | `NA - Inventory Valuation by Location` | Human-readable |
| Job Starttime | `00:00` or `AT 0001` | Time only |
| Scheduled Frequency | `FREQ=DAILY;INTERVAL=1` | Pattern definition |
| Job Timezone | `America/New_York` | IANA timezone |
| Job End Time | `23:55` | Only for intervals |
| Firstrun Date | `2026-07-07` | ISO format YYYY-MM-DD |
| Maximum Runtime | `2 hrs` | Human-readable |

### **Excel Row Examples**

#### **Daily Job**
```
Job Name: DAILY-INVENTORY-CHECK
Job Starttime: 03:00
Scheduled Frequency: FREQ=DAILY;INTERVAL=1
Job Timezone: America/New_York
```

#### **Interval Job**
```
Job Name: MTLRQGEN-RECURRING
Job Starttime: 00:01
Job End Time: 23:55
Scheduled Frequency: FREQ=INTERVAL;interval=30;units=minutes
Job Timezone: America/New_York
```

#### **Weekdays Job**
```
Job Name: WEEKDAY-REPORT
Job Starttime: 08:30
Scheduled Frequency: FREQ=WEEKLY;byday=Mon,Tue,Wed,Thu,Fri
Job Timezone: America/Chicago
```

---

## **7. Troubleshooting**

### **Common Errors**

#### **Error 1: "timeZone: minut" or "timeZone: night"**

**Cause:** Parser extracted timezone from partial word match

**Solution:** Use explicit timezone field format
```
✅ CORRECT:
Job Timezone: America/New_York

❌ WRONG:
Job Timezone: TIMEZONE America/New_York (parser strips "TIMEZONE " prefix automatically)
```

---

#### **Error 2: Missing `time` or `timeStyle` fields**

**Cause:** Parser couldn't extract time from Job Starttime

**Solution:** Use 24-hour HH:MM format
```
✅ CORRECT:
Job Starttime: 00:00
Job Starttime: 08:30
Job Starttime: AT 1800

❌ WRONG:
Job Starttime: midnight
Job Starttime: 8:30 AM
Job Starttime: everyday at 8am
```

---

#### **Error 3: Interval job not running in time window**

**Cause:** Missing `Job End Time` or incorrect format

**Solution:** Always provide start AND end time for windowed intervals
```
✅ CORRECT:
Job Starttime: 06:00
Job End Time: 22:00
Scheduled Frequency: FREQ=INTERVAL;interval=30;units=minutes

✅ ALSO CORRECT (embedded):
Scheduled Frequency: FREQ=INTERVAL;interval=30;units=minutes;starttime=06:00;endtime=22:00
```

---

#### **Error 4: Job not running on expected days**

**Cause:** Incorrect `byday` parameter or missing day specification

**Solution:** Use explicit day list
```
✅ CORRECT:
Scheduled Frequency: FREQ=WEEKLY;byday=Mon,Wed,Fri

❌ WRONG:
Scheduled Frequency: Monday Wednesday Friday (use FREQ= format)
```

---

## **8. Best Practices**

### **✅ DO's**

1. **Always use 24-hour format** (`08:30`, not `8:30 AM`)
2. **Use IANA timezone names** (`America/New_York`, not `EST`)
3. **Use FREQ= format** for Scheduled Frequency (most reliable)
4. **Specify end time** for interval jobs with time windows
5. **Test in DEV** environment before promoting to PROD
6. **Use ISO date format** for Firstrun Date (`YYYY-MM-DD`)
7. **Document recovery procedures** in Job Recovery1/Recovery2 fields
8. **Use descriptive job names** (include environment, function, system)

### **❌ DON'Ts**

1. **Don't use natural language** for schedules (`"everyday at midnight"`)
2. **Don't use 12-hour format** (`8:30 AM`, `3:00 PM`)
3. **Don't use generic timezone abbreviations** alone (`EST` without IANA name)
4. **Don't mix formats** (use FREQ= format consistently)
5. **Don't forget time windows** for interval jobs (will run 24/7)
6. **Don't use spaces in job names** (use dashes or underscores)
7. **Don't skip testing** - always verify in dev first

### **Naming Conventions**

**Recommended Job Name Pattern:**
```
{ENV}-{SYSTEM}-{FUNCTION}-{LOCATION}-{SEQUENCE}

Examples:
PMFG-BU-NA3-MFG-PPPTRP05-A12P-0477
PROD-QAD-REPORT-NA-001
DEV-SAPHR-PAYROLL-EMEA-DAILY
```

**Recommended Trigger Name Pattern:**
```
{JOB_NAME}-TR{SEQUENCE}

Example:
PMFG-BU-NA3-MFG-PPPTRP05-A12P-0477-TR001
```

---

## **9. Quick Reference Card**

### **Most Common Patterns**

| Need | Scheduled Frequency | Job Starttime | Job End Time |
|------|---------------------|---------------|--------------|
| **Daily at time** | `FREQ=DAILY;INTERVAL=1` | `08:30` | — |
| **Weekdays** | `FREQ=WEEKLY;byday=Mon,Tue,Wed,Thu,Fri` | `09:00` | — |
| **Every 15 min (24/7)** | `FREQ=INTERVAL;interval=15;units=minutes` | `00:00` | — |
| **Every 30 min (window)** | `FREQ=INTERVAL;interval=30;units=minutes` | `06:00` | `22:00` |
| **Monthly on day 15** | `FREQ=MONTHLY;monthday=15` | `03:00` | — |

### **Supported Units for Intervals**

- `minutes` - Most common (every 5, 10, 15, 30, 45 minutes)
- `hours` - For longer intervals (every 1, 2, 4, 6, 12 hours)
- `seconds` - Rarely used (for very frequent jobs)

---

## **10. Document Download**

This SOP is available in multiple formats:

- **Markdown:** `/docs/StoneBranch_Trigger_Schedule_SOP.md`
- **PDF:** *(Generate using markdown-to-pdf converter)*
- **DOCX:** *(Generate using pandoc: `pandoc StoneBranch_Trigger_Schedule_SOP.md -o StoneBranch_Trigger_Schedule_SOP.docx`)*

---

## **11. Change History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-06 | Automation Team | Initial release |

---

## **12. Approval**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **Author** | Automation Team | | 2026-07-06 |
| **Reviewer** | | | |
| **Approver** | | | |

---

**End of Document**
