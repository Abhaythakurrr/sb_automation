# Stonebranch UAC — Standard Operating Procedures

---

## SOP 1: Managing Approvals for Job Creation / Modification / Deletion

**Purpose:**
To ensure proper approvals are in place before any job changes are made in Stonebranch UAC.

Stonebranch jobs can only be created, modified, or deleted based on a service request raised via the ServiceNow Service Catalog. Tickets raised through this channel will contain one of the following in the title:
- *Stonebranch Add Batch*
- *Stonebranch Modify or Delete Batch*

*(Note: Naming conventions will be updated at a later stage.)*

Any ticket raised outside this process must be rejected, and the requester must be informed of the correct procedure.

**Steps:**
1. Job creation or modification must be requested via a ServiceNow SCTASK.
2. The request must be raised by an authorised or primary approver.
3. If the requester is not an approved contact:
   - Ask them to contact their manager.
   - The manager must update the approval list.
4. Do not proceed with any job creation or modification without valid approval.

---

### SOP 1.1: Job Creation (Bulk or Single)

**Purpose:**
To ensure timely and accurate processing of job creation requests in Stonebranch UAC, particularly when the first run is scheduled shortly after the request is submitted.

**Scope:**
Applicable to all job creation requests received via ServiceNow, including both single and bulk requests.

---

**Procedure:**

**1. Validate the ServiceNow Ticket**
- Review the SCTASK ticket details thoroughly before proceeding.
- Confirm the following:
  - First Run Date
  - SLA compliance
- Note: Even if the SLA allows 9 days, prioritise based on urgency and the first run schedule. The first run date must be defined as per the ticket, and the task must be enabled accordingly.

**2. Assess Job Volume**
- Bulk requests: Ensure sufficient time is available for creation and testing.
- Single requests: If the first run is too close to the request date, notify the requester that a minimum 7-day lead time is recommended.

**3. Communicate with the Requester**
- If the request is urgent or the first run date is imminent, send an email using the standard template and clearly explain the 7-day lead time recommendation.

---

**Creating Jobs in Stonebranch UAC:**

1. Open the Stonebranch UAC console.
2. Navigate to **Tasks** → Click **Create New Task** or **Copy Existing Task**.
3. Fill in the following fields:

   - **Job Name** — Follow the naming convention:
     - Production: `PMFG-BU-<Region>-<App>-<JobCode>` (MFG Pro standard)
     - Test/QA: `Q<Application>_<Region>_<Priority>_<BU>_<App>`
   - **Description** and **Business Unit**
   - **Agent Cluster** — Always use the cluster, not the individual agent. Using an agent directly without credentials will result in a Start Failure.
   - **Credentials** — Use the appropriate credential (e.g., `mfgeb`, `mfg`, `quad`, or as specified in the ticket).
   - **Run as Sudo** — Always enable this. It grants admin-level execution without requiring a root login.
   - **Command / Script** — For Linux tasks, use the format:
     ```
     /usr/bin/bash -c 'unset TERM && <command>'
     ```
     Note: Use standard single quotes (`'`). Curly or smart quotes are not accepted.
   - **Runtime Directory** — Fill in if required.
   - **Maximum Runtime** — Set as per the ticket (e.g., 60 minutes).
   - **Notes** — Include the ServiceNow ticket number and a brief description of the job purpose.

4. Save the task.

---

**Using the Copy Task Method (Recommended for Efficiency):**

1. Navigate to the Stonebranch Production console.
2. Search for an existing job with a similar configuration.
   - Example: If the new job name is `PMFG-BU-EU1-SAP-MEND-ALL-S234`, search using the pattern `PMFG-BU-EU1-SAP-*`.
3. Select a similar job and click **Copy**.
4. Update the following fields as per the SCTASK:
   - Job Name
   - Job Description
   - Agent Cluster / Workstation
   - Credentials
   - Command / Script
   - Schedule Details:
     - First Run Date
     - Frequency
     - Start Time
     - Time Zone
     - Maximum Runtime

