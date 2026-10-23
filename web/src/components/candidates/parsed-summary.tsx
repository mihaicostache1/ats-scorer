import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { readParsedSummary } from "./parsed-cv";
import { ProfileSection, SectionEmpty } from "./profile-section";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * What the parser read from the CV, read-only. `parsed_data` is `{}` until a CV has been parsed;
 * corrections belong to a later feature.
 */
export function ParsedSummary({ data }: { data: unknown }) {
  const parsed = readParsedSummary(data);
  const isEmpty =
    typeof data === "object" && data !== null && Object.keys(data as object).length === 0;

  return (
    <ProfileSection
      id="parsed"
      title="Parsed summary"
      description="Read-only. This is what was extracted from the CV."
    >
      {!parsed ? (
        <SectionEmpty>
          {isEmpty
            ? "Not parsed yet. A summary appears here once a CV has been processed."
            : "Parsed data isn't available in a format we can display."}
        </SectionEmpty>
      ) : (
        <div className="space-y-5">
          {(parsed.headline || parsed.summary || parsed.experienceYears !== null) && (
            <div>
              {parsed.headline && (
                <p className="text-foreground text-sm font-semibold">{parsed.headline}</p>
              )}
              {parsed.experienceYears !== null && (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {parsed.experienceYears} {parsed.experienceYears === 1 ? "year" : "years"} of
                  experience
                </p>
              )}
              {parsed.summary && (
                <p className="text-foreground/90 mt-2 text-sm leading-relaxed">{parsed.summary}</p>
              )}
            </div>
          )}

          {parsed.skills.length > 0 && (
            <Group title="Skills">
              <ul className="flex flex-wrap gap-1.5">
                {parsed.skills.map((skill) => (
                  <li key={skill}>
                    <Badge variant="secondary">{skill}</Badge>
                  </li>
                ))}
              </ul>
            </Group>
          )}

          {parsed.experiences.length > 0 && (
            <Group title="Experience">
              <ul className="space-y-2">
                {parsed.experiences.map((e, i) => (
                  <li key={`${e.title}-${i}`} className="text-sm">
                    <span className="text-foreground font-medium">{e.title}</span>
                    {e.company && <span className="text-muted-foreground"> · {e.company}</span>}
                    {e.period && (
                      <span className="text-muted-foreground block text-xs">{e.period}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Group>
          )}

          {parsed.education.length > 0 && (
            <Group title="Education">
              <ul className="space-y-2">
                {parsed.education.map((e, i) => (
                  <li key={`${e.degree}-${i}`} className="text-sm">
                    <span className="text-foreground font-medium">{e.degree}</span>
                    {e.institution && (
                      <span className="text-muted-foreground"> · {e.institution}</span>
                    )}
                    {e.gradYear !== null && (
                      <span className="text-muted-foreground block text-xs">{e.gradYear}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Group>
          )}

          {parsed.languages.length > 0 && (
            <Group title="Languages">
              <ul className="flex flex-wrap gap-1.5">
                {parsed.languages.map((l) => (
                  <li key={l.language}>
                    <Badge variant="outline">
                      {l.language}
                      {l.level && ` · ${l.level}`}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Group>
          )}

          {parsed.certifications.length > 0 && (
            <Group title="Certifications">
              <ul className="list-inside list-disc text-sm">
                {parsed.certifications.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Group>
          )}
        </div>
      )}
    </ProfileSection>
  );
}
