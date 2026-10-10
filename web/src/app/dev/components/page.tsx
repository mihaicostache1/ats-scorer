"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  FileSearch,
  Info,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DataTable, type Column } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";

// --- Zod Form Schema ---
const candidateFormSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  role: z.string().min(1, "Please select a target job opening."),
  experienceYears: z
    .number()
    .min(0, "Experience cannot be negative.")
    .max(50, "Experience cannot exceed 50 years."),
  notes: z.string().min(10, "Candidate summary notes must be at least 10 characters long."),
  screeningConsent: z.boolean().refine((val) => val === true, {
    message: "Candidate consent for AI CV screening is required.",
  }),
  priorityNotification: z.boolean(),
});

type CandidateFormValues = z.infer<typeof candidateFormSchema>;

// --- Sample Data for Data Table ---
interface SampleJobCandidate {
  id: string;
  name: string;
  role: string;
  matchScore: number;
  status: "Screened" | "Shortlisted" | "Under Review" | "Rejected";
  appliedDate: string;
  source: string;
}

const sampleCandidates: SampleJobCandidate[] = [
  {
    id: "CAN-001",
    name: "Elena Rostova",
    role: "Senior ML Engineer",
    matchScore: 94,
    status: "Shortlisted",
    appliedDate: "2026-10-08",
    source: "LinkedIn",
  },
  {
    id: "CAN-002",
    name: "Marcus Vance",
    role: "Full Stack Engineer",
    matchScore: 88,
    status: "Screened",
    appliedDate: "2026-10-07",
    source: "Referral",
  },
  {
    id: "CAN-003",
    name: "Aria Thorne",
    role: "Product Manager",
    matchScore: 72,
    status: "Under Review",
    appliedDate: "2026-10-06",
    source: "Career Portal",
  },
  {
    id: "CAN-004",
    name: "Julian Rivera",
    role: "Data Scientist",
    matchScore: 91,
    status: "Shortlisted",
    appliedDate: "2026-10-05",
    source: "Indeed",
  },
  {
    id: "CAN-005",
    name: "Sophie Lin",
    role: "Frontend Architect",
    matchScore: 64,
    status: "Rejected",
    appliedDate: "2026-10-04",
    source: "LinkedIn",
  },
  {
    id: "CAN-006",
    name: "David Kim",
    role: "DevOps Engineer",
    matchScore: 82,
    status: "Screened",
    appliedDate: "2026-10-03",
    source: "GitHub Jobs",
  },
  {
    id: "CAN-007",
    name: "Priya Patel",
    role: "Senior ML Engineer",
    matchScore: 96,
    status: "Shortlisted",
    appliedDate: "2026-10-02",
    source: "Referral",
  },
];