**5. Update Notes and Version**
- Add the ServiceNow ticket number in the Notes section. Include both a Title and Text for clarity.
- Save the changes to create a new version of the job.
- When updating a task, the ticket number (SCTASK) must be entered in the designated field. Incident numbers (INC) are not accepted in this field — only SCTASK references.
- For modification requests, reference the Modify request ticket accordingly.

---

#### SOP 1.1.1: Creating a Workflow with Dependencies

**Steps:**

1. Once all tasks have been created following the Task Creation Procedure, navigate to **Workflows**.
2. Click the **+** button to create a new Workflow. Follow the standard naming conventions.
3. Fill in the required fields and leave the rest as default.
4. Click **Save & View** to remain in the current Workflow.
5. Click **Edit Workflow** to open the Workflow Editor.
6. In the Workflow Editor, click the **+** button and search for all tasks that need to be included.
7. Drag and drop the tasks into the grey editor area.
8. Once all tasks are placed, select the horizontal arrow tool and connect the tasks in the required execution order to define dependencies.
9. Save the changes and close the Editor.
10. The dependency Workflow is now complete. Proceed to create a Trigger for this Workflow.

---

#### SOP 1.1.2: Creating a Time-Based Trigger for a Job

**Purpose:**
To configure and schedule a job in Stonebranch UAC using a time-based trigger, ensuring accurate execution as per business requirements.

**Procedure:**

**1. Access the Time Trigger Section**
- Navigate to **Time Triggers** in the Stonebranch console.
- Click **Create New Trigger**.

**2. Apply the Naming Convention**
- Use the standard format: `P_<App>_<Region>_<Frequency>_<PlantCode>_TR001`
- Alternatively, use the Job Stream name from the ticket as the trigger name. Since Job Stream names are not used directly in Stonebranch UAC, if no Job Stream name is provided, use the task name with the suffix `-TR001` or `-TR002`.
- Example: `P_SAP_EU_Daily_PL123_TR001`
- If a task requires two separate time windows (e.g., every 20 minutes from 00:01–12:00 Mon–Sat, and once at 16:00 on Sundays), create two triggers: `-TR001` and `-TR002`.

**3. Configure Trigger Settings**
- Time Zone: As per the ticket (e.g., `Asia/Bangkok`)
- Start Time: As per the ticket (e.g., `00:30`)
- Interval: If applicable (e.g., every 15 minutes)
- Restricted Time Window: If applicable (e.g., 00:01 to 23:46)
- Skip Before Date: Enable if required based on the first run date.

**4. Bind the Trigger to the Task**
- Associate the newly created trigger with the relevant task.

**5. Save and Enable the Trigger**
- Save the configuration.
- Enable the trigger. After creation, the trigger must always be in an **Enabled** state. The first run criteria can be controlled using the `intervalStartingDate` field.
- The SCTASK must not be closed before the first successful run.

**6. Update Notes**
- Add details in the Notes section similar to the task creation notes. Include both a Title and Description for clarity and audit purposes.
- The version of instances must correspond to the ticket numbers. Be careful when updating tasks — refer to previous notes as well.

**7. Validate the Schedule**
- Click **List Qualifying Times** to forecast execution dates and times.
- Select the number of future occurrences to review (e.g., next 30 days for daily jobs).
- Verify that the scheduled times align with the requirements in the ticket.

**8. Final Steps**
- Enable the trigger and confirm the job is active for its first run.
- Save all changes before closing the window.
- Update the SCTASK in ServiceNow with job details and close the ticket.
- Inform the requester of completion.

**9. Monitor the First Execution**
- Observe the first run to confirm successful execution.
- If the job fails on the first run, transfer the ticket to the Application team immediately and follow the escalation process. Notify the requester promptly.

**Key Recommendations:**
- Always validate forecasted times before enabling the trigger.
- Maintain clear documentation in the Notes section and in ServiceNow.
- Communicate proactively with the requester for transparency.

---

