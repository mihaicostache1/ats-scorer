import type { ScoreResponse } from "@/components/scoring/score-breakdown";

/**
 * Synthetic demonstration data for the public website. Every person, CV and job here is invented;
 * no real candidate data is ever shown publicly. The page labels these previews "Example data".
 */

export const DEMO_JOB = {
  title: "Senior Backend Engineer",
  department: "Platform",
  location: "Remote · EU",
  required: ["Python", "PostgreSQL", "FastAPI", "Docker", "Redis", "AWS"],
};

export interface DemoCandidate {
  id: string;
  name: string;
  initials: string;
  headline: string;
  stage: string;
  parse: "Parsed" | "Processing" | "Needs review";
  score: number | null;
}

export const DEMO_CANDIDATES: DemoCandidate[] = [
  {
    id: "c1",
    name: "Mara Lindqvist",
    initials: "ML",
    headline: "Backend Engineer · 6 yrs",
    stage: "Screening",
    parse: "Parsed",
    score: 84,
  },
  {
    id: "c2",
    name: "Tomás Okafor",
    initials: "TO",
    headline: "Software Engineer · 5 yrs",
    stage: "Applied",
    parse: "Parsed",
    score: 79,
  },
  {
    id: "c3",
    name: "Ines Varga",
    initials: "IV",
    headline: "Data Engineer · 7 yrs",
    stage: "Applied",
    parse: "Needs review",
    score: 71,
  },
  {
    id: "c4",
    name: "Kenji Arnaud",
    initials: "KA",
    headline: "Full-stack Developer · 4 yrs",
    stage: "Applied",
    parse: "Parsed",
    score: 66,
  },
  {
    id: "c5",
    name: "Lena Moreau",
    initials: "LM",
    headline: "CV uploaded 2 min ago",
    stage: "Applied",
    parse: "Processing",
    score: null,
  },
];

export const DEMO_SCORE: ScoreResponse = {
  id: "00000000-0000-4000-8000-00000000d001",
  application_id: "00000000-0000-4000-8000-00000000a001",
  overall_score: 84,
  skill_overlap_score: 86,
  semantic_score: 81,
  experience_score: 92,
  title_fit_score: null,
  model_version: "hybrid-1.0.0",
  component_breakdown: {
    matched_skills: ["Python", "PostgreSQL", "FastAPI", "Docker", "Redis"],
    missing_skills: ["AWS"],
    weights: { skill_overlap: 0.3, semantic: 0.35, experience: 0.1, title_fit: 0.15 },
    explanations: [
      "Matched 5 of 6 required skills. AWS was not found in the CV.",
      "Six years of backend experience; the job asks for at least four.",
      "No recent title close enough to compare, so title fit was not computed and its weight was shared across the other components.",
    ],
  },
};

/** A short, invented CV, rendered as a paper page in the candidate review preview. */
export const DEMO_CV = {
  name: "Mara Lindqvist",
  headline: "Backend Engineer",
  contact: "mara.lindqvist@example.com · Gothenburg, Sweden",
  summary:
    "Backend engineer focused on reliable data services. Designs APIs, owns PostgreSQL schemas and keeps queues and caches predictable under load.",
  experience: [
    {
      role: "Backend Engineer",
      org: "Northwind Logistics",
      period: "2022 — Present",
      points: [
        "Built FastAPI services for shipment tracking used by 40 internal teams.",
        "Moved a reporting job from cron to a Redis-backed queue.",
      ],
    },
    {
      role: "Software Engineer",
      org: "Kestrel Analytics",
      period: "2019 — 2022",
      points: [
        "Maintained PostgreSQL schemas and migrations for the core product.",
        "Containerised local development with Docker Compose.",
      ],
    },
  ],
  education: "MSc Computer Science · Westfjord University",
  skills: ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kafka", "Terraform"],
};
