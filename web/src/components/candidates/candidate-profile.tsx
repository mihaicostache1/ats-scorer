"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Mail, MapPin, Phone, UserX } from "lucide-react";

import { getCandidate } from "@/api";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, getInitials } from "@/lib/format";
import { CandidateApplications } from "./candidate-applications";
import { CandidateCvs } from "./candidate-cvs";
import { ParsedSummary } from "./parsed-summary";
import { ProfileSection } from "./profile-section";
import { unwrap, useResource } from "./use-resource";
import type { CandidateResponse } from "./use-candidates";

const backLink =
  "text-muted-foreground hover:text-foreground focus-visible:ring-primary/25 inline-flex items-center gap-1.5 rounded-md text-sm focus-visible:ring-4 focus-visible:outline-none";

export function CandidateProfileSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" role="status" aria-label="Loading candidate">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-14 w-80" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-footnote font-medium">{label}</dt>
      <dd className="text-foreground mt-1 text-sm">{children}</dd>
    </div>
  );
}

const none = <span className="text-muted-foreground">—</span>;

function ContactCard({ candidate }: { candidate: CandidateResponse }) {
  const link =
    "focus-visible:ring-primary/25 inline-flex items-center gap-1.5 rounded-md hover:underline focus-visible:ring-4 focus-visible:outline-none";
  return (
    <ProfileSection id="contact" title="Contact">
      <dl className="grid gap-5 sm:grid-cols-2">
        <Fact label="Email">
          <a href={`mailto:${candidate.email}`} className={`${link} break-all`}>
            <Mail className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            {candidate.email}
          </a>
        </Fact>
        <Fact label="Phone">
          {candidate.phone ? (
            <a href={`tel:${candidate.phone.replace(/[^\d+]/g, "")}`} className={link}>
              <Phone className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              {candidate.phone}
            </a>
          ) : (
            none
          )}
        </Fact>
        <Fact label="Location">
          {candidate.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              {candidate.location}
            </span>
          ) : (
            none
          )}
        </Fact>
        <Fact label="Consent given">
          {candidate.consent_given_at ? formatDate(candidate.consent_given_at) : none}
        </Fact>
        <Fact label="Added">{formatDate(candidate.created_at)}</Fact>
      </dl>
    </ProfileSection>
  );
}

/** Header and contact load first; applications, CVs and the parsed summary follow on their own. */
export function CandidateProfile({ id }: { id: string }) {
  const load = React.useCallback(async () => unwrap(await getCandidate(id)), [id]);
  const { state, refetch } = useResource(load);

  if (state.phase === "loading") return <CandidateProfileSkeleton />;

  if (state.phase === "error") {
    return state.notFound ? (
      <EmptyState
        icon={UserX}
        title="Candidate not found"
        description="They may have been removed, or the link is wrong."
        action={
          <Link href="/candidates" className={buttonVariants({ variant: "outline" })}>
            Back to candidates
          </Link>
        }
      />
    ) : (
      <ErrorState
        title="Couldn't load this candidate"
        description="Something went wrong while fetching the profile."
        error={state.error}
        onRetry={refetch}
        action={
          <Link href="/candidates" className={buttonVariants({ variant: "ghost" })}>
            Back to candidates
          </Link>
        }
      />
    );
  }

  const candidate = state.data;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/candidates" className={backLink}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to candidates
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <div
            aria-hidden="true"
            className="bg-primary/10 text-primary border-border flex size-14 shrink-0 items-center justify-center rounded-full border text-lg font-semibold"
          >
            {getInitials(candidate.full_name)}
          </div>
          <div className="min-w-0">
            <h1 className="text-foreground text-large-title break-words">{candidate.full_name}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm break-all">{candidate.email}</p>
          </div>
        </div>
      </div>

      <ContactCard candidate={candidate} />
      <CandidateApplications candidateId={candidate.id} />
      <CandidateCvs candidateId={candidate.id} />
      <ParsedSummary data={candidate.parsed_data} />
    </div>
  );
}