#### SOP 1.1.3: Creating Complex Schedules (Multiple Time Windows)

**Purpose:**
To handle jobs with complex run schedules that require multiple time windows or interval-based execution.

**Steps:**

**Create Multiple Time Triggers**
To define different time windows (e.g., 08:00–12:00 and 16:00–23:00):

1. Navigate to: **Automation Center → Triggers → Time Triggers**
2. Create the first Time Trigger:
   - Name: Use a meaningful name (e.g., `PMFG-BU-XX-APP-JOBNAME_TR001`)
   - Time Style: **Time Interval**
   - Time Interval: `10` Minutes
   - Restrict Times: Enable
     - Enabled Start: `08:00`
     - Enabled End: `12:00`
3. Repeat the above steps for the second time window (e.g., `_TR002` with 16:00 to 23:00).

---

#### SOP 1.1.4: Using Complex Calendars to Skip Holidays

1. In the **Calendar** field of the trigger, select a calendar that defines holidays and business days.
2. Enable **Special Restriction**:
   - Simple Restriction:
     - Situation: **On Holiday**
     - Action: **Do Not Trigger** or **Next Business Day**

---

#### SOP 1.1.5: Setting Repeat Intervals

- Under **Time Interval**, configure:
  - Time Interval: `10`
  - Time Interval Units: `Minutes`
  - Optional: Use **Initial Time Offset** to fine-tune start times.
- Enable **Forecast** in the trigger to simulate and preview upcoming run times.
- Use the **Forecasts List** to confirm the job will run at the expected times.

---

#### SOP 1.1.6: Using Recurring Tasks (When Necessary)

**Purpose:**
To handle jobs that need to run repeatedly within a workflow.

**Steps:**

1. In the created Workflow, go to **Editor** → Right-click on the grey area → Select **New Task**.
2. Search for and select **Recurring Task**.
3. Fill in the basic fields and set the repeat range in **Recurring Details**:
   - Set the interval (e.g., every 30 minutes).
   - Set a Time Window to specify the allowed run range.
   - In **Launch Details**, select the relevant Linux or Windows task.
   - **Task Launch Skip Conditions** follow the same logic as in Triggers.
4. Save the task and save the changes in the Editor.

**Key Recommendations:**
- Use Recurring Task only if the job must run multiple times within a workflow.
- Prefer Time Triggers for simplicity wherever possible.
- If used:
  - Ensure **Active by Trigger** is set correctly.
  - Monitor for stacking issues.
  - Clear failed instances to prevent workflow blockage.

---

### SOP 1.2: Deleting a Job or Workflow

**Purpose:**
To safely remove a job or workflow from Stonebranch UAC following the correct deletion sequence.

**Important Notes:**
- Items must always be removed in this order: **Trigger → Workflow (if applicable) → Task**.
- Record every step taken during deletion in the ServiceNow SCTASK. Since items are permanently removed from Stonebranch UAC, notes must be added to the ticket for audit purposes — including which Workflows were impacted or removed, which Triggers were deleted or modified, and which Tasks were removed.

**Steps:**

1. Check if the job has any active instances.
   - If yes, force finish or cancel them.
   - Open the job → Go to the **Instances** tab → Right-click the active instance → Select **Force Finish**.

2. Open the task definition and click **View Parents** to check if the task is part of any Workflow.

3. **If the task has no parent Workflow**, proceed directly to the Trigger steps below.

4. **If the task is part of a Workflow:**
   - Open the parent Workflow and navigate to its Triggers.
   - Open the Trigger definition and note the trigger name.
   - Check how many tasks are associated with the trigger.
     - If the trigger has **more than one task**: Click the lock icon to unlock the Task(s) field, remove the requested task by clicking the **–** icon, save the changes, and keep the rest of the trigger intact.
     - If the trigger has **only one task**: Delete the entire trigger.
   - Record the changes made in the SCTASK (note which triggers were removed or modified).