export default function DevComponentsPage() {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [tableLoading, setTableLoading] = React.useState(false);
  const [errorSimulated, setErrorSimulated] = React.useState(false);

  // Form Setup
  const form = useForm<CandidateFormValues>({
    resolver: zodResolver(candidateFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      role: "",
      experienceYears: 3,
      notes: "",
      screeningConsent: false,
      priorityNotification: false,
    },
  });

  const onSubmit = (values: CandidateFormValues) => {
    toast.success(`Candidate ${values.fullName} for ${values.role} was validated successfully!`);
    form.reset();
  };

  // Columns for Data Table
  const columns: Column<SampleJobCandidate>[] = [
    {
      key: "name",
      header: "Candidate Name",
      sortable: true,
      render: (row) => (
        <div className="text-foreground font-medium">
          {row.name}
          <div className="text-muted-foreground text-xs">{row.source}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Applied Role",
      sortable: true,
    },
    {
      key: "matchScore",
      header: "ATS Match",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span
            className={`font-semibold ${
              row.matchScore >= 90
                ? "text-emerald-600 dark:text-emerald-400"
                : row.matchScore >= 75
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {row.matchScore}%
          </span>
          <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full ${
                row.matchScore >= 90
                  ? "bg-emerald-500"
                  : row.matchScore >= 75
                    ? "bg-blue-500"
                    : "bg-amber-500"
              }`}
              style={{ width: `${row.matchScore}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => {
        const variantMap: Record<
          SampleJobCandidate["status"],
          "default" | "secondary" | "outline" | "destructive" | "success" | "warning"
        > = {
          Shortlisted: "success",
          Screened: "default",
          "Under Review": "warning",
          Rejected: "destructive",
        };
        return <Badge variant={variantMap[row.status]}>{row.status}</Badge>;
      },
    },
    {
      key: "appliedDate",
      header: "Applied Date",
      sortable: true,
      className: "text-muted-foreground text-xs",
    },
    {
      key: "actions",
      header: "Action",
      render: (row) => (
        <Button
          variant="outline"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            toast.info(`Viewing score details for ${row.name}`);
          }}
        >
          View Score
        </Button>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="space-y-12 pb-16">
        {/* Page Header */}
        <div className="border-border border-b pb-6">
          <div className="text-primary flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <Sparkles className="size-4" />
            Design System & Component Showcase
          </div>
          <h1 className="text-foreground mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            UI Components & Interactive Sandbox
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            Live preview of all shared design system primitives: layout shell, sidebar navigation,
            keyboard-accessible dialogs, toast notification system, form controls with
            react-hook-form & zod, sortable data table, skeletons, empty states, and error handlers.
          </p>
        </div>

        {/* Section 1: Buttons & Badges */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md text-xs font-bold">
              1
            </div>
            <h2 className="text-foreground text-xl font-bold">Buttons & Status Badges</h2>
          </div>
          <p className="text-muted-foreground text-xs">
            Built with @base-ui/react and Tailwind CSS OKLCH tokens with full keyboard focus
            styling.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="border-border bg-card space-y-3 rounded-xl border p-5">
              <h3 className="text-sm font-semibold">Button Variants & Sizes</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="default">Default Button</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link Style</Button>
              </div>
              <div className="border-border/50 flex flex-wrap items-center gap-2 border-t pt-2">
                <Button size="xs">Extra Small (xs)</Button>
                <Button size="sm">Small (sm)</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large (lg)</Button>
                <Button size="icon" aria-label="Icon sample">
                  <Bell className="size-4" />
                </Button>
              </div>
            </div>

            <div className="border-border bg-card space-y-3 rounded-xl border p-5">
              <h3 className="text-sm font-semibold">Status & Categorization Badges</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="success">Success / High Match</Badge>
                <Badge variant="warning">Warning / Review</Badge>
                <Badge variant="destructive">Destructive / Rejected</Badge>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Modals & Dialogs */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md text-xs font-bold">
              2
            </div>
            <h2 className="text-foreground text-xl font-bold">
              Modal Dialogs (Keyboard Accessible & Focus Trapped)
            </h2>
          </div>
          <p className="text-muted-foreground text-xs">
            Using @base-ui/react/dialog. Press{" "}
            <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">Tab</kbd> to cycle
            focus, or{" "}
            <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">Escape</kbd> to
            close.
          </p>

          <div className="border-border bg-card flex flex-wrap items-center gap-4 rounded-xl border p-5">
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
              <DialogTrigger>
                <Button className="gap-2">
                  <Plus className="size-4" />
                  Open Candidate Screening Modal
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Evaluate Candidate Fit</DialogTitle>
                  <DialogDescription>
                    Configure matching criteria and trigger the vector embedding comparison against
                    the selected job requisition.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="border-border bg-muted/40 text-muted-foreground rounded-lg border p-3 text-xs">
                    This modal traps focus inside the dialog and restores focus upon closing.
                  </div>
                  <div>
                    <label className="text-foreground text-xs font-semibold">
                      Minimum Match Threshold
                    </label>
                    <Select className="mt-1" defaultValue="80">
                      <option value="70">70% (Broad Search)</option>
                      <option value="80">80% (Recommended)</option>
                      <option value="90">90% (Strict Keyword & Semantic)</option>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <DialogClose>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    onClick={() => {
                      setModalOpen(false);
                      toast.success("Matching evaluation started for Candidate #001");
                    }}
                  >
                    Confirm & Run Evaluation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        {/* Section 3: Toast System */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md text-xs font-bold">
              3
            </div>
            <h2 className="text-foreground text-xl font-bold">Toast Notification System</h2>
          </div>
          <p className="text-muted-foreground text-xs">
            Accessible live regions with auto-dismiss timers, dismiss buttons, and variant styling.
          </p>

          <div className="border-border bg-card flex flex-wrap items-center gap-3 rounded-xl border p-5">
            <Button
              variant="outline"
              onClick={() => toast.success("Job posting successfully published to careers portal.")}
              className="gap-1.5"
            >
              <CheckCircle2 className="size-4 text-emerald-500" />
              Success Toast
            </Button>

            <Button
              variant="outline"
              onClick={() =>
                toast.error("Failed to parse resume: unsupported PDF compression format.")
              }
              className="gap-1.5"
            >
              <AlertTriangle className="text-destructive size-4" />
              Error Toast
            </Button>

            <Button
              variant="outline"
              onClick={() => toast.info("Vector embeddings recalculating in the background.")}
              className="gap-1.5"
            >
              <Info className="size-4 text-blue-500" />
              Info Toast
            </Button>

            <Button
              variant="outline"
              onClick={() => toast.warning("Candidate consent expires in 7 days.")}
              className="gap-1.5"
            >
              <AlertTriangle className="size-4 text-amber-500" />
              Warning Toast
            </Button>
          </div>
        </section>

        {/* Section 4: Form Fields with React Hook Form & Zod */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md text-xs font-bold">
              4
            </div>
            <h2 className="text-foreground text-xl font-bold">
              Form Fields (react-hook-form & Zod Validation)
            </h2>
          </div>
          <p className="text-muted-foreground text-xs">
            Complete validation loop with Input, Textarea, Select, Checkbox, and Switch. Accessible
            aria-invalid, aria-describedby, and role=&quot;alert&quot; error messages.
          </p>

          <div className="border-border bg-card max-w-2xl rounded-xl border p-6 shadow-xs">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Full Name */}
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Candidate Full Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Alex Morgan"
                            error={!!form.formState.errors.fullName}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>Official legal name on resume.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Email */}
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="alex@example.com"
                            error={!!form.formState.errors.email}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>For automated match notifications.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Role Select */}
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Job Posting</FormLabel>
                        <FormControl>
                          <Select error={!!form.formState.errors.role} {...field}>
                            <option value="">Select a job requisition...</option>
                            <option value="Senior ML Engineer">Senior ML Engineer</option>
                            <option value="Full Stack Engineer">Full Stack Engineer</option>
                            <option value="Product Manager">Product Manager</option>
                            <option value="Data Scientist">Data Scientist</option>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Years of Experience */}
                  <FormField
                    control={form.control}
                    name="experienceYears"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Years of Experience</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            error={!!form.formState.errors.experienceYears}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Notes Textarea */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Summary / Screener Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Key achievements, domain strengths, tech stack highlights..."
                          rows={3}
                          error={!!form.formState.errors.notes}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Provide a concise overview for the scoring algorithm.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Consent Checkbox */}
                <FormField
                  control={form.control}
                  name="screeningConsent"
                  render={({ field }) => (
                    <FormItem className="border-border flex flex-col gap-1.5 rounded-lg border p-3">
                      <div className="flex items-start gap-3">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-0.5">
                          <FormLabel className="cursor-pointer">
                            Candidate GDPR/Privacy Screening Consent
                          </FormLabel>
                          <FormDescription>
                            Candidate has given explicit consent to process their CV data for
                            semantic match scoring.
                          </FormDescription>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Switch Notification */}
                <FormField
                  control={form.control}
                  name="priorityNotification"
                  render={({ field }) => (
                    <FormItem className="border-border flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="cursor-pointer">High Priority Alert</FormLabel>
                        <FormDescription>
                          Send instant webhook notification if match score exceeds 90%.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => form.reset()}>
                    Reset Form
                  </Button>
                  <Button type="submit" className="gap-2">
                    <Send className="size-4" />
                    Submit & Validate
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </section>

        {/* Section 5: Data Table */}
        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md text-xs font-bold">
                  5
                </div>
                <h2 className="text-foreground text-xl font-bold">
                  Sortable & Paginated Data Table
                </h2>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Features column sorting, real-time search filtering, rows-per-page selection, and
                responsive overflow.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTableLoading(true);
                setTimeout(() => setTableLoading(false), 1200);
              }}
              className="gap-2 self-start sm:self-auto"
            >
              <RefreshCw className={`size-3.5 ${tableLoading ? "animate-spin" : ""}`} />
              Simulate Loading Skeleton
            </Button>
          </div>

          <DataTable
            data={sampleCandidates}
            columns={columns}
            searchFilterKey={(row) => `${row.name} ${row.role} ${row.status}`}
            searchPlaceholder="Search candidates by name, role, or status..."
            initialPageSize={5}
            isLoading={tableLoading}
            onRowClick={(row) => toast.info(`Selected candidate ${row.name}`)}
          />
        </section>

        {/* Section 6: Skeleton Loaders */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md text-xs font-bold">
              6
            </div>
            <h2 className="text-foreground text-xl font-bold">Skeleton Loaders</h2>
          </div>
          <p className="text-muted-foreground text-xs">
            Shimmer/pulse placeholders for smooth content loading states.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </section>

        {/* Section 7: Empty State Component */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md text-xs font-bold">
              7
            </div>
            <h2 className="text-foreground text-xl font-bold">Empty State Component</h2>
          </div>
          <p className="text-muted-foreground text-xs">
            Reusable empty condition display with icon, explanatory copy, and action button.
          </p>

          <div className="border-border bg-card rounded-xl border p-4">
            <EmptyState
              icon={FileSearch}
              title="No resumes uploaded yet"
              description="Get started by dragging and dropping candidate CV documents or importing from your ATS pipeline."
              action={
                <Button className="gap-2" onClick={() => toast.info("Resume upload modal clicked")}>
                  <Plus className="size-4" />
                  Upload First Resume
                </Button>
              }
            />
          </div>
        </section>

        {/* Section 8: Error Component */}
        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md text-xs font-bold">
                  8
                </div>
                <h2 className="text-foreground text-xl font-bold">Error State Component</h2>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Accessible error container with retry action and expandable technical details.
              </p>
            </div>

            <Button variant="outline" size="sm" onClick={() => setErrorSimulated(!errorSimulated)}>
              Toggle Error Simulation
            </Button>
          </div>

          <div className="border-border bg-card rounded-xl border p-4">
            <ErrorState
              title={
                errorSimulated
                  ? "Failed to communicate with ATS scoring model"
                  : "Database vector index sync interrupted"
              }
              description={
                errorSimulated
                  ? "The machine learning scoring microservice timed out after 30 seconds."
                  : "Connection to the PostgreSQL pgvector extension could not be established."
              }
              error="PostgresPgvectorError: Connection timeout at pgvector/session.py:84: ConnectionRefusedError(111, 'Connection refused')"
              onRetry={() => {
                toast.info("Retrying connection to backend service...");
              }}
              action={
                <Button variant="ghost" onClick={() => toast.info("Opening system status page")}>
                  View System Status
                </Button>
              }
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
