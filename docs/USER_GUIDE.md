# SamayVidya: Detailed Role-Based User Guide

Welcome to the **SamayVidya** User Guide! This system is designed to streamline academic timetable management using AI-powered orchestration. Each user role has specific features tailored to their responsibilities. 

Below you will find a breakdown of the tool by role, explaining how to log in, how to act within your dashboard, and step-by-step guides for primary functions.

---

## 🔐 System Login & Account Defaults (All Roles)

Regardless of your role, you will log into SamayVidya via the main login portal on the homepage. 

### Default Credentials
Upon rollout, accounts are pre-provisioned by the Administrative IT team based on your institute registry.
- **Default Email Format:** 
  - Staff: `firstname.lastname@institute.edu`
  - Students: `rollnumber@institute.edu` (e.g., `122CE1001@institute.edu`)
- **Default Password:** `Welcome@123` (or as communicated by IT).
> 🔴 **CRITICAL:** You must securely log in and change your default password immediately upon your first session. Go to **Profile > Change Password**.
> 🟢 **WHY IT MATTERS:** Keeps personal timetables, leave histories, and department controls safe from unauthorized access.

---

## 1. Coordinator

The Coordinator holds the master controls for the department. Your primary job is to feed the correct data to the system and generate the final schedules.

### Step-by-Step: How to Add Faculty
1. Navigate to the **Faculty** section from the sidebar.
2. Click on the **+ Add Faculty** button.
3. Fill out the form with their Name, Designation, Email, and Max allowed teaching load.
4. Click **Save**.
> 🔴 **CRITICAL:** Ensure that faculty IDs perfectly match your institution's official records. 
> 🟢 **WHY IT MATTERS:** Accurate IDs link faculty directly to their login portals and the load distribution uploads.

### Step-by-Step: How to Add Students & Divisions
1. Navigate to the **Divisions** section in the sidebar.
2. Click on the **+ Add Division** button.
3. Select the Academic Year, enter the Division Name (e.g., "Div-A"), and specify the class capacity.
4. To add students, go to **Students/Batches** and upload the student roster (CSV format) directly into that division.
> 🔴 **CRITICAL:** Ensure students are divided equally into Lab Batches (e.g., A1, A2, A3) while importing their records.
> 🟢 **WHY IT MATTERS:** The AI engine needs batch specifications to intelligently split divisions up for simultaneous lab/practical sessions.

### Step-by-Step: How to Generate Timetables
1. **Prerequisite:** Ensure all Master Data (Faculty, Rooms, Divisions, Subjects) is added.
2. Go to the **Load** section. Upload the Excel/CSV file containing the semester's teaching load mappings ("Who teaches what to whom").
3. Navigate to the **Timetables / Agent** page.
4. Review the constraints and parameters. 
5. Click **Generate Timetable**. Wait a few moments as the 6-pass AI orchestration engine builds the schedule.
6. Once complete, review the resulting layout. You can hit **Publish** to make it live for students.
> 🔴 **CRITICAL:** You cannot generate a timetable without uploading a valid load distribution first! Generating a new timetable will automatically push the existing active timetable into a "Draft" status, which expires and deletes after **7 days**.
> 🟢 **WHY IT MATTERS:** This dictates the exact target slots the AI must fulfill. Having drafts allows you to roll back easily if the new generation isn't satisfactory.

### Feature: Drag & Drop Adjustments
> 🟡 **NOT IMPLEMENTED YET:** Manual drag-and-drop overriding of AI-generated slots is planned but not currently available in this release.

---

## 2. HOD (Head of Department)

The HOD acts as the executive reviewer of the department. Your main role is oversight and approval.

### Step-by-Step: How to Approve/Reject Leaves
1. Log in and navigate to the **Leave Approvals / Requests** section from your sidebar.
2. You will see a dashboard of all pending faculty leave requests, including dates and reasons.
3. Click on **View Attached Proof** to verify medical documents or event invitations.
4. Click the **Approve** (green check) or **Reject** (red cross) button.
5. Provide a typed comment with your decision if necessary, then submit.
> 🔴 **CRITICAL:** Promptly handle leave requests! The coordinator requires your approval to officially arrange proxies and substitute schedules.
> 🟢 **WHY IT MATTERS:** Keeps administrative tracking seamless and ensures HR receives accurate attendance data.

### Step-by-Step: How to Approve Timetables
> 🟡 **NOT IMPLEMENTED YET:** The strict electronic sign-off workflow where the HOD clicks "Approve" to publish a draft to students is currently bypassed (Coordinators publish directly).

---

## 3. Faculty

Faculty members use the system to track their schedule and manage their unavailabilities.

### Step-by-Step: How to Apply for Leave
1. Log in to your dashboard and navigate to the **Apply Leave** tab.
2. Select your Leave Type (CL, ML, OD, etc.).
3. Choose the rigorous `from_date` and `to_date`. 
4. Type your exact reason in the provided summary box.
5. If required, click **Upload Proof** to attach your PDF or image document securely.
6. Hit **Submit Request**. You can track the status under **My Leaves**.
> 🔴 **CRITICAL:** Providing accurate dates is mandatory for the system to compute exactly which lectures and labs will be missed.
> 🟢 **WHY IT MATTERS:** Automatically flags to coordinators that your slots need a substitute faculty member.

### Step-by-Step: How to Adjust Your Slots (Proxies/Swaps)
> 🟡 **NOT IMPLEMENTED YET:** The automated "Adjust Slot / Propose Proxy" feature, allowing two faculty members to electronically swap lecture dates internally, is in development. Currently, proxy arrangements still rely on offline coordination with your timetable coordinator.

---

## 4. Student

Students get a streamlined, mobile-friendly experience to know exactly where they need to be at all times.

### Step-by-Step: How to Check Your Timetable
1. **Login** using your registered `rollnumber@institute.edu` credentials.
2. Upon landing on the main Dashboard, your personalized timeline for the current day will be displayed automatically based on your enrolled Division.
3. Use the toggle buttons at the top to switch between "Today", "Weekly", or select specific weekdays.
> 🔴 **CRITICAL:** Always refer to this live dashboard rather than a printed/downloaded sheet. Check your specific 'Batch' (like A1 or A2) closely for practical/lab sessions.
> 🟢 **WHY IT MATTERS:** Coordinators may shift classrooms dynamically if a room gets blocked. The digital app is your sole source of truth!

### Feature: Real-time Notifications & Alerts
> 🟡 **NOT IMPLEMENTED YET:** Pushed notifications (like SMS, WhatsApp, or Emails) for sudden lecture cancellations or sudden room swaps are part of the future roadmap. For now, check your dashboard regularly!