5. Return to the Workflow and open the **Editor**:
   - If the Workflow has **more than one task**: Remove only the requested task from the Workflow Editor, save the changes, and keep the Workflow intact. If the task is also linked to a schedule, that can be removed as well.
   - If the Workflow has **only one task**: Delete the entire Workflow. Copy the Workflow name before deletion.
   - Record the changes in the SCTASK (note which Workflows were deleted or modified).

6. Once all Trigger and Workflow steps are complete, return to the Task definition and delete the task.

7. Record the deletion in the SCTASK.

---

### SOP 1.3: Handling Agent Install Requests

**Purpose:**
To process requests for new Stonebranch agent installations.

**Steps:**

1. Receive the ServiceNow ticket for the agent install request.
2. Check if the requested agent cluster already exists in Stonebranch UAC.
3. If the cluster does not exist:
   - Notify the L2 team.
   - Inform the requester to raise a Stonebranch UAC Agent Install request through the correct channel.
4. Once the agent is installed and active, proceed with job creation as per the ticket.

---

### SOP 1.4: Suspending and Resuming Agent Clusters (Unix / Windows) for Maintenance

**Purpose:**
To safely suspend and resume agent clusters during scheduled maintenance, ensuring no active jobs or issues remain before and after the activity.

**Pre-Maintenance Steps:**

- When notified of any maintenance activity on a server that is a Stonebranch agent, check with the relevant Application team and obtain approval to suspend and resume the agent and agent cluster before and after the maintenance window.
- Notify the L2 team before suspending any cluster.
- Navigate to **Agent Clusters (Unix / Windows)** and **Agents** in the Stonebranch management console.
- Select the target cluster and agent for maintenance.

**Suspending the Agent Cluster and Agent:**

1. Search for the Agent Cluster name in the Stonebranch UAC search box.
2. Right-click on the Agent Cluster name and select **Open**.
3. Click **Suspend Agent Cluster** to suspend the cluster.
4. Click on the **Agents in Cluster** tab.
5. Click on the agent(s) listed in the tab.
6. Click **Suspend Agent** to suspend the individual agent(s).

Both the Agent Cluster and the Agent(s) within it are now suspended.

**Resuming the Agent Cluster and Agent:**

1. Search for the Agent Cluster name in the Stonebranch UAC search box.
2. Right-click on the Agent Cluster name and select **Open**.
3. Click **Resume Agent Cluster** to resume the cluster.
4. Click on the **Agents in Cluster** tab.
5. Click on the agent(s) listed in the tab.
6. Click **Resume Agent** to resume the individual agent(s).

Both the Agent Cluster and the Agent(s) within it are now resumed.

**Post-Maintenance Steps:**

- Before resuming, clear all **Execution Wait** jobs on the agent cluster. Force finish them after confirming with the Application team.
- Confirm no active issues exist in the cluster.
- Click **Resume** to restore cluster functionality.

---

#### SOP 1.4.1: Managing Execution Wait Status

**Purpose:**
To resolve multiple stacked instances of the same job caused by Execution Wait status.

**Steps:**

1. Go to the **Activity Monitor**.
2. Filter by task name, or navigate to the agent / agent cluster and check the instances for any in **Execution Wait** status.
3. Sort the instances by **Start Time**.
4. Force finish all instances except the most recent one.
5. Resume the agent cluster only after clearing the old instances.

**Important:** Before force finishing, verify the task type:
- If it is a **time interval task** (e.g., runs every 15 minutes), force finishing older instances is generally safe.
- If it is a **weekly or monthly task**, connect with the Application team before taking any action.

---

## SOP 2: Incident Management

**Purpose:**
To manage job failures effectively, understand how incidents are generated in Stonebranch UAC, and ensure proper escalation and resolution.

- Failed or long-running jobs automatically generate ServiceNow incident tickets.
- Default priority: **P4**. Escalate to **P3** if required (refer to the escalation matrix).
- SLA:
  - Response: 1–3 hours
  - Resolution: 24–48 hours
- Use work notes for all communication and updates within the ticket.

