# StoneBranch Job Deletion Automation - Idea Submission

---

## **Idea Title**
**Automated StoneBranch UAC Job Deletion Portal with Dependency Analysis and Recovery Center**

---

## **Proposal**

### **Current Process**

1. **Manual Job Deletion in UAC Console**
   - Automation engineer receives deletion request via ServiceNow ticket
   - Logs into StoneBranch Universal Automation Center (UAC)
   - Searches for job by name in UAC console
   - Manually inspects job for dependencies (triggers, workflows, references)
   - Checks for active/running instances (must wait or force-finish)
   - Deletes associated triggers manually (one at a time)
   - Deletes the job itself
   - Documents deletion in tracking spreadsheet
   - **Time per job:** 10-15 minutes
   - **Risk:** Accidental deletion of wrong job or missing dependencies

2. **Dependency Analysis Challenges**
   - **No automated dependency detection** - engineer must manually check:
     - Time triggers associated with the job
     - Workflow triggers (composite triggers)
     - Reference job dependencies (other jobs calling this job)
     - Active/running instances
   - **High risk of orphaned triggers** if not all deleted
   - **No rollback capability** - deletion is permanent

3. **Volume & Impact**
   - **Current volume:** 100-150 deletion requests per month
   - **Manual effort:** 15-25 hours/month
   - **Error rate:** 3-5% (wrong job deleted, orphaned triggers, missing dependencies)
   - **Recovery effort:** 30-60 minutes per mistake (recreate job from backup documentation)

4. **Backup & Recovery**
   - **No automated backup** before deletion
   - Manual export of job definition (if remembered)
   - Stored in network drive or email
   - Difficult to restore (must recreate manually)

### **Problem Area / Gap**

1. **High Risk of Data Loss**
   - Permanent deletion with no undo/rollback
   - No automated backup before deletion
   - Accidental deletion of wrong job due to similar names
   - Loss of job configuration, triggers, and history

2. **Missing Dependency Analysis**
   - No visibility into what will be affected by deletion
   - Orphaned triggers left in UAC consuming resources
   - Broken workflows if reference jobs are deleted
   - No warning about active instances

3. **Manual & Time-Consuming**
   - Must inspect each job individually
   - Must manually find and delete each trigger
   - Must check for running instances manually
   - No bulk deletion capability

4. **Lack of Auditability**
   - No centralized log of deletions
   - Difficult to track who deleted what and when
   - No approval workflow for critical jobs
   - Hard to recover deleted jobs

5. **No Self-Service Capability**
   - Only automation engineers can delete jobs
   - Increases dependency on central team
   - Delays decommissioning projects

### **Value Add Proposal**

**Automated StoneBranch Job Deletion Portal** with intelligent dependency analysis and recovery center:

#### **1. Smart Deletion with Dependency Inspection**
- **Automated dependency analysis** before deletion:
  - Lists all associated triggers (time, file, workflow)
  - Identifies reference job dependencies (which jobs call this job)
  - Detects active/running instances
  - Shows composite triggers that include this job
  - Estimates impact (how many other jobs affected)

- **Visual dependency tree** showing relationships
- **Warning prompts** for high-risk deletions
- **Forced finish capability** for active instances
- **Bulk deletion** with dependency resolution across all jobs

#### **2. Recovery Center (Backup & Restore)**
- **Automatic backup** before every deletion:
  - Complete job definition (JSON)
  - All associated triggers
  - Custom fields and notes
  - Business services mapping
  - Timestamped and stored securely

- **One-click restoration** from Recovery Center:
  - Browse deleted jobs by date, name, or environment
  - Preview job definition before restore
  - Restore to same or different name
  - Restore to different environment (Dev → QA → Prod)

- **Retention policy**: 90 days (configurable)
- **Search & filter** deleted jobs
- **Bulk export** of deleted jobs for audit

#### **3. Safe Deletion Workflow**
1. **Inspect** - View job details and dependencies
2. **Backup** - Automatic backup to Recovery Center
3. **Validate** - Check for active instances and dependencies
4. **Delete** - Remove job and associated triggers
5. **Verify** - Confirm deletion and log audit trail
6. **Recover** - Restore if needed (within 90 days)

