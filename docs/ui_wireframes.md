# ATS UI Wireframes & Architecture Blueprint (Phase 1)

## Executive Overview
This document specifies the low-fidelity UI/UX architecture and structural wireframes for the AI-assisted Applicant Tracking System (ATS). It contains:
1. **Complete Navigation Map** (Mermaid.js flowchart detailing authentication flows, core routes, modals, side-drawers, and stage transitions).
2. **App Shell Structural Blueprint** (Layout design, Header, Sidebar, Dynamic Main View, and UI Component Inventory).

---

## 1. Complete Navigation Map

```mermaid
flowchart TD
    %% Global Nodes & Auth
    subgraph Auth["Authentication Flow"]
        A1["/login<br/>(Login Page)"]
        A2["/register<br/>(Org Registration)"]
        A3["/forgot-password<br/>(Password Reset)"]
        AG{"Auth Guard /<br/>JWT Validation"}
        
        A1 -->|Credentials Submit| AG
        A2 -->|Create Tenant & Admin| AG
        A3 -->|Reset Link Sent| A1
    end

    AG -->|Invalid / Expired| A1
    AG -->|Valid Session| AppShell["App Shell Layout<br/>(Sidebar + Header + Main Area)"]

    %% App Shell Top Level Routes
    subgraph CoreRoutes["Core Application Routes"]
        AppShell --> R_Dash["/dashboard<br/>(Overview Dashboard)"]
        AppShell --> R_Jobs["/jobs<br/>(Jobs List)"]
        AppShell --> R_Cand["/candidates<br/>(Candidates Directory)"]
        AppShell --> R_Pipelines["/pipeline<br/>(Global Pipeline / Job Selector)"]
        AppShell --> R_Settings["/settings<br/>(Workspace & Team Settings)"]
    end

    %% Dashboard Flow
    subgraph DashFlow["Dashboard View"]
        R_Dash --> D_Stats["Quick Metric Cards<br/>(Active Jobs, Total Applicants, Avg Score, Hired)"]
        R_Dash --> D_Activity["Recent Activity Feed"]
        R_Dash --> D_QuickUpload["Quick Action: Upload Resume"]
    end

    %% Jobs Management Flow
    subgraph JobsFlow["Jobs Management"]
        R_Jobs --> J_Table["Jobs List Table<br/>(Filter by Status, Dept)"]
        J_Table -->|Click '+ Create Job'| J_CreateModal["/jobs/new<br/>(Create Job Modal/Form)"]
        J_Table -->|Click Job Row| J_Detail["/jobs/[jobId]<br/>(Job Details & ESCO Skills)"]
        J_Detail -->|Click 'Edit Job'| J_EditModal["/jobs/[jobId]/edit<br/>(Edit Job Modal)"]
        J_Detail -->|Click 'View Board'| P_Board
    end

    %% Pipeline Board Flow
    subgraph PipelineFlow["Kanban Pipeline Board"]
        R_Pipelines --> P_SelectJob["Select Active Job"]
        P_SelectJob --> P_Board
        
        P_Board["/jobs/[jobId]/pipeline<br/>(Kanban Pipeline Board)"]
        
        P_Board -->|Stage Columns| S_Applied["1. Applied"]
        P_Board -->|Stage Columns| S_Screening["2. AI Screening"]
        P_Board -->|Stage Columns| S_Interview["3. Technical Interview"]
        P_Board -->|Stage Columns| S_Offer["4. Offer Extended"]
        P_Board -->|Stage Columns| S_Hired["5. Hired / Rejected"]

        S_Applied -->|Drag & Drop Card| S_Screening
        S_Screening -->|Drag & Drop Card| S_Interview
        S_Interview -->|Drag & Drop Card| S_Offer
        S_Offer -->|Drag & Drop Card| S_Hired

        S_Applied & S_Screening & S_Interview & S_Offer & S_Hired -->|Click Candidate Card| C_Drawer
    end

    %% Candidates & CV Parsing Flow
    subgraph CandidateFlow["Candidate Directory & Profile"]
        R_Cand --> C_Table["Candidate Table<br/>(Filter by Skill, Experience, Score Range)"]
        C_Table -->|Click '+ Upload Resume'| C_UploadModal["/candidates/upload<br/>(PDF Resume Upload & OCR Parser)"]
        
        D_QuickUpload --> C_UploadModal
        
        C_UploadModal -->|Parsing Complete| C_ReviewParsed["Review & Edit Parsed Skills Screen"]
        C_ReviewParsed -->|Save Candidate| C_Table

        C_Table -->|Click Candidate Row| C_Profile["/candidates/[candidateId]<br/>(Candidate Full Profile Page)"]
        
        C_Drawer["Candidate Profile Side Drawer<br/>(Quick View over Pipeline)"]
    end

    %% Candidate Detail & Score Breakdown
    subgraph ProfileDetail["Candidate Profile Components"]
        C_Profile & C_Drawer --> CP_PDF["Original PDF Resume Viewer"]
        C_Profile & C_Drawer --> CP_Skills["Parsed Skills & Experience Editor"]
        C_Profile & C_Drawer --> CP_Score["AI Match Score Breakdown Panel<br/>(Overall, Skill Overlap, Semantic, Experience, Title Fit)"]
        C_Profile & C_Drawer --> CP_Explanations["Match Explanation Bullet Points"]
        C_Profile & C_Drawer --> CP_GDPR["GDPR Hard Delete Action"]
    end

    %% Settings Flow
    subgraph SettingsFlow["Workspace Settings"]
        R_Settings --> ST_Team["/settings/team<br/>(User Roles: Admin, Recruiter, Viewer)"]
        R_Settings --> ST_Score["/settings/scoring<br/>(AI Match Weights & Threshold Config)"]
        R_Settings --> ST_Audit["/settings/audit<br/>(Immutable Audit Logs)"]
    end
```