**Tracking and Auditing:**
- Match the following for each incident:
  - UUID
  - Incident Number
  - Job Status
  - Next Successful Run
- GUI logs are retained for 90 days. For older logs, contact the L2 team or vendor.
- Generate Excel reports for audit purposes as required.

---

### SOP 2.1: Handling Failed Jobs

**Steps:**

**1. Job Failure and Incident Creation**
- When a job fails, an incident ticket is automatically generated in ServiceNow. The incident number is also updated in the **Operational Memo** field of the task instance in Stonebranch UAC.
- If the Operational Memo is not updated automatically, inform the L2 team to investigate and fix the integration.
- The failed job is analysed and assigned to the relevant support group based on the job instructions sheet (e.g., QAD DBA Process Global team for PMFG jobs).

**2. Viewing Incident and Output Details**
- Open the Stonebranch UAC console → Navigate to **Tasks** → Search for the job name.
- Right-click on the relevant task instance → Select **Retrieve Output** to fetch the execution output.
- Alternatively, go to **Details → Show Details** to view detailed information including variables and execution logs.
- Attach the output and details to the ServiceNow ticket.

**3. Viewing Incident History**
- Click on the job → Go to the **Instances** tab → Right-click the failed instance → Select **Show Details**.
- Scroll to **Operational Memo History** to view all related incident IDs, including original and rerun instances.

**4. Rerun Decision**
- Check the rerun instructions in the job documentation or the ServiceNow ticket.
  - If rerun is allowed: Rerun the job. If successful, close the incident ticket.
  - If rerun is not allowed: Assign the ticket to the Application team. Do not rerun the job independently.

---

### SOP 2.2: Monitoring and Managing Long-Running Jobs

**Purpose:**
To identify jobs running longer than expected and take appropriate action to prevent downstream delays.

**Steps:**

**1. Monitoring Jobs**
- Open the Stonebranch UAC console → Go to **Activity Monitor**.
- Use filters to track jobs by status:
  - Active statuses: Failed, Running, Execution Wait
  - Non-active statuses: Success, Finished

**2. Long-Running Incident Alert**
- When a long-running incident is received in ServiceNow, copy the job name from the ticket.
- Locate the job in the Stonebranch UAC console, check the launch time, and refer to the job instructions sheet for the appropriate action.

**3. Action on Long-Running Jobs**
- If the runtime exceeds the expected duration:
  - Rerun if permitted.
  - Otherwise, route the ticket to the respective support group via ServiceNow.

---

### SOP 2.3: Disabling a Job in Stonebranch

**Purpose:**
To stop a job from running by disabling its trigger.

**Steps:**

1. Open the Stonebranch UAC console.
2. Navigate to **Tasks** → Search for the job name.
3. Click on the job to open it.
4. Go to the **Triggers** tab.
5. If the trigger is enabled, right-click on it and select **Disable**.
6. Go to the **Notes** section.
7. Add a note with the ticket reference. Example: *"Trigger disabled as per SCTASK#123456."*
8. Save the changes.

---

### SOP 2.4: Disabling Multiple Jobs Using Filters

**Purpose:**
To efficiently disable multiple jobs when a list is provided in a ticket.

**Steps:**

1. Navigate to **Tasks** → Click **Create Filter**.
2. Add all job names from the ticket to the filter.
3. Apply the filter.
4. For each job in the filtered list:
   - Open the job.
   - Disable the trigger.
   - Add a note with the ticket number.
   - Save the changes.

---

### SOP 2.5: Skipping a Task in a Workflow

**Purpose:**
To skip a specific task within a workflow without affecting the rest of the execution chain.

**Steps:**

1. Navigate to **Workflows** → Search for the workflow name.
2. Open the workflow.
3. Identify the task to be skipped.
4. Scroll to **Workflow Execution Options**.
5. Set **Skip Condition** to **True**.
6. Save the workflow.
7. Add a note to the task with the relevant ticket number.

---

### SOP 2.6: When to Use Disable vs Skip