#### **4. Advanced Features**
- **Dry run mode** - Preview what will be deleted without executing
- **Scheduled deletion** - Delete at future date/time
- **Approval workflow** - Require manager approval for prod jobs
- **Bulk operations** - Delete 50-100 jobs simultaneously
- **Reference job protection** - Warn before deleting jobs used by others
- **Force finish instances** - Terminate active jobs before deletion
- **Audit logging** - Complete trail of all deletions

### **Post Implementation Delivery**

#### **Immediate Deliverables (Week 1-2)**
1. **Production-ready deletion portal**
   - Inspection page with dependency visualization
   - Recovery Center with search and restore
   - Bulk deletion interface
   - Audit log viewer

2. **User Documentation**
   - Standard Operating Procedure (SOP) for job deletion
   - Recovery Center usage guide
   - Troubleshooting guide for common scenarios
   - Video tutorial

3. **Technical Documentation**
   - API documentation
   - Backup storage architecture
   - Security review report
   - Disaster recovery plan

#### **Ongoing Support (Month 1-3)**
1. **User Training**
   - 1-hour workshop for automation team
   - Hands-on practice with Recovery Center
   - Q&A session

2. **Monitoring & Optimization**
   - Usage analytics (deletion volume, recovery rate)
   - Error tracking
   - Storage monitoring for backup repository

3. **Continuous Improvement**
   - Enhanced dependency analysis
   - Integration with approval systems
   - Automated cleanup recommendations

### **Resources Required**

#### **Infrastructure**
- **Same server as Job Creation Portal**
  - Reuses existing infrastructure (no additional cost)
  - **Additional storage:** 50-100 GB for Recovery Center backups
  - Estimated additional cost: $20-30/month

- **Backup Storage**
  - Local disk or network storage
  - Retention: 90 days (configurable)
  - Compression enabled (saves 60-70% space)

#### **Human Resources**
- **Development & Deployment:** Already completed (0 FTE)
- **Initial Setup:** 0.25 FTE for 1 week (leverage existing deployment)
- **User Training:** 0.1 FTE for 1 week
- **Ongoing Maintenance:** <0.05 FTE (minimal)

#### **Security & Compliance**
- **Same security review as Job Creation Portal**
- **Data retention policy** compliance check
- **Backup encryption** (data at rest)

### **Business Process Change**

#### **Before (Manual Process)**
1. Requestor submits ServiceNow ticket for job deletion
2. Automation engineer reviews ticket (5 minutes)
3. Engineer logs into UAC and searches for job (2 minutes)
4. Engineer manually inspects job for triggers and dependencies (5-10 min)
5. Engineer checks for active instances (2 minutes)
6. Engineer exports job definition for backup (3 minutes) - *if remembered*
7. Engineer deletes triggers manually (2-5 min per trigger)
8. Engineer deletes job (1 minute)
9. Engineer updates documentation (3 minutes)
10. ServiceNow ticket closed

**Total Time per Job:** 10-15 minutes  
**Batch of 20 jobs:** 3-5 hours  
**Risk:** High (3-5% error rate)

#### **After (Automated Process)**
1. Requestor submits ServiceNow ticket for job deletion
2. Automation engineer reviews ticket (2 minutes)
3. Engineer searches for job in portal (10 seconds)
4. Portal displays automated dependency analysis (instant)
5. Portal automatically backs up job to Recovery Center (instant)
6. Engineer reviews dependency tree and confirms deletion (1 minute)
7. Portal deletes job + all triggers automatically (10-30 seconds)
8. Portal logs deletion in audit trail (automatic)
9. ServiceNow ticket closed

**Total Time per Job:** 3-4 minutes (70% reduction)  
**Batch of 20 jobs:** 1 hour (80% reduction)  
**Risk:** Minimal (<0.5% error rate) + Recovery available

#### **Process Changes**
- **Automation team:** Focus shifts from manual inspection to review & approval
- **Backup:** Automatic (no longer manual/optional)
- **Recovery:** Available for 90 days (eliminates recreation effort)
- **Auditability:** Built-in (no manual tracking needed)