---

## 2. App Shell Structural Blueprint

### 2.1 Layout Architecture & Grid Structure
The application shell utilizes a modern **responsive 2-column layout** with a fixed/collapsible left sidebar, a sticky top header bar, and a dynamic main content viewport.

```
+----------------------------------------------------------------------------------------------------+
|  [Sidebar Logo]    [Breadcrumbs: Dashboard > Senior Backend > Pipeline]  (Search) [+Add] [🔔] [Avatar] |  <- Top Header (Sticky)
+------------------+---------------------------------------------------------------------------------+
|                  |                                                                                 |
|  🏢 Workspace    |  [Page Title: Pipeline Board]               [Filter] [Sort] [+ Candidate]       |  <- Page Action Bar
|                  | ------------------------------------------------------------------------------- |
|  ----------------|                                                                                 |
|  📊 Dashboard    |  +----------------+  +----------------+  +----------------+  +----------------+ |
|  💼 Jobs         |  | APPLIED (12)   |  | SCREENING (5)  |  | INTERVIEW (3)  |  | OFFER (1)      | |  <- Main Content View
|  👥 Candidates   |  |                |  |                |  |                |  |                | |     (e.g., Kanban,
|  🔀 Pipeline     |  | [Card 1: 92%]  |  | [Card 4: 88%]  |  | [Card 6: 95%]  |  | [Card 7: 91%]  | |      Table, or
|  ----------------|  | [Card 2: 85%]  |  | [Card 5: 79%]  |  |                |  |                | |      Form Views)
|  ⚙️ Settings      |  | [Card 3: 74%]  |  |                |  |                |  |                | |
|                  |  +----------------+  +----------------+  +----------------+  +----------------+ |
|                  |                                                                                 |
|  [Collapse <]    |                                                                                 |
|  [User Info]     |                                                                                 |
+------------------+---------------------------------------------------------------------------------+
```

---

### 2.2 Section Breakdown & Specifications

#### 1. Collapsible Left Sidebar (`Sidebar`)
- **Brand / Organization Switcher (`OrgSwitcher`)**:
  - Displays current organization name & logo.
  - Dropdown menu allowing admins to switch between active tenant workspaces.
- **Main Navigation Group (`NavGroup`)**:
  - `Dashboard`: Links to `/dashboard` (Icon: `LayoutDashboard`).
  - `Jobs`: Links to `/jobs` with active job count badge (Icon: `Briefcase`).
  - `Candidates`: Links to `/candidates` with total applicant count (Icon: `Users`).
  - `Pipeline`: Links to `/pipeline` (Icon: `Kanban`).
  - `Settings`: Links to `/settings` (Icon: `Settings`).