**Purpose:**
To determine the correct method for stopping a job from running.

| Scenario | Method |
|---|---|
| Job should not run at all until further notice | Disable the trigger |
| Job is part of a workflow and should be skipped for one or more cycles without breaking the chain | Set Skip Condition on the task within the workflow |

---

### SOP 2.7: How to Identify Job Dependencies

**Purpose:**
To determine whether a job is standalone or part of a workflow.

**Steps:**

1. Open the job in **Tasks**.
2. Check the **View Parents** option:
   - If a workflow is listed, the job is part of a dependency chain.
   - If no parent is listed, the job is standalone.
3. Alternatively, go to the **Triggers** tab:
   - If only one task is listed in the trigger, the job is likely standalone.
   - If multiple tasks are linked to the same trigger, the job is part of a workflow.

---

### SOP 2.8: Agent Offline Handling

**Purpose:**
To describe the standard steps followed by the Stonebranch L1 team when an agent goes offline — identifying the cause, coordinating with relevant teams, minimising job impact, and ensuring smooth recovery.

---

**Step 1: Identify the Reason for Agent Offline**

When an agent shows as Offline in the Stonebranch Controller, or an incident is received:

- Verify whether the agent went offline due to:
  - Planned maintenance activity
  - Server patching
  - Server reboot
  - Disk space issue
  - Any pre-communicated activity

**If the agent is offline due to known / planned maintenance:**
- No immediate escalation is required.
- Pre-plan to suspend the agent cluster and check with the Application team for any jobs that need to be force finished before the activity starts, to avoid multiple incident alerts.
- Do not suspend the agent at any time without consulting the L2 team.
- Continuously monitor the agent status.
- Once the activity is complete, confirm the agent is back Online and Active.
- After the agent is online, check for Execution Wait jobs. Force finish older instances after confirmation from the Application team.
  - If it is a time interval task, force finishing is generally safe.
  - If it is a weekly or monthly task, connect with the Application team before taking action.

---

**Step 2: Unexpected Agent Offline (Unknown Reason)**

If the agent goes offline suddenly and is not back online within 10–15 minutes, and the reason is unknown:

L1 must collect the following details:
- Agent name / Server name
- Environment (Production / Non-Production)
- Operating System type (Linux / Unix / Windows)
- Last heartbeat / last communication time
- List of impacted jobs and their current status

After collecting the details:
- Create or assign a ServiceNow INC to the OS team for investigation.
- Inform the OS team via email with all collected details.
- If it is a cloud server, loop in the Network team in the same email.
- If the agent is still not online after 15 minutes, request the OS team to restart the agent service (`ubrokerd`):
  ```
  systemctl status ubrokerd
  systemctl restart ubrokerd
  ```
- If the issue is still not resolved, inform the Stonebranch L2 team for visibility and support.

---

**Step 3: Job Handling After Agent Recovery**

During the agent offline period, L1 may receive incidents for the following statuses:
- Undeliverable
- In Doubt
- Failed
- Long-Running

**3.1 Verify Job Status in Stonebranch**

After agent recovery, check job statuses under the affected agent in the Stonebranch Controller:
- Execution Wait
- Queued
- Failed

**3.2 Force Finish Actions**

If jobs are in Queued or In Doubt status, L1 must force finish these instances to ensure normal execution in the next run:

1. Select all Execution Wait instances.
   - Verify with the Application team before force finishing if the agent went offline due to an unplanned activity.
   - If it is a time interval task, force finishing is generally safe.
   - If it is a weekly or monthly task, connect with the Application team before taking action.
2. Right-click the selected instances → Select **Force Finish → Force Finish**.
3. Follow the same process for Queued and In Doubt instances.

**Note — Long-Running and Failed instances:**
If jobs are in a Long-Running or Failed state, L1 must either transfer the running incident to the Application team queue, or obtain explicit approval from the Application team before force finishing.

---

## GUI Colour Codes and Task Instance Statuses

