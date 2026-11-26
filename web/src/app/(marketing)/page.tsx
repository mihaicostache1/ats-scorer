import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, FileUp, Minus } from "lucide-react";

import { CvPaper } from "@/components/marketing/cv-paper";
import { DEMO_JOB, DEMO_SCORE } from "@/components/marketing/demo-data";
import { ExampleDataLabel, ProductPreview } from "@/components/marketing/product-preview";
import { ScoreBreakdown } from "@/components/scoring/score-breakdown";
import { Badge, StatusDot } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "ATS Scorer — See the talent beyond the résumé" },
  description:
    "Turn PDF CVs into structured candidate profiles you can check, see how each candidate matches each job, and keep every decision with people.",
  openGraph: {
    title: "ATS Scorer — See the talent beyond the résumé",
    description:
      "Structured CV review and explainable, job-specific matching for recruitment teams.",
    type: "website",
  },
};

/* ─── Layout primitives ─────────────────────────────────────────────────────── */

const CONTAINER = "mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16";

/** "02 — The problem". The number is Cobalt on dark sections; on light ones a Cobalt tick leads. */
function SectionLabel({
  index,
  children,
  tone,
}: {
  index: string;
  children: React.ReactNode;
  tone: "dark" | "light";
}) {
  return (
    <p
      className={cn(
        "text-eyebrow flex items-center gap-3",
        tone === "dark" ? "text-mist" : "text-slate-text"
      )}
    >
      {tone === "dark" ? (
        <span className="text-cobalt-300">{index}</span>
      ) : (
        <>
          <span aria-hidden="true" className="bg-cobalt-600 h-px w-6" />
          <span className="text-ink-950">{index}</span>
        </>
      )}
      <span aria-hidden="true" className={tone === "dark" ? "text-ink-700" : "text-canvas-300"}>
        /
      </span>
      {children}
    </p>
  );
}