### **Challenges**

#### **Technical Challenges**
1. **Complex Dependency Detection**
   - **Challenge:** UAC API doesn't provide direct dependency queries
   - **Mitigation:** Built intelligent inspection algorithm that queries multiple endpoints
   - **Status:** Implemented ✅

2. **Active Instance Handling**
   - **Challenge:** Cannot delete jobs with active instances
   - **Mitigation:** Built force-finish capability with user confirmation
   - **Status:** Implemented ✅

3. **Backup Storage Management**
   - **Challenge:** Recovery Center backups could grow large
   - **Mitigation:** 90-day retention, compression, automated cleanup
   - **Status:** Implemented ✅

#### **Organizational Challenges**
1. **Fear of Permanent Deletion**
   - **Challenge:** Team hesitant to delete jobs without manual verification
   - **Mitigation:** Recovery Center provides safety net, dry-run mode available
   - **Impact:** Low - tool increases confidence with automated backup

2. **Storage Approval**
   - **Challenge:** Additional 50-100 GB storage needed
   - **Mitigation:** Minimal cost ($20-30/month), compression reduces footprint
   - **Timeline:** 1 week for approval

3. **Data Retention Policy**
   - **Challenge:** Ensure compliance with corporate data retention policies
   - **Mitigation:** Configurable retention (default 90 days), automated purge
   - **Impact:** Low - backup data is operational, not personal data

#### **Risk Mitigation**
- **Recovery Center:** Safety net for accidental deletions
- **Dry run mode:** Preview deletions before execution
- **Audit logging:** Complete trail for compliance
- **Phased rollout:** Test in dev before prod
- **Rollback:** Manual UAC deletion still available

---

## **Value Creation**

### **Time to Implement**

#### **Phase 1: Development (Completed)**
- ✅ Deletion workflow: 3 weeks
- ✅ Recovery Center: 2 weeks
- ✅ Dependency analysis: 2 weeks
- ✅ Testing and validation: 1 week

#### **Phase 2: Deployment (1 week)**
- Leverage existing infrastructure from Job Creation Portal
- Configure backup storage
- User training

**Total Implementation Time:** 1 week (development already complete)

### **Projected Cost of Implementation**

#### **One-Time Costs**
| Item | Cost | Notes |
|------|------|-------|
| Development | $0 | Already completed |
| Infrastructure Setup | $0 | Reuses existing deployment |
| Storage Configuration | $100 | Backup repository setup |
| Security Review | $0 | Included with Job Creation Portal review |
| Training | $0 | Internal team (2 hours) |
| **Total One-Time** | **$100** | |

#### **Recurring Costs (Annual)**
| Item | Cost | Notes |
|------|------|-------|
| Additional Storage | $240 | $20/month for backup storage |
| Maintenance | $0 | Minimal overhead |
| Software Licenses | $0 | All open source |
| **Total Annual** | **$240** | |

**Total 3-Year TCO:** $820

### **Projected Value of Idea**

> **Quantification follows HCL Value Creation methodology:** *Segregate stakeholders → Quantify individual benefits → Sum total value*

---

#### **STEP 1: Segregation of Value-Adds**

**Stakeholders Benefiting from this Idea:**

1. **HCL Automation Engineers** - Direct time savings from eliminating manual job deletion
2. **HCL Operations Team** - Reduced risk and faster recovery from accidental deletions
3. **Customer (End Client)** - Improved UAC performance from cleanup of orphaned resources
4. **HCL Organization** - Reduced operational risk and improved audit compliance

---

#### **STEP 2: Quantification of Benefits**

**Following the "Time = Money" approach:**

**1. Direct Time Savings for HCL Resources**

*Current State:*
- Volume: 150 job deletion requests per month
- Time per job: 12 minutes = 0.2 hours (search + inspect + backup + delete triggers + delete job + document)
- Total monthly effort: 150 × 0.2 hours = **30 hours/month**
- Annual effort: 30 × 12 = **360 hours/year**

*Future State:*
- Time per job (automated deletion): 4 minutes = 0.067 hours
- Total monthly effort: 150 × 0.067 = **10 hours/month**
- Annual effort: 10 × 12 = **120 hours/year**

