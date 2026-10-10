"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Briefcase,
  Building,
  CheckCircle2,
  MapPin,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { DataTable, type Column } from "@/components/common/data-table";

// --- Job Posting Zod Schema ---
const newJobSchema = z.object({
  title: z.string().min(3, "Job title must be at least 3 characters."),
  department: z.string().min(2, "Department is required."),
  location: z.string().min(2, "Location is required."),
  employmentType: z.string().min(1, "Select an employment type."),
  minExperience: z.number().min(0, "Minimum experience must be 0 or more."),
  description: z.string().min(10, "Job description must be at least 10 characters."),
  autoScreen: z.boolean(),
});

type NewJobValues = z.infer<typeof newJobSchema>;

interface JobRow {
  id: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  status: "Published" | "Draft" | "Archived";
  applicantCount: number;
  avgMatch: number;
}

const initialJobs: JobRow[] = [
  {
    id: "JOB-101",
    title: "Senior Machine Learning Engineer",
    department: "AI & Research",
    location: "Remote (US/EU)",
    employmentType: "Full-Time",
    status: "Published",
    applicantCount: 24,
    avgMatch: 88,
  },
  {
    id: "JOB-102",
    title: "Principal Frontend Architect",
    department: "Engineering",
    location: "San Francisco, CA",
    employmentType: "Full-Time",
    status: "Published",
    applicantCount: 18,
    avgMatch: 82,
  },
  {
    id: "JOB-103",
    title: "Product Manager, AI Platform",
    department: "Product",
    location: "New York, NY",
    employmentType: "Full-Time",
    status: "Published",
    applicantCount: 31,
    avgMatch: 76,
  },
  {
    id: "JOB-104",
    title: "Data Platform Engineer",
    department: "Data Engineering",
    location: "Remote",
    employmentType: "Contract",
    status: "Draft",
    applicantCount: 5,
    avgMatch: 91,
  },
  {
    id: "JOB-105",
    title: "DevOps & Infrastructure Lead",
    department: "Operations",
    location: "London, UK",
    employmentType: "Full-Time",
    status: "Published",
    applicantCount: 12,
    avgMatch: 84,
  },
  {
    id: "JOB-106",
    title: "NLP Research Scientist",
    department: "AI & Research",
    location: "Remote",
    employmentType: "Full-Time",
    status: "Archived",
    applicantCount: 42,
    avgMatch: 92,
  },
];

let nextJobId = 201;