function PrimaryCta({
  className,
  children = "Get started",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href="/register"
      className={cn(
        "group bg-inverse text-inverse-foreground hover:bg-inverse-hover glow-on-ink focus-visible:outline-cobalt-300 inline-flex h-12 items-center gap-2 rounded-[10px] pr-5 pl-6 text-[15px] font-semibold transition-[background-color,box-shadow] duration-(--motion-base) ease-(--ease-fluid) focus-visible:outline-2 focus-visible:outline-offset-[3px]",
        className
      )}
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className="size-4 transition-transform duration-(--motion-base) motion-safe:group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/* ─── 01 Hero ───────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      {/* Architectural grid, faded at the edges; a single column rule anchors the headline. */}
      <div aria-hidden="true" className="ambient-ink absolute inset-0 -z-10" />
      <div aria-hidden="true" className="bg-blueprint mask-fade-y absolute inset-0 -z-10" />
      <div
        aria-hidden="true"
        className="bg-ink-700/60 absolute inset-y-0 left-[max(1.5rem,calc((100vw-1360px)/2+4rem))] -z-10 hidden w-px lg:block"
      />

      <div className={cn(CONTAINER, "pt-32 pb-14 sm:pt-36 lg:pt-36 lg:pb-16")}>
        <p className="text-eyebrow text-mist animate-rise flex items-center gap-3 lg:pl-8">
          <span aria-hidden="true" className="bg-cobalt-300 size-1.5" />
          Applicant tracking with explainable matching
        </p>

        <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-8">
          <h1
            id="hero-title"
            className="text-display text-canvas lg:col-span-8 lg:pl-8 lg:whitespace-nowrap"
          >
            <span className="animate-rise block" style={{ "--d": 60 } as React.CSSProperties}>
              See the talent.
            </span>
            <span className="animate-rise block" style={{ "--d": 140 } as React.CSSProperties}>
              Beyond the <span className="text-cobalt-300">résumé</span>.
            </span>
          </h1>

          <div
            className="animate-rise lg:col-span-4 lg:pb-3"
            style={{ "--d": 240 } as React.CSSProperties}
          >
            <p className="text-lede text-mist max-w-md">
              Turn CVs into structured profiles you can check, see how each candidate matches each
              job, and make the decision yourself, with the evidence in front of you.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <PrimaryCta />
              <a
                href="#workflow"
                className="text-canvas hover:text-cobalt-300 focus-visible:outline-cobalt-300 inline-flex h-12 items-center gap-2 rounded-md text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                See how it works
                <ArrowDown aria-hidden="true" className="size-4" />
              </a>
            </div>
          </div>
        </div>

        <ul
          className="animate-fade border-ink-700/70 text-mist mt-14 grid gap-px border-t font-mono text-[12px] sm:grid-cols-3 lg:ml-8"
          style={{ "--d": 360 } as React.CSSProperties}
          aria-label="What ATS Scorer does"
        >
          {[
            "PDF CV parsing",
            "Structured, correctable profiles",
            "Job-specific, explained scores",
          ].map((item, i) => (
            <li key={item} className="flex items-center gap-3 pt-4 sm:pr-6">
              <span className="text-steel">0{i + 1}</span>
              <span className="text-canvas/90">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* The product straddles the edge between the navy hero and the light section below. */}
      <div className="relative bg-[linear-gradient(to_bottom,#0A1022_0_58%,#F5F6F9_58%_100%)]">
        <div
          className={cn(CONTAINER, "animate-rise pb-4")}
          style={{ "--d": 420 } as React.CSSProperties}
        >
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

/* ─── 02 The problem ────────────────────────────────────────────────────────── */

function Problem() {
  const points = [
    {
      title: "A CV is a document, not data",
      body: "Every CV arrives in its own layout. Comparing two of them usually means reading both from the top.",
    },
    {
      title: "Fit is rarely written down",
      body: "Which skills a job needs, and which of them a candidate shows, tends to live in a reviewer's head.",
    },
    {
      title: "A decision needs a reason",
      body: "When someone asks why a candidate moved forward, the answer should be more than a number.",
    },
  ];
  return (
    <section aria-labelledby="problem-title" className="bg-canvas text-ink-950">
      <div className={cn(CONTAINER, "pt-24 pb-28 sm:pt-28 lg:pt-32 lg:pb-36")}>
        <div className="reveal grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <SectionLabel index="02" tone="light">
              The problem
            </SectionLabel>
            <h2 id="problem-title" className="text-section mt-6 max-w-[14ch]">
              Recruitment deserves more context.
            </h2>
          </div>
          <p className="text-lede text-slate-text lg:col-span-4 lg:col-start-9 lg:self-end">
            ATS Scorer reads each CV into the same structure, lets you correct what it got wrong,
            and compares candidates to the requirements you wrote for the job. The judgment stays
            with you.
          </p>
        </div>

        <ol className="border-canvas-300 mt-20 grid border-t md:grid-cols-3">
          {points.map((point, i) => (
            <li
              key={point.title}
              className={cn(
                "reveal border-canvas-300 pt-8 pb-2 md:pr-10",
                i > 0 && "md:border-l md:pl-10",
                i > 0 && "border-t md:border-t-0"
              )}
            >
              <span className="text-slate-text font-mono text-xs">0{i + 1}</span>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.02em]">{point.title}</h3>
              <p className="text-slate-text mt-3 max-w-sm leading-relaxed">{point.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─── 03 Workflow ───────────────────────────────────────────────────────────── */

function UploadDemo() {
  const files = [
    { name: "tomas-okafor.pdf", status: "Parsed", variant: "success" as const },
    { name: "lena-moreau.pdf", status: "Extracting text", variant: "info" as const, busy: true },
    { name: "kenji-arnaud.pdf", status: "Queued", variant: "secondary" as const },
  ];
  return (
    <div className="light bg-card text-foreground border-border rounded-xl border p-4">
      <div className="border-border-strong flex flex-col items-center rounded-lg border border-dashed px-4 py-6 text-center">
        <FileUp className="text-muted-foreground size-5" aria-hidden="true" />
        <p className="mt-2 text-[13px] font-medium">Drop a PDF CV, or choose a file</p>
        <p className="text-muted-foreground mt-0.5 text-[11.5px]">PDF only · up to 10 MB</p>
      </div>
      <ul className="mt-3 space-y-1.5">
        {files.map((file) => (
          <li
            key={file.name}
            className="bg-background-secondary relative flex items-center justify-between gap-3 overflow-hidden rounded-md px-3 py-2"
          >
            <span className="text-foreground truncate font-mono text-[11.5px]">{file.name}</span>
            <Badge variant={file.variant}>
              <StatusDot />
              {file.status}
            </Badge>
            {file.busy && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden"
              >
                <span className="animate-indeterminate bg-electric block h-full w-1/3" />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnderstandDemo() {
  const rows = [
    { label: "Name", value: "Mara Lindqvist" },
    { label: "Headline", value: "Backend Engineer" },
    { label: "Experience", value: "6 years" },
  ];
  return (
    <div className="light bg-card text-foreground border-border rounded-xl border p-4">
      <dl className="divide-border divide-y">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2 first:pt-0">
            <dt className="text-muted-foreground text-[12px]">{row.label}</dt>
            <dd className="text-[13px] font-medium">{row.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-muted-foreground text-[12px]">Phone</dt>
          <dd className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-[12px]">+46 70 ··· ·· 18</span>
            <Badge variant="warning">Check · 50%</Badge>
          </dd>
        </div>
        <div className="pt-2.5">
          <dt className="text-muted-foreground text-[12px]">Skills</dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {["Python", "FastAPI", "PostgreSQL", "Redis", "Docker"].map((skill) => (
              <span
                key={skill}
                className="bg-secondary inline-flex h-6 items-center rounded-sm px-1.5 text-[11.5px]"
              >
                {skill}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ReviewDemo() {
  const stages = ["Applied", "Screening", "Interview", "Offer"];
  return (
    <div className="light bg-card text-foreground border-border rounded-xl border p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-medium">Match for {DEMO_JOB.title}</p>
        <p className="font-mono text-2xl font-medium tracking-tight tabular-nums">
          84<span className="text-muted-foreground text-xs">/100</span>
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {[
          ["Skill overlap", 86],
          ["Semantic similarity", 81],
          ["Experience", 92],
        ].map(([label, value]) => (
          <li key={label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <span className="text-muted-foreground text-[11.5px]">{label}</span>
            <span className="font-mono text-[11.5px] tabular-nums">{value}</span>
            <span className="bg-secondary col-span-2 h-1 overflow-hidden rounded-full">
              <span className="bg-electric block h-full" style={{ width: `${value}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <ol
        className="border-border mt-4 flex items-center gap-1 border-t pt-3"
        aria-label="Pipeline stages"
      >
        {stages.map((stage, i) => (
          <li
            key={stage}
            className={cn(
              "flex h-6 flex-1 items-center justify-center rounded-sm text-[10.5px]",
              i === 1
                ? "bg-foreground text-background font-medium"
                : i < 1
                  ? "bg-secondary text-muted-foreground"
                  : "text-muted-foreground border-border border border-dashed"
            )}
          >
            {stage}
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground mt-2 text-[11px]">
        Moved by a recruiter. Logged with the date.
      </p>
    </div>
  );
}

function Workflow() {
  const steps = [
    {
      verb: "Upload",
      body: "Add a candidate and upload their CV as a PDF. Processing runs in the background and the status updates on its own.",
      demo: <UploadDemo />,
    },
    {
      verb: "Understand",
      body: "Read the extracted profile: experience, skills, education. Fields the parser was unsure about are flagged for you to check.",
      demo: <UnderstandDemo />,
    },
    {
      verb: "Review",
      body: "See how a candidate matches a specific job, component by component, then move them through your stages yourself.",
      demo: <ReviewDemo />,
    },
  ];
  return (
    <section
      id="workflow"
      aria-labelledby="workflow-title"
      className="text-ink-950 scroll-mt-16 bg-white"
    >
      <div className={cn(CONTAINER, "py-24 sm:py-28 lg:py-36")}>
        <div className="reveal flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div>
            <SectionLabel index="03" tone="light">
              The workflow
            </SectionLabel>
            <h2 id="workflow-title" className="text-section mt-6">
              From documents
              <br className="hidden sm:block" /> to decisions.
            </h2>
          </div>
          <ExampleDataLabel className="self-start lg:self-end" />
        </div>

        <ol className="mt-16 grid gap-x-8 gap-y-16 lg:mt-20 lg:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.verb} className="reveal flex flex-col">
              <div className="border-ink-950 flex items-baseline gap-4 border-t-2 pt-5">
                <span className="text-slate-text font-mono text-sm tabular-nums">0{i + 1}</span>
                <h3 className="text-subsection">{step.verb}</h3>
              </div>
              <p className="text-slate-text mt-4 max-w-sm leading-relaxed">{step.body}</p>
              <div className="mt-8 lg:mt-auto lg:pt-8">{step.demo}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─── 04 Capabilities ───────────────────────────────────────────────────────── */

function CorrectionDemo() {
  return (
    <div className="light bg-card text-foreground border-border grid overflow-hidden rounded-xl border sm:grid-cols-[1.05fr_1fr]">
      <div className="flex items-center justify-center bg-(--document-well) p-6 sm:p-8">
        <CvPaper className="max-w-[300px]" />
      </div>
      <div className="border-border space-y-4 border-t p-5 sm:border-t-0 sm:border-l">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold">Experience</p>
          <span className="text-muted-foreground font-mono text-[11px]">2 entries</span>
        </div>
        {[
          { label: "Title", value: "Backend Engineer" },
          { label: "Company", value: "Northwind Logistics" },
        ].map((field) => (
          <div key={field.label} className="space-y-1.5">
            <p className="text-[12px] font-medium">{field.label}</p>
            <div className="border-border-strong flex h-8 items-center rounded-md border px-2.5 text-[12.5px]">
              {field.value}
            </div>
          </div>
        ))}
        <div className="space-y-1.5">
          <p className="flex items-center justify-between text-[12px] font-medium">
            Start date
            <Badge variant="warning">Low confidence · 62%</Badge>
          </p>
          <div className="border-electric ring-electric/20 flex h-8 items-center rounded-md border px-2.5 text-[12.5px] ring-[3px]">
            2022-03
            <span
              aria-hidden="true"
              className="bg-foreground ml-px h-4 w-px motion-safe:animate-pulse"
            />
          </div>
          <p className="text-muted-foreground text-[11.5px]">Corrected by a reviewer.</p>
        </div>
        <div className="border-border flex items-center justify-between border-t pt-4">
          <span className="text-muted-foreground text-[11.5px]">Unsaved changes</span>
          <span className="bg-primary text-primary-foreground inline-flex h-7 items-center rounded-md px-3 text-[12px] font-medium">
            Save corrections
          </span>
        </div>
      </div>
    </div>
  );
}

function Capabilities() {
  const items = [
    {
      title: "Structured candidate profiles",
      body: "Contact details, experience, education, languages and certifications in one consistent shape.",
    },
    {
      title: "Jobs with explicit requirements",
      body: "Required and nice-to-have skills, minimum experience and status, from draft to closed.",
    },
    {
      title: "Candidate-to-job matching",
      body: "Scores are calculated per job from skills, meaning, experience and title, never across every role at once.",
    },
    {
      title: "Stages with a history",
      body: "Each organization has its own pipeline stages, and every move between them is recorded.",
    },
    {
      title: "Roles for the whole team",
      body: "Admins manage people, recruiters run the process, hiring managers get a read-only view.",
    },
  ];
  return (
    <section
      id="product"
      aria-labelledby="product-title"
      className="bg-canvas text-ink-950 scroll-mt-16"
    >
      <div className={cn(CONTAINER, "py-24 sm:py-28 lg:py-36")}>
        <div className="reveal max-w-3xl">
          <SectionLabel index="04" tone="light">
            Capabilities
          </SectionLabel>
          <h2 id="product-title" className="text-section mt-6">
            Structure you can check.
          </h2>
        </div>

        <div className="mt-16 grid gap-12 lg:mt-20 lg:grid-cols-12 lg:gap-8">
          <div className="reveal lg:col-span-7">
            <CorrectionDemo />
            <div className="mt-8 grid gap-4 sm:grid-cols-[auto_1fr] sm:gap-8">
              <h3 className="text-subsection max-w-[12ch]">CV parsing you can correct</h3>
              <p className="text-slate-text max-w-md leading-relaxed sm:pt-1">
                The original PDF sits next to the extracted fields. Uncertain values are flagged
                with the parser&apos;s confidence, and a reviewer can fix any field before it is
                used.
              </p>
            </div>
          </div>

          <ul className="border-canvas-300 lg:col-span-4 lg:col-start-9 lg:border-l lg:pl-8">
            {items.map((item, i) => (
              <li
                key={item.title}
                className="reveal border-canvas-300 grid grid-cols-[2rem_1fr] border-b py-6 first:pt-0 last:border-b-0"
              >
                <span className="text-slate-text pt-1 font-mono text-xs tabular-nums">
                  0{i + 1}
                </span>
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.015em]">{item.title}</h3>
                  <p className="text-slate-text mt-1.5 text-[15px] leading-relaxed">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ─── 05 Candidate intelligence ─────────────────────────────────────────────── */

function CandidateIntelligence() {
  return (
    <section
      id="review"
      aria-labelledby="review-title"
      className="bg-ink-950 relative isolate scroll-mt-16 overflow-hidden"
    >
      <div aria-hidden="true" className="ambient-ink absolute inset-0 -z-10" />
      <div
        aria-hidden="true"
        className="bg-blueprint mask-fade-y absolute inset-0 -z-10 opacity-70"
      />
      <div className={cn(CONTAINER, "py-24 sm:py-28 lg:py-36")}>
        <div className="reveal grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <SectionLabel index="05" tone="dark">
              Candidate review
            </SectionLabel>
            <h2 id="review-title" className="text-section text-canvas mt-6">
              More context.
              <br />
              <span className="text-mist">Less guesswork.</span>
            </h2>
          </div>
          <p className="text-lede text-mist lg:col-span-4 lg:col-start-9">
            The original document, what was extracted from it and how it compares to the job, side
            by side. Every number can be traced to something you can read.
          </p>
        </div>

        <div className="reveal dark surface mt-16 overflow-hidden rounded-xl lg:mt-20">
          <div className="border-ink-700 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-ink-800 text-mist flex size-8 items-center justify-center rounded-md text-xs font-medium">
                ML
              </span>
              <div className="min-w-0">
                <p className="text-canvas truncate text-sm font-semibold">Mara Lindqvist</p>
                <p className="text-mist truncate text-xs">
                  {DEMO_JOB.title} · {DEMO_JOB.location}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success">
                <StatusDot />
                Parsed
              </Badge>
              <ExampleDataLabel />
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="border-ink-700 relative border-b bg-[#0D1429] lg:border-r lg:border-b-0">
              <div
                aria-hidden="true"
                className="border-ink-700 text-mist flex h-10 items-center justify-between border-b px-4 font-mono text-[11px]"
              >
                <span>mara-lindqvist.pdf</span>
                <span>Page 1 of 1 · 100%</span>
              </div>
              <div className="flex justify-center px-6 py-10 sm:px-12 lg:py-14">
                <CvPaper className="max-w-[460px]" />
              </div>
            </div>

            <div className="min-w-0">
              <div
                role="presentation"
                className="border-ink-700 flex gap-6 overflow-x-auto border-b px-6 text-[13px]"
              >
                {["Overview", "Experience", "Skills", "Education", "Match analysis"].map((tab) => (
                  <span
                    key={tab}
                    className={cn(
                      "-mb-px border-b-2 py-3 whitespace-nowrap",
                      tab === "Match analysis"
                        ? "text-canvas border-cobalt-300 font-medium"
                        : "text-mist border-transparent"
                    )}
                  >
                    {tab}
                  </span>
                ))}
              </div>
              <div className="p-6 sm:p-8">
                <ScoreBreakdown score={DEMO_SCORE} jobTitle={DEMO_JOB.title} />
              </div>
            </div>
          </div>
        </div>

        <ol className="text-mist mt-12 grid gap-8 text-[15px] sm:grid-cols-3">
          {[
            [
              "Traced to the source",
              "Extracted values are tied to the passage of the CV they came from.",
            ],
            ["Parts, not a verdict", "Each component and its weight is shown next to the total."],
            [
              "Unknown is not zero",
              "A component that can't be computed says so, and doesn't count against anyone.",
            ],
          ].map(([title, body], i) => (
            <li key={title} className="reveal border-ink-700 border-t pt-5">
              <p className="text-canvas flex items-baseline gap-3 font-medium">
                <span className="text-cobalt-300 font-mono text-xs">0{i + 1}</span>
                {title}
              </p>
              <p className="mt-2 leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─── 06 Transparency and human oversight ───────────────────────────────────── */

function Transparency() {
  const principles = [
    {
      title: "Every score shows its parts",
      body: "Component scores, their weights, matched and missing skills, written explanations and the model version that produced them.",
    },
    {
      title: "No automatic rejection",
      body: "A low score never hides, rejects or contacts a candidate. A person moves every application between stages.",
    },
    {
      title: "People correct the record",
      body: "Reviewers can fix any extracted field. Corrections are saved to the profile, with the date it was last reviewed.",
    },
    {
      title: "Access by role, data by organization",
      body: "Admins, recruiters and read-only viewers each see what their role allows, and each organization's data is kept separate.",
    },
  ];
  return (
    <section
      id="transparency"
      aria-labelledby="transparency-title"
      className="text-ink-950 scroll-mt-16 bg-white"
    >
      <div className={cn(CONTAINER, "py-24 sm:py-28 lg:py-36")}>
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-8">
          <div className="reveal lg:col-span-5">
            <SectionLabel index="06" tone="light">
              Transparency
            </SectionLabel>
            <h2 id="transparency-title" className="text-section mt-6 max-w-[11ch]">
              Scores explain. People decide.
            </h2>
            <p className="text-slate-text mt-8 max-w-md leading-relaxed">
              ATS Scorer is built to support human judgment, not to replace it. It does not remove
              bias from hiring on its own, and a match score says nothing about a person beyond how
              their CV relates to one job description.
            </p>
          </div>

          <ul className="border-canvas-300 grid border-t sm:grid-cols-2 lg:col-span-7 lg:self-end">
            {principles.map((principle, i) => (
              <li
                key={principle.title}
                className={cn(
                  "reveal border-canvas-300 py-8 sm:pr-8",
                  i % 2 === 1 && "sm:border-l sm:pl-8",
                  i < 2 && "border-b",
                  i === 2 && "border-b sm:border-b-0"
                )}
              >
                <span
                  aria-hidden="true"
                  className="text-ink-950 flex size-6 items-center justify-center"
                >
                  {i === 1 ? <Minus className="size-4" /> : <Check className="size-4" />}
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-[-0.015em]">
                  {principle.title}
                </h3>
                <p className="text-slate-text mt-2 text-[15px] leading-relaxed">{principle.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ─── 07 Final call to action ───────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="bg-ink-950 relative isolate overflow-hidden">
      <div aria-hidden="true" className="ambient-ink absolute inset-0 -z-10" />
      <div aria-hidden="true" className="bg-blueprint mask-fade-y absolute inset-0 -z-10" />
      <div className={cn(CONTAINER, "py-28 sm:py-32 lg:py-40")}>
        <div className="reveal grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-8">
          <div className="lg:col-span-8">
            <SectionLabel index="07" tone="dark">
              Get started
            </SectionLabel>
            <h2 id="cta-title" className="text-display text-canvas mt-8">
              Make every review
              <br />
              count.
            </h2>
          </div>
          <div className="lg:col-span-4 lg:pb-3">
            <p className="text-mist max-w-sm leading-relaxed">
              Create an organization, invite your team and post your first job. Your account becomes
              the organization&apos;s admin.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <PrimaryCta>Create an organization</PrimaryCta>
              <Link
                href="/login"
                className="text-canvas hover:text-cobalt-300 focus-visible:outline-cobalt-300 rounded-md text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Problem />
      <Workflow />
      <Capabilities />
      <CandidateIntelligence />
      <Transparency />
      <FinalCta />
    </>
  );
}