*Time Saved:*
- **240 hours/year** (67% reduction)

*Value Calculation:*
- HCL billing rate: $50/hour (standard rate for automation engineer)
- **Annual savings: 240 hours × $50/hour = $12,000**

---

**2. Error Reduction & Recovery Time Elimination**

*Current State:*
- Error rate: 4% (6 jobs/month deleted incorrectly or with issues)
- Breakdown:
  - Accidental wrong job deletion: 2 incidents/month
  - Orphaned triggers left behind: 3 incidents/month
  - Missing dependency analysis: 1 incident/month
- Recovery time per incident:
  - Wrong job deletion: 60 min to recreate from scratch
  - Orphaned trigger cleanup: 20 min to find and delete
  - Dependency issue: 30 min to fix broken workflows
- Monthly recovery time: (2 × 60) + (3 × 20) + (1 × 30) = 210 min = 3.5 hours
- Annual recovery time: 3.5 × 12 = **42 hours/year**

*Future State:*
- Error rate: <0.5% (<1 incident/month)
- Recovery time with Recovery Center: 5 minutes (one-click restore)
- Annual recovery time: 1 × 5/60 × 12 = **1 hour/year**

*Time Saved:*
- **41 hours/year** (98% reduction in recovery effort)

*Value Calculation:*
- Billing rate: $50/hour
- **Annual savings: 41 hours × $50/hour = $2,050**

---

**3. Orphaned Resource Cleanup (UAC Performance Optimization)**

*Current State:*
- Orphaned triggers created: ~20/month (triggers not deleted with jobs)
- Annual accumulation: 240 orphaned triggers
- Impact:
  - UAC database bloat
  - Slower search and query performance
  - Unnecessary trigger evaluations consuming CPU
  - Confusion during troubleshooting

*Manual Cleanup Effort:*
- Cleanup performed: Quarterly (every 3 months)
- Time to identify orphaned triggers: 4 hours
- Time to delete: 2 hours
- Quarterly effort: 6 hours
- Annual effort: 6 × 4 = **24 hours/year**

*Future State:*
- Automatic deletion of all triggers with job
- Orphaned triggers: <2/month (99% reduction)
- No manual cleanup needed: **0 hours/year**

*Time Saved:*
- **24 hours/year** (100% elimination of cleanup effort)

*Value Calculation:*
- Billing rate: $50/hour
- **Annual savings: 24 hours × $50/hour = $1,200**

---

**4. Avoided Business Impact from Accidental Deletions**

*Current State:*
- Accidental wrong job deletions: 2 incidents/month = 24/year
- Business impact per incident:
  - Job unavailable until recreated: Average 2 hours downtime
  - Missed scheduled runs during downtime: 1-2 executions
  - Business process disruption
  - Emergency recreation effort: Already counted in recovery time
  - Customer escalation and damage control: 1 hour per incident

*Future State (with Recovery Center):*
- Recovery time: 5 minutes (restore from backup)
- No missed executions (quick restoration)
- No escalations: **0 hours**

*Time Saved:*
- Customer escalation handling: 24 incidents × 1 hour = **24 hours/year**

*Value Calculation:*
- Average escalation handling rate: $60/hour (includes management time)
- **Annual savings: 24 hours × $60/hour = $1,440**

---

**5. Improved Audit Compliance & Reporting**

*Current State:*
- Manual tracking of deletions in spreadsheet
- Time to generate audit reports: 4 hours/quarter
- Annual effort: 4 × 4 = **16 hours/year**
- Audit findings for incomplete documentation: 2 hours/year remediation

*Future State:*
- Automatic audit logging with complete trail
- Instant report generation: **<1 hour/year**

*Time Saved:*
- **17 hours/year** (94% reduction)

*Value Calculation:*
- Billing rate: $50/hour
- **Annual savings: 17 hours × $50/hour = $850**

---

**6. Decommissioning Project Acceleration (Opportunity Cost)**

*Current State:*
- Large decommissioning projects delayed by manual deletion bottleneck
- Example: Migrating 100 jobs to new platform requires deleting 100 old jobs
- Manual deletion time: 100 jobs × 12 min = 20 hours over multiple days
- Project delay: 5 working days (waiting for deletion capacity)