- **Sidebar Footer (`SidebarFooter`)**:
  - Collapse / Expand toggle button (Keyboard shortcut: `Ctrl + \`).
  - Current user pill: Avatar, Name, Role Badge (`Admin`, `Recruiter`, `Viewer`).

#### 2. Sticky Top Header (`Header`)
- **Left Region**:
  - `SidebarTrigger`: Toggle sidebar visibility on mobile and desktop.
  - `Breadcrumbs`: Dynamic navigation hierarchy (e.g. `Jobs` > `Senior Backend Engineer` > `Pipeline Board`).
- **Center Region**:
  - `GlobalSearch`: Command palette trigger (`CommandMenu`) with shortcut hint `Ctrl + K` / `Cmd + K`. Opens instant fuzzy search overlay across candidates, job postings, and parsed skills.
- **Right Region**:
  - `QuickActionMenu`: Dropdown button for primary creation triggers:
    - `+ Upload Resume` (Opens `CVUploadDialog`)
    - `+ Create Job` (Opens `JobFormModal`)
  - `NotificationBell`: Trigger for notification popover (new CV parsing completed, score threshold reached, candidate moved stage).
  - `UserDropdown`: Profile settings, theme switcher (Light/Dark mode), system documentation, and Sign Out action.

#### 3. Main Content Viewport (`MainViewport`)
- **Page Action Header (`PageHeader`)**:
  - Title, subtitle / metadata (e.g. "Senior Backend Engineer • Created 2 days ago").
  - Contextual action bar: Stage search filter, candidate score threshold slider (0-100%), Export button, and View toggle (Kanban Board vs. List Table).
- **Dynamic Content Region**:
  - Renders route-specific views (`/dashboard`, `/jobs`, `/candidates`, `/pipeline`).
- **Overlay Layer**:
  - `CandidateDrawer`: Slide-over panel (right side) that overlays the pipeline when clicking a candidate card, keeping Kanban context intact.
  - `GlobalModalProvider`: Container for upload modals, job creation dialogs, and delete confirmations.

---

### 2.3 Complete UI Component Inventory (Drawing Checklist)

| Component Name | Base Library (shadcn/ui) | Purpose / UI Description |
|---|---|---|
| **AppLayout** | Custom Grid/Flex | Root wrapper providing 2-column layout & overlay container |
| **Sidebar** | `Sidebar` | Fixed left navigation container with collapse state |
| **OrgSwitcher** | `DropdownMenu`, `Button` | Workspace selection dropdown with tenant logo |
| **NavItem** | `Button`, `Badge` | Nav link item with active state indicator and count badge |
| **SidebarToggle** | `Button` | Icon button to collapse/expand sidebar |
| **Header** | Custom Sticky Bar | Top header bar containing search, quick actions, & profile |
| **BreadcrumbNav** | `Breadcrumb` | Hierarchical route location tracker |
| **GlobalSearch** | `Command` (CMDK) | Palette dialog for searching candidates, jobs, and skills |
| **QuickActionSplit** | `DropdownMenu`, `Button` | Primary action split-button (`+ Upload Resume`, `+ Create Job`) |
| **NotificationPopover** | `Popover`, `ScrollArea` | Unread notifications list with status tags |
| **UserMenu** | `DropdownMenu`, `Avatar` | Profile avatar dropdown with role badge & logout action |
| **PageHeader** | Custom Component | Page title, description, and primary page actions |
| **MetricsCard** | `Card` | Overview statistics card with trend indicator badge |
| **KanbanBoard** | Custom DND Container | Multi-column drag-and-drop pipeline board |
| **KanbanColumn** | `Card` | Stage column header with application count & stage actions |
| **CandidateCard** | `Card`, `Badge` | Candidate preview card displaying name, ATS score badge, and top skills |
| **CandidateDrawer** | `Sheet` (Slide-over) | Candidate profile overview, PDF viewer, & score breakdown panel |
| **PDFViewer** | Custom Iframe/Canvas | Interactive PDF resume viewer with highlight & search |
| **ScoreBreakdown** | `Progress`, `Accordion` | Score breakdown gauges (Skill match, Semantic, Experience, Title fit) |
| **CVUploadDialog** | `Dialog`, `Progress` | Drag-and-drop PDF dropzone with real-time OCR parsing progress |
| **ParsedSkillBadge** | `Badge` | Interactive skill tag (green = matched, red = missing, gray = extra) |
| **JobFormModal** | `Dialog`, `Tabs` | Multi-step form for creating job requirements and ESCO skills |
| **ConfirmDeleteDialog**| `AlertDialog` | Confirmation modal for GDPR Right-to-Erasure candidate hard delete |

---

## 3. Phase 2 Screen Wireframe Specifications

### 3.1 Screen 1: Login & Register Screens

#### A. Login Screen (`/login`)
- **Layout Architecture**: Centered single-column Auth Card container (`Card` width ~420px) on a subtle grid background with top brand logo.
- **Visual Blueprint**:
```
+------------------------------------------------------------------+
|                          [ ATS Logo ]                            |
|                     Welcome back to ATS Scorer                   |
|              Sign in to access your recruiter workspace           |
|                                                                  |
| +--------------------------------------------------------------+ |
| | [!] Invalid email or password. Please check credentials.     | | <- Destructive Alert (Error State)
| +--------------------------------------------------------------+ |
|                                                                  |
| Email Address*                                                   |
| [ recruiter@acme.com                                         ]   |
|                                                                  |
| Password*                                           Forgot?      |
| [ •••••••••••••••••••••••••                            (👁️) ]   |
|                                                                  |
| [X] Remember this device for 30 days                             |
|                                                                  |
| [                  Sign In to Workspace                      ]   | <- Primary Button
|                                                                  |
| Don't have an account? [ Register your Organization ]           |
+------------------------------------------------------------------+
```
- **Inputs & Field Specs**:
  - `email`: `Input` (type `email`, required, autofocus). Validation text: "Please enter a valid email address."
  - `password`: `Input` (type `password`, required, right adornment show/hide password toggle `Eye` / `EyeOff`).
  - `remember_me`: `Checkbox` with label "Remember this device for 30 days".
- **Buttons**:
  - `Sign In`: `Button` (Variant `default`, size `lg`, full width). State: Default / Hover / Active / Disabled (when inputs empty) / Loading (shows `Loader2` spinner icon & text "Signing in...").
  - `Forgot Password`: `Button` (Variant `link`, size `sm`). Navigates to `/forgot-password`.
  - `Register Link`: `Button` (Variant `link`). Navigates to `/register`.
- **Error States & Handling**:
  - **State E-1 (Invalid Credentials)**: `Alert` (variant `destructive`) displayed above inputs. Icon: `AlertCircle`. Title: "Authentication Failed". Message: "Invalid email or password. Please check your credentials and try again."
  - **State E-2 (Rate Limited)**: `Alert` (variant `destructive`). Message: "Too many failed attempts. Account temporarily locked for 5 minutes."
  - **State E-3 (Field Validation)**: Red border on `Input` (`border-destructive`), helper text below field in red (`text-destructive text-xs`): "Email is required".

#### B. Register Screen (`/register`)
- **Layout Architecture**: Centered Auth Card (`Card` width ~480px) for organization workspace onboarding.
- **Inputs**:
  - `org_name`: `Input` (label "Organization / Workspace Name*", placeholder `Acme Corp`).
  - `full_name`: `Input` (label "Full Name*", placeholder `Sarah Jenkins`).
  - `email`: `Input` (label "Work Email*", type `email`, placeholder `sarah@acme.com`).
  - `password`: `Input` (type `password`, with real-time password strength meter `Progress` bar).
  - `terms_consent`: `Checkbox` (required, label "I agree to the Terms of Service and GDPR Data Processing Agreement").
- **Buttons**:
  - `Create Workspace`: `Button` (default, size `lg`, full width, loading spinner on submit).
  - `Sign In Link`: Link button to `/login`.
- **Error States**:
  - Email conflict (409): "An organization account with this email already exists."

---

### 3.2 Screen 2: Jobs List Screen (`/jobs`)

#### A. Active State (Jobs Present)
- **Layout Architecture**: App Shell Main Viewport layout. Header action bar at top, filter/search controls bar, followed by responsive Data Table / Card Grid.
- **Visual Blueprint**:
```
+----------------------------------------------------------------------------------------------------+
|  Jobs Postings                                                      [ + Create Job ]               | <- Page Header
|  Manage job postings, required ESCO skills, and pipeline stages.                                    |
+----------------------------------------------------------------------------------------------------+
|  (🔍 Search title or department...)  [ Status: All ▼ ]  [ Dept: All ▼ ]     View: [≡ Table] [⊞ Grid] | <- Filter Bar
+----------------------------------------------------------------------------------------------------+
| JOB TITLE & DEPT         LOCATION & TYPE      STATUS     CANDIDATES   MATCH AVG   CREATED    ACTIONS  |
| -------------------------------------------------------------------------------------------------- |
| Senior Backend Engineer  Remote (US/EU)      [● Open]       24           88.5%    Oct 1, 2026  [...]  |
| Engineering              Full-time                                                                 |
|                                                                                                    |
| Product Designer         San Francisco, CA   [● Open]       14           91.2%    Sep 28, 2026 [...]  |
| Design                   Full-time                                                                 |
|                                                                                                    |
| Data Scientist           Remote (EU)         [● Draft]       0             --     Sep 25, 2026 [...]  |
| AI & Analytics           Contract                                                                  |
+----------------------------------------------------------------------------------------------------+
| Showing 1 - 3 of 3 jobs                                             [< Prev]  Page 1 of 1  [Next >]  | <- Pagination
+----------------------------------------------------------------------------------------------------+
```
- **Inputs & Filter Controls**:
  - `SearchInput`: `Input` with search icon (`Search`), placeholder "Search title or department...".
  - `StatusFilter`: `Select` dropdown (`All Statuses`, `Open`, `Draft`, `Paused`, `Closed`).
  - `DeptFilter`: `Select` dropdown (`All Departments`, `Engineering`, `Product`, `Design`, `Sales`).
  - `ViewToggle`: `ToggleGroup` with `Table` and `Grid` view options.
- **Table Components & Cells**:
  - `JobTitleCell`: Bold title with Department `Badge` below.
  - `LocationTypeCell`: Location icon + text, Employment Type tag.
  - `StatusBadge`: Colored status indicator (`Badge` green for `Open`, amber for `Draft`, gray for `Closed`).
  - `CandidatesCount`: Link button showing candidate count badge.
  - `MatchAvg`: Progress indicator / score percentage badge (`Badge` variant outline).
  - `ActionsDropdown`: `DropdownMenu` with options: `View Pipeline Board`, `Edit Job Details`, `Duplicate Job`, `Close Posting`.
- **Buttons**:
  - `+ Create Job`: Primary action `Button` (default variant, `Plus` icon). Opens `JobFormModal`.
  - Pagination Controls: `Button` (variant `outline`, icons `ChevronLeft` & `ChevronRight`).

#### B. Empty State (No Jobs Found / Initial Workspace Setup)
- **Visual Blueprint**:
```
+----------------------------------------------------------------------------------------------------+
|  Jobs Postings                                                      [ + Create Job ]               |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|    +------------------------------------------------------------------------------------------+    |
|    |                                                                                          |    |
|    |                                     [ 💼 ]                                               |    |
|    |                                                                                          |    |
|    |                                No jobs created yet                                       |    |
|    |           Get started by creating your first job posting to define required              |    |
|    |           ESCO skills and score incoming resume candidates automatically.                |    |
|    |                                                                                          |    |
|    |                 [ + Create Your First Job ]    [ Import Sample Job ]                     |    |
|    |                                                                                          |    |
|    +------------------------------------------------------------------------------------------+    |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```
- **Empty State Components**:
  - Container: Centered `Card` with dashed border (`border-dashed border-2 p-12 text-center`).
  - Icon: `Briefcase` in rounded muted background container.
  - Heading: `h3` "No jobs created yet".
  - Subtext: `p` (muted text) "Get started by creating your first job posting to define required ESCO skills and score incoming resume candidates automatically."
  - Buttons:
    - Primary Action: `+ Create Your First Job` (`Button` default, `Plus` icon).
    - Secondary Action: `Import Sample Job` (`Button` outline, `FileText` icon).

---

### 3.3 Screen 3: Job Creation Form Screen / Modal (`/jobs/new` or `JobFormModal`)

- **Layout Architecture**: 4-Section Structured Form layout (`Dialog` modal width `800px` or full page form). Tabs / Stepper at top (`Basic Info` -> `Description` -> `ESCO Skills` -> `Pipeline`).
- **Visual Blueprint**:
```
+----------------------------------------------------------------------------------------------------+
| Create New Job Posting                                                                        [X]  |
| Define position requirements, required ESCO skills, and minimum experience for AI match scoring.   |
+----------------------------------------------------------------------------------------------------+
|  (1) Basic Information   *   (2) Description   *   (3) Skills & Criteria   *   (4) Pipeline        | <- Stepper/Tabs
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
| Job Title*                                              Department                                 |
| [ Senior Backend Engineer                          ]    [ Engineering                            ▼ ] |
|                                                                                                    |
| Location                                                Employment Type                            |
| [ Remote (US/EU)                                   ]    [ Full-time                              ▼ ] |
|                                                                                                    |
| Minimum Experience (Years)*                             Target Salary Range (Optional)             |
| [ 4                                                ]    [ $130,000 - $160,000                    ] |
|                                                                                                    |
| Required ESCO Skills* (Skills candidates MUST possess for top score match)                          |
| [ Python (x) ] [ FastAPI (x) ] [ PostgreSQL (x) ] [ Docker (x) ]  [ Type skill to add...        ]  |
|                                                                                                    |
| Preferred Skills (Nice-to-have skills for extra match points)                                      |
| [ Redis (x) ] [ PyTorch (x) ] [ Fairlearn (x) ]                   [ Type skill to add...        ]  |
|                                                                                                    |
| Job Description*                                                                                   |
| +------------------------------------------------------------------------------------------------+ |
| | We are looking for a Senior Backend Engineer proficient in Python, FastAPI, PostgreSQL, and    | |
| | microservices architecture...                                                                  | |
| +------------------------------------------------------------------------------------------------+ |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
| [ Cancel ]                                                    [ Save as Draft ]  [ Publish Job ] | <- Footer Actions
+----------------------------------------------------------------------------------------------------+
```
- **Inputs & Fields**:
  - `title`: `Input` (label "Job Title*", placeholder `e.g. Senior Backend Engineer`, required).
  - `department`: `Select` (options: `Engineering`, `Product`, `Design`, `Sales`, `Marketing`, `HR`).
  - `location`: `Input` (label "Location", placeholder `e.g. Remote (US/EU)`).
  - `employment_type`: `Select` (options: `Full-time`, `Part-time`, `Contract`, `Internship`).
  - `min_experience_years`: `Input` (type `number`, min `0`, default `0`).
  - `required_skills`: `TagInput` / Badge list with remove buttons (`x`), plus search input with ESCO autocomplete.
  - `preferred_skills`: `TagInput` for nice-to-have skills.
  - `description`: `Textarea` (rows `6`, placeholder "Paste full job description text...").
- **Buttons**:
  - `Publish Job`: `Button` (variant `default`, `Check` icon). Submits form and sets status to `open`.
  - `Save as Draft`: `Button` (variant `outline`, `Save` icon). Saves status as `draft`.
  - `Cancel`: `Button` (variant `ghost`). Closes modal / returns to `/jobs`.
- **Validation & Error States**:
  - **Inline Validation**: Red border and error helper text when required fields (`title`, `description`, `required_skills`) are blank.
  - **Skill Autocomplete Suggestions**: Dropdown suggestions matching ESCO skill taxonomy standard.

---

## 4. Phase 3 Screen Wireframe Specifications

### 4.1 Screen 1: Candidate Profile (Page & Drawer View)

- **Layout Architecture**: 2-Column Split View (Left Column: PDF Viewer, Right Column: Candidate Attributes, Parsed Experience, and AI Match Score Panel) or Slide-over Drawer (`Sheet` width `780px`).
- **Visual Blueprint**:
```
+----------------------------------------------------------------------------------------------------+
| Candidate Profile: Alex Mercer                                                                [X]  |
| Applied for: Senior Backend Engineer  •  Stage: [ AI Screening & Review ▼ ]  •  Score: [ 88.5% ]   |
+----------------------------------------------------------------------------------------------------+
| LEFT COLUMN: ORIGINAL PDF CV                 | RIGHT COLUMN: PARSED DATA & AI MATCH SCORE          |
| +------------------------------------------+ | +-------------------------------------------------+ |
| | Toolbar: [-] [+] [Zoom: 100%] [⬇️ Download]| | | CANDIDATE SUMMARY & CONTACT                     | |
| +------------------------------------------+ | | 📧 alex.mercer@example.com  📞 +1-555-0199       | |
| |                                          | | | 📍 San Francisco, CA        📅 Applied: 2d ago  | |
| |  ALEX MERCER                             | | +-------------------------------------------------+ |
| |  Senior Software Engineer                | | | AI MATCH SCORE BREAKDOWN                        | |
| |                                          | | | [ Overall Fit Score: 88.5 / 100 ]               | |
| |  EXPERIENCE                              | | |                                                 | |
| |  TechCorp Inc (2021-Present)             | | | Skill Overlap (40%):   [========---] 90.0%       | |
| |  - Built FastAPI services & Postgres     | | | Semantic Match (30%):  [========---] 85.5%       | |
| |                                          | | | Experience Depth (20%):[===========] 92.0%       | |
| |  DataFlow Soft (2019-2021)               | | | Title Fit (10%):       [========---] 84.0%       | |
| |  - Developed ETL scripts                 | | +-------------------------------------------------+ |
| |                                          | | | MATCH EXPLANATIONS                              | |
| |  SKILLS                                  | | | • Possesses 4 of 5 required ESCO skills.        | |
| |  Python, FastAPI, Postgres, Redis, Docker| | | • Cosine vector similarity with JD is 0.855.     | |
| |                                          | | | • 5.5 yrs exp exceeds 4 yrs requirement.        | |
| |                                          | | +-------------------------------------------------+ |
| |                                          | | | EXTRACTED ESCO SKILLS (Editable)                | |
| |                                          | | | [ Python (x) ] [ FastAPI (x) ] [ PostgreSQL (x)]| |
| |                                          | | | [ Docker (x) ] [ Redis (x) ]   [ + Add Skill   ]| |
| |                                          | | +-------------------------------------------------+ |
| |                                          | | | WORK HISTORY TIMELINE                           | |
| |                                          | | | 💼 TechCorp Inc (3.5 yrs) - Backend Engineer     | |
| |                                          | | | 💼 DataFlow Soft (2.0 yrs) - Junior Engineer    | |
| +------------------------------------------+ | +-------------------------------------------------+ |
|                                              | [ Save Edits ] [ Move Stage ] [ Delete Candidate ]  |
+----------------------------------------------------------------------------------------------------+
```
- **Specific Data Points & UI Elements**:
  - **Header Region**: Candidate Name (`h2`), Job Title Badge, Stage Selector Dropdown (`Select`), Overall ATS Score Badge (`Badge` green/amber/red).
  - **PDF Viewer Component (`PDFViewer`)**: PDF toolbar (`ZoomIn`, `ZoomOut`, `Download`), canvas/iframe viewer, text highlight toggle.
  - **Score Breakdown Component (`ScoreBreakdown`)**:
    - Composite Overall Score Progress Circle / Gauge (`88.5 / 100`).
    - Sub-Score Progress Bars (`Progress`):
      - `Skill Overlap Score` (40% weight): 90.0% (Matched: 4, Missing: 1).
      - `Semantic Similarity Score` (30% weight): 85.5%.
      - `Experience Depth Score` (20% weight): 92.0% (5.5 yrs vs 4 yrs required).
      - `Title Fit Score` (10% weight): 84.0%.
    - Score Explanations: Accordion / Bullet list detailing rationale.
  - **Parsed Data Editor (`ParsedDataEditor`)**: Interactive Skill Badges with `x` delete icon, Add Skill input, Work History Timeline.
  - **GDPR Actions**: `Hard Delete Candidate` button (`Button` variant `destructive`, icon `Trash2`) triggering confirmation alert dialog (`ConfirmDeleteDialog`).

---

### 4.2 Screen 2: CV Upload States (`CVUploadDialog` / `/candidates/upload`)

- **Layout Architecture**: Centered Dialog Modal (`Dialog` width `560px`) showcasing the 4 distinct execution states.

#### A. State 1: Idle (Ready for Drop)
```
+-------------------------------------------------------------------+
| Upload Candidate Resume                                       [X] |
+-------------------------------------------------------------------+
|  +-------------------------------------------------------------+  |
|  |                           [ ☁️ ]                            |  |
|  |           Drag & drop PDF resume here or click to browse    |  |
|  |                 Supports PDF files up to 10MB               |  |
|  |                                                             |  |
|  |                   [ 📄 Select PDF File ]                    |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  Candidate Name (Optional)           Email Address (Optional)     |
|  [ Alex Mercer                     ] [ alex.mercer@example.com  ] |
+-------------------------------------------------------------------+
| [ Cancel ]                                         [ Upload & Parse ] |
+-------------------------------------------------------------------+
```

#### B. State 2: Uploading & Parsing (In Progress)
```
+-------------------------------------------------------------------+
| Uploading & Extracting Resume Data                            [X] |
+-------------------------------------------------------------------+
|  Selected File: Alex_Mercer_CV.pdf (1.2 MB)                       |
|                                                                   |
|  [========================================--------------] 72%    |
|                                                                   |
|  (✓) File upload complete                                         |
|  (✓) PyMuPDF text extraction complete                             |
|  (⏳) Running Tesseract OCR fallback... [ Spinner ]                |
|  ( ) Matching ESCO skill taxonomy...                              |
+-------------------------------------------------------------------+
| [ Cancel Processing ]                               [ Processing... ] |
+-------------------------------------------------------------------+
```

#### C. State 3: Success (Parsing Complete)
```
+-------------------------------------------------------------------+
| Resume Parsed Successfully!                                   [X] |
+-------------------------------------------------------------------+
|  +-------------------------------------------------------------+  |
|  |  [✓]  Alex Mercer                                           |  |
|  |       alex.mercer@example.com • 5.5 years experience        |  |
|  |       Parsed 7 ESCO skills: Python, FastAPI, Postgres, Docker|  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  Assign to Job Posting:                                           |
|  [ Senior Backend Engineer                                      ▼ ]|
+-------------------------------------------------------------------+
| [ Upload Another ]                       [ View Profile & Score ] |
+-------------------------------------------------------------------+
```

#### D. State 4: Error State (Upload / OCR Failure)
```
+-------------------------------------------------------------------+
| Upload Failed                                                 [X] |
+-------------------------------------------------------------------+
|  +-------------------------------------------------------------+  |
|  | [!] Error: Resume parsing failed.                           |  |
|  |     The PDF document is password-protected or corrupted.    |  |
|  |     Please remove password protection and try again.        |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
| [ Cancel ]                                         [ Try Again ]  |
+-------------------------------------------------------------------+
```

---

### 4.3 Screen 3: Ranked Candidates View (Score Breakdown UI)

- **Layout Architecture**: Table / List View sorted by `overall_score DESC` with expandable candidate score breakdown rows.
- **Visual Blueprint**:
```
+------------------------------------------------------------------------------------------------------------------------+
| Ranked Candidates: Senior Backend Engineer                                          Job Filter: [ Backend ▼ ]           |
+------------------------------------------------------------------------------------------------------------------------+
| RANK  CANDIDATE NAME & CONTACT       OVERALL FIT   SKILL MATCH  SEMANTIC  EXP SCORE   TITLE FIT  ACTIONS             |
| ---------------------------------------------------------------------------------------------------------------------- |
| #1    Alex Mercer                    [ 88.5% ]      90.0%       85.5%     92.0%       84.0%     [ Move Stage ▼ ]    |
|       alex.mercer@example.com        (Green)       (4/5 skills) (Vector) (5.5/4 yrs)                      [ Details > ]  |
|       └─ Extracted: Python, FastAPI, PostgreSQL, Docker, Redis                                                         |
|                                                                                                                        |
| #2    Jordan Lee                     [ 79.2% ]      75.0%       81.0%     80.0%       78.0%     [ Move Stage ▼ ]    |
|       jordan.lee@example.com         (Amber)       (3/5 skills) (Vector) (4.0/4 yrs)                      [ Details > ]  |
|                                                                                                                        |
| #3    Taylor Smith                   [ 54.0% ]      40.0%       58.0%     60.0%       50.0%     [ Move Stage ▼ ]    |
|       taylor.smith@example.com       (Red)         (2/5 skills) (Vector) (2.0/4 yrs)                      [ Details > ]  |
+------------------------------------------------------------------------------------------------------------------------+
```
- **Data Points & Specific UI Elements**:
  - `RankPosition`: Sequential badge (`#1`, `#2`, `#3`).
  - `OverallScoreBadge`: Circular or pill badge color-coded:
    - **Green** (`>= 80%`): High Match / Shortlist.
    - **Amber** (`60% - 79%`): Partial Match / Review.
    - **Red** (`< 60%`): Low Match.
  - `SubScoreColumns`:
    - **Skill Match**: Percentage + count tag (`4/5 required skills`).
    - **Semantic Score**: Vector similarity percentage (`85.5%`).
    - **Experience Score**: Candidate years vs required (`5.5 / 4.0 yrs`).
    - **Title Fit**: Title proximity score.
  - `ActionControls`: Stage selector dropdown (`Move Stage`) and `View Details` trigger button.

---

### 4.4 Screen 4: Pipeline Board (Kanban View)

- **Layout Architecture**: Horizontal Scrollable Kanban Container with 5 Stage Columns.
- **Visual Blueprint**:
```
+------------------------------------------------------------------------------------------------------------------------+
| Pipeline Board: Senior Backend Engineer                              [ Search Candidate... ]  [ Minimum Score: 70% ▼ ]  |
+------------------------------------------------------------------------------------------------------------------------+
|  APPLIED (12)           AI SCREENING (5)        TECHNICAL INTERVIEW (3) OFFER EXTENDED (1)      HIRED / REJECTED (2)   |
|  --------------------   --------------------    ----------------------- -------------------    ---------------------  |
|  +------------------+   +------------------+    +---------------------+ +-----------------+    +-------------------+  |
|  | :: Alex Mercer   |   | :: Jordan Lee    |    | :: Morgan Vance     | | :: Sam Taylor   |    | :: Casey Reed     |  |
|  | [ 88.5% Score ]  |   | [ 79.2% Score ]  |    | [ 94.5% Score ]     | | [ 91.0% Score ] |    | [ Rejected: Exp ] |  |
|  | Python, FastAPI  |   | Python, Django   |    | Python, C++, AWS    | | FastAPI, Docker |    | [ 45.0% Score ]   |  |
|  | Applied: 2d ago  |   | Applied: 4d ago  |    | Applied: 1w ago     | | Applied: 2w ago|    +-------------------+  |
|  +------------------+   +------------------+    +---------------------+ +-----------------+                           |
|  | :: Chris Evans   |   | :: Pat Morgan    |                                                                            |
|  | [ 81.0% Score ]  |   | [ 72.0% Score ]  |                                                                            |
|  | FastAPI, Postgres|   | Python, Docker   |                                                                            |
|  +------------------+   +------------------+                                                                            |
+------------------------------------------------------------------------------------------------------------------------+
```
- **Specific Data Points & UI Elements**:
  - **Kanban Column (`KanbanColumn`)**:
    - Column Header: Stage Name (`Applied`, `AI Screening`, `Technical Interview`, `Offer Extended`, `Hired / Rejected`).
    - Badge: Candidate count (`12`).
    - Actions: Column menu (`Sort by Score`, `Bulk Move`, `Stage Settings`).
  - **Kanban Card (`CandidateCard`)**:
    - Drag Grip Icon (`GripVertical`).
    - Candidate Full Name (`h4`).
    - ATS Match Score Badge (`Badge` green/amber/red).
    - Top Skill Badges (`Python`, `FastAPI`).
    - Submission Date ("Applied 2d ago").
    - Drag-and-Drop Triggers: Moving card across columns calls `PATCH /api/v1/applications/{id}/stage`.
    - Click Trigger: Opens `CandidateDrawer` side drawer for quick evaluation.