**Purpose:**
To interpret job statuses visually in the Stonebranch UAC Activity Monitor.

| Status | Description |
|---|---|
| **Defined** | The task instance has been created in UAC but is not yet eligible to run. It may be waiting for its schedule or conditions to activate. If instances are piling up and the task appears stuck, force finish the old ones. Monitor for old Defined state instances. |
| **Waiting** | The task instance is ready but cannot run because one or more prerequisites have not been met — such as predecessor completion, time window, conditions, events, or variables. |
| **Held** | The task has been manually placed on hold. At Adient, this status is rarely used. The standard approach is to disable the trigger for the specific task. If the task needs to be released automatically at a later time, it can be placed in Held status. |
| **Exclusive Wait** | The task requires exclusive resources and will run once the exclusive resource becomes available. This occurs when a task has self-exclusiveness (self-dependency) or is mutually exclusive with another task. |
| **Resource Wait** | The task is waiting for a virtual resource to become available. In most cases, the resource is available and has been assigned to the Application team. The virtual resource section needs to be updated at either the task level or the workflow level, depending on the application configuration. |
| **Execution Wait** | The job is waiting for a prerequisite to complete. This typically occurs when an agent is suspended or when a task has come to plan but is waiting for execution. Before force finishing, verify the task type — time interval tasks are generally safe to force finish; weekly or monthly tasks require confirmation from the Application team. |
| **Undeliverable** | UAC cannot deliver the task to the agent because the agent is offline or unreachable. Once the agent comes back online, tasks will automatically resume. The incident number is recorded in the Operational Memo field. |
| **Running** | The task instance is currently executing. If a task is running longer than expected, connect with the Application team. For PMFG (QAD) tasks, route the incident to the QAD DBA Process Global team. For non-QAD tasks, route to the CO team, which will transfer to the appropriate group. |
| **In Doubt** | UAC cannot determine the correct status of the task. This typically occurs after an agent goes offline or becomes unreachable. If caused by an agent offline issue or planned activity, force finish the instances. Otherwise, check with the Application team before taking action. Note: Instances will not be running in this state. |
| **Start Failure** | The task failed to start. Common causes: credentials are not accessible, **Run as Sudo** is not enabled, or the triggering user does not have sufficient permissions. Start Failure ticket numbers must also be recorded for audit purposes. |
| **Cancelled** | The task was manually cancelled or aborted automatically before completion. This action must be taken cautiously and only in the presence of the Application team. |
| **Failed** | The task ran but ended with a non-successful result. Common causes: script failure (check logs via Retrieve Output and connect with the Application team), incorrect command line, or incorrect credentials. Any modifications required must be tagged with the relevant ticket number in the Production or Test environment. |
| **Running Problems** | Applicable to Workflows only. One or more tasks within the workflow has one of the following statuses: Held, Undeliverable, Running Problems (for sub-workflows), Cancel Pending, In Doubt, Start Failure, or Cancelled. |

---

### SOP 2.9: Using Force Finish Options

**Purpose:**
To terminate or hold job instances when requested by the Application team or during a holding activity.

There will be situations where the requester asks L1 to kill or force finish active running instances.

**Always use Force Finish / Cancel — not the restricted variants.**

| Option | Behaviour |
|---|---|
| **Force Finish / Cancel** | Stops the task in UAC **and** stops the running script on the server. This is the correct option to use. |
| **Force Finish (Halt) / Cancel (Halt)** | Stops the task only at the UAC level — the script continues running on the server. Do not use this unless specifically instructed. |

**Difference between Halt and non-Halt (Workflow tasks only):**

This distinction applies only to tasks that are part of a dependency Workflow containing more than one task.

- **Force Finish / Cancel** on a task within a dependency Workflow: Finishes only that one task. The Workflow continues and runs the remaining tasks.
- **Force Finish / Cancel (Halt)** on a task within a dependency Workflow: Cancels the entire Workflow. The remaining tasks will not run.

---

*Document maintained by the Stonebranch L1 Operations Team.*