*Future State:*
- Bulk deletion: 100 jobs in 2 hours (same day)
- No project delay
- Estimated 3 large decommissioning projects/year

*Time Saved:*
- 3 projects × 18 hours = **54 hours/year** (project acceleration)

*Value Calculation:*
- Project team idle time rate: $60/hour
- **Annual savings: 54 hours × $60/hour = $3,240**

---

#### **STEP 3: Cumulative Value**

**Total Annual Benefit:**

| Benefit Category | Annual Value | Calculation Basis |
|------------------|--------------|-------------------|
| Direct time savings (deletion operations) | $12,000 | 240 hrs × $50/hr |
| Error recovery elimination | $2,050 | 41 hrs × $50/hr |
| Orphaned resource cleanup automation | $1,200 | 24 hrs × $50/hr |
| Avoided business impact (escalations) | $1,440 | 24 hrs × $60/hr |
| Audit compliance automation | $850 | 17 hrs × $50/hr |
| Decommissioning project acceleration | $3,240 | 54 hrs × $60/hr |
| **TOTAL ANNUAL BENEFIT** | **$20,780** | |

---

#### **ROI Calculation**

**Investment Required:**

| Item | Amount | Type |
|------|--------|------|
| Development cost | $0 | Already completed |
| Infrastructure setup | $100 | One-time (reuses Job Creation infrastructure) |
| Additional storage (backup repository) | $240 | Annual ($20/month) |
| **Total Year 1 Investment** | **$340** | |
| **Annual Recurring Cost** | **$240** | Years 2-3 |

**Return on Investment:**

- **Year 1:**
  - Investment: $340
  - Benefit: $20,780
  - Net Benefit: **$20,440**
  - **ROI: 6,012% (60.1x return)**

- **Year 2-3:**
  - Annual Investment: $240
  - Annual Benefit: $20,780
  - Annual Net Benefit: **$20,540**
  - **ROI: 8,558% (85.6x return)**

- **3-Year Total:**
  - Total Investment: $820 ($340 + $240 + $240)
  - Total Benefit: $62,340 ($20,780 × 3)
  - **3-Year Net Benefit: $61,520**
  - **3-Year ROI: 7,502% (75x return)**

**Payback Period:** **4 days** (based on daily benefit of $57)

---

#### **Qualitative Benefits (Non-Monetized)**

- **Risk mitigation:** Recovery Center provides safety net for 90 days (eliminates permanent data loss)
- **Confidence:** Engineers can delete jobs without fear of mistakes
- **Scalability:** Can handle 10x deletion volume for large migration projects
- **Compliance:** Complete audit trail meets governance requirements
- **Resource optimization:** Automatic cleanup prevents UAC database bloat
- **Knowledge retention:** Deleted job configurations preserved for reference
- **Self-service potential:** Authorized users can safely delete jobs (future state)
- **Business continuity:** 5-minute recovery vs 60-minute recreation
- **Employee satisfaction:** Reduced stress from high-risk manual operations

---

## **Benefits**

### **Cost Reduction**
- **Direct labor savings:** $12,000/year from automated deletion operations (240 hrs × $50/hr)
- **Error recovery elimination:** $2,050/year from 98% faster recovery (41 hrs × $50/hr)
- **Orphaned resource cleanup:** $1,200/year from automated trigger cleanup (24 hrs × $50/hr)
- **Avoided escalations:** $1,440/year from preventing business impact (24 hrs × $60/hr)
- **Audit compliance:** $850/year from automated reporting (17 hrs × $50/hr)
- **Project acceleration:** $3,240/year from faster decommissioning (54 hrs × $60/hr)
- **Total cost reduction:** **$20,780/year**

### **Increase Efficiency**
- **67% time reduction** per job deletion (12 min → 4 min)
- **80% faster batch deletion** (20 jobs in 1 hour vs 5 hours)
- **Instant dependency analysis** (vs 5-10 min manual inspection)
- **Automated backup** eliminates manual export step (saves 3 min/job)
- **One-click recovery** (5 min vs 60 min manual recreation - 92% faster)
- **100% elimination** of quarterly orphaned trigger cleanup (24 hrs/year saved)

