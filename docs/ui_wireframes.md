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