export default function HomePage() {
  const [jobs, setJobs] = React.useState<JobRow[]>(initialJobs);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const form = useForm<NewJobValues>({
    resolver: zodResolver(newJobSchema),
    defaultValues: {
      title: "",
      department: "Engineering",
      location: "Remote",
      employmentType: "Full-Time",
      minExperience: 3,
      description: "",
      autoScreen: true,
    },
  });

  const handleCreateJob = (values: NewJobValues) => {
    const newJob: JobRow = {
      id: `JOB-${nextJobId++}`,
      title: values.title,
      department: values.department,
      location: values.location,
      employmentType: values.employmentType,
      status: "Published",
      applicantCount: 0,
      avgMatch: 0,
    };
    setJobs([newJob, ...jobs]);
    toast.success(`Job requisition "${values.title}" created successfully!`);
    setDialogOpen(false);
    form.reset();
  };

  const columns: Column<JobRow>[] = [
    {
      key: "title",
      header: "Job Requisition",
      sortable: true,
      render: (row) => (
        <div>
          <div className="text-foreground font-semibold">{row.title}</div>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1">
              <Building className="size-3" />
              {row.department}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {row.location}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "employmentType",
      header: "Type",
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground text-xs font-medium">{row.employmentType}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => {
        const variant =
          row.status === "Published" ? "success" : row.status === "Draft" ? "secondary" : "outline";
        return <Badge variant={variant}>{row.status}</Badge>;
      },
    },
    {
      key: "applicantCount",
      header: "Candidates",
      sortable: true,
      render: (row) => (
        <div className="text-foreground font-medium">
          {row.applicantCount}{" "}
          <span className="text-muted-foreground text-xs font-normal">applicants</span>
        </div>
      ),
    },
    {
      key: "avgMatch",
      header: "Avg. Match",
      sortable: true,
      render: (row) =>
        row.avgMatch > 0 ? (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {row.avgMatch}%
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Pending</span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <Button
          variant="outline"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            toast.info(`Opening candidate pipeline for ${row.title}`);
          }}
        >
          View Pipeline
        </Button>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Top welcome banner */}
        <div className="border-border flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
                Recruitment Dashboard
              </h1>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Org: Demo Org
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Monitor job requisitions, candidate match distributions, and AI scoring pipeline.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/dev/components">
              <Button variant="outline" className="gap-2">
                <Sparkles className="text-primary size-4" />
                Component Sandbox
              </Button>
            </Link>

            {/* Modal Dialog with react-hook-form */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger>
                <Button className="gap-2">
                  <Plus className="size-4" />
                  Post New Requisition
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Create New Job Opening</DialogTitle>
                  <DialogDescription>
                    Fill in the details below. Our semantic matcher will automatically index the
                    skills for incoming CV evaluations.
                  </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleCreateJob)} className="space-y-4 py-2">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Job Title</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Senior Machine Learning Engineer"
                              error={!!form.formState.errors.title}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="department"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Department</FormLabel>
                            <FormControl>
                              <Select {...field}>
                                <option value="Engineering">Engineering</option>
                                <option value="AI & Research">AI & Research</option>
                                <option value="Product">Product</option>
                                <option value="Data Engineering">Data Engineering</option>
                                <option value="Operations">Operations</option>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Remote, San Francisco" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="employmentType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Employment Type</FormLabel>
                            <FormControl>
                              <Select {...field}>
                                <option value="Full-Time">Full-Time</option>
                                <option value="Part-Time">Part-Time</option>
                                <option value="Contract">Contract</option>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="minExperience"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Min Experience (Years)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Requisition Summary & Key Skills</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe responsibilities, required skills (Python, PyTorch, etc.)..."
                              rows={3}
                              error={!!form.formState.errors.description}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="autoScreen"
                      render={({ field }) => (
                        <FormItem className="border-border flex items-center gap-3 rounded-lg border p-3">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-0.5">
                            <FormLabel className="cursor-pointer">
                              Enable Automated Vector Scoring
                            </FormLabel>
                            <FormDescription>
                              Trigger pgvector embeddings calculation immediately upon candidate
                              application.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    <DialogFooter className="pt-2">
                      <DialogClose>
                        <Button type="button" variant="outline">
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button type="submit">Create Requisition</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-border bg-card rounded-xl border p-5 shadow-xs">
            <div className="text-muted-foreground flex items-center justify-between">
              <span className="text-xs font-medium tracking-wider uppercase">Active Openings</span>
              <Briefcase className="size-4" />
            </div>
            <div className="text-foreground mt-3 text-2xl font-bold">{jobs.length}</div>
            <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
              <span className="font-medium text-emerald-600">+2 this week</span>
            </div>
          </div>

          <div className="border-border bg-card rounded-xl border p-5 shadow-xs">
            <div className="text-muted-foreground flex items-center justify-between">
              <span className="text-xs font-medium tracking-wider uppercase">
                Screened Candidates
              </span>
              <Users className="size-4" />
            </div>
            <div className="text-foreground mt-3 text-2xl font-bold">132</div>
            <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
              <span className="font-medium text-emerald-600">98% consent verified</span>
            </div>
          </div>

          <div className="border-border bg-card rounded-xl border p-5 shadow-xs">
            <div className="text-muted-foreground flex items-center justify-between">
              <span className="text-xs font-medium tracking-wider uppercase">
                Average ATS Score
              </span>
              <TrendingUp className="size-4" />
            </div>
            <div className="mt-3 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              86.4%
            </div>
            <div className="text-muted-foreground mt-1 text-xs">Across 20 synthetic roles</div>
          </div>

          <div className="border-border bg-card rounded-xl border p-5 shadow-xs">
            <div className="text-muted-foreground flex items-center justify-between">
              <span className="text-xs font-medium tracking-wider uppercase">Backend Services</span>
              <CheckCircle2 className="size-4 text-emerald-500" />
            </div>
            <div className="text-foreground mt-3 text-2xl font-bold">Healthy</div>
            <div className="text-muted-foreground mt-1 text-xs">PostgreSQL, Redis & FastAPI</div>
          </div>
        </div>

        {/* Data Table Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-foreground text-lg font-semibold tracking-tight">
              Job Requisitions & Scoring Status
            </h2>
          </div>

          <DataTable
            data={jobs}
            columns={columns}
            searchFilterKey={(row) => `${row.title} ${row.department} ${row.location}`}
            searchPlaceholder="Filter jobs by title, department, or location..."
            initialPageSize={5}
            onRowClick={(row) => {
              toast.info(`Selected requisition: ${row.title}`);
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