### **Improve Quality**
- **90% error rate reduction** (4% → <0.5%)
- **Automated dependency detection** prevents orphaned resources and broken workflows
- **Forced instance termination** prevents deletion failures
- **Recovery Center** enables 5-minute rollback (vs permanent loss)
- **Audit trail** improves compliance and troubleshooting
- **98% reduction** in recovery effort (42 hrs → 1 hr per year)

### **Reduce Process Cycle Time**
- **Deletion time:** 12 min → 4 min per job (67% reduction)
- **Batch processing:** 20 hours → 2 hours for 100 jobs (90% reduction)
- **Recovery time:** 60 min → 5 min per job (92% reduction)
- **Eliminates manual backup step** (saves 3 min/job × 150 jobs = 7.5 hrs/month)
- **No manual documentation** (automatic audit logging saves 16 hrs/year)
- **Project acceleration:** 5 days → same day for large decommissioning projects

---

## **Strategic Alignment**

### **Risk Management**
- Reduces risk of permanent data loss (90-day Recovery Center)
- Provides business continuity capability (5-minute restoration)
- Improves audit trail for compliance and governance

### **Operational Excellence**
- Automates error-prone manual process (67% time savings)
- Optimizes UAC resource utilization (240 orphaned triggers/year prevented)
- Scales to handle large migration projects without additional headcount

### **Digital Transformation**
- Enables safe self-service deletion (future state)
- Provides modern UI for legacy operations
- Reduces dependency on specialized knowledge

---

## **Success Metrics**

| Metric | Baseline | Target (6 months) | Measurement |
|--------|----------|-------------------|-------------|
| Avg time per deletion | 12 min | <4 min | Portal analytics |
| Error rate | 4% | <0.5% | Incident reports |
| Orphaned triggers | 20/month | <2/month | UAC audit |
| Recovery rate | N/A | <5%* | Recovery Center usage |
| User adoption | 0% | 80% | % of deletions via portal |
| Accidental deletion impact | 60 min | <5 min | Recovery Center metrics |
| Annual time savings | 0 hrs | 240 hrs | Time tracking |

*\*Recovery rate <5% indicates high confidence in deletion process*

---

## **Recommendation**

**Approve for immediate deployment** alongside Job Creation Portal.

- ✅ Development complete and tested
- ✅ Minimal incremental cost ($100 one-time, $20/month)
- ✅ **Exceptional ROI: 6,012% (60.1x return) in Year 1**
- ✅ **Payback period: 4 days**
- ✅ **3-Year ROI: 7,502% (75x return)**
- ✅ Reduces operational risk with Recovery Center safety net
- ✅ Complements Job Creation Portal for end-to-end lifecycle management
- ✅ **Prevents 240 orphaned triggers/year (UAC performance optimization)**

**This automation provides essential safety net for deletion operations with exceptional ROI and risk reduction.**

---

## **Combined Value (Job Creation + Job Deletion)**

### **Total Investment**
- **One-time:** $600 ($500 creation + $100 deletion)
- **Annual recurring:** $2,640 ($2,400 + $240)
- **Year 1 Total:** $3,240
- **3-Year TCO:** $8,520

### **Total Annual Benefit**
- **Job Creation:** $120,700/year
- **Job Deletion:** $20,780/year
- **Combined:** **$141,480/year**

### **Combined ROI**
- **Year 1:**
  - Investment: $3,240
  - Benefit: $141,480
  - Net Benefit: **$138,240**
  - **ROI: 4,267% (42.7x return)**

- **3-Year Total:**
  - Investment: $8,520
  - Benefit: $424,440
  - Net Benefit: **$415,920**
  - **ROI: 4,881% (48.8x return)**

**Payback Period:** **6 days**

**Together, these automations transform StoneBranch job lifecycle management from manual, error-prone processes to automated, safe, and efficient operations with nearly 50x return on investment over 3 years.**

---

*Prepared by: Automation Team*  
*Date: 2026-07-06*  
*Contact: [Your Contact Info]*
