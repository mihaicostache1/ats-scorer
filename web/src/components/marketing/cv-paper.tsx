import * as React from "react";
import { cn } from "@/lib/utils";
import { DEMO_CV } from "./demo-data";

/**
 * An invented CV drawn as a sheet of paper. Optional highlights mark the passages the extracted
 * fields came from, the way a reviewer traces a value back to its source.
 */
export function CvPaper({
  className,
  highlight = true,
}: {
  className?: string;
  highlight?: boolean;
}) {
  const mark = (children: React.ReactNode) =>
    highlight ? (
      <mark className="rounded-[2px] bg-[#2F55E4]/12 px-0.5 text-inherit shadow-[inset_0_-1.5px_0_#2F55E4]">
        {children}
      </mark>
    ) : (
      children
    );

  return (
    <div
      aria-label="Example CV page (invented)"
      role="img"
      className={cn(
        "relative bg-white text-[#1B2338] shadow-[0_1px_2px_rgb(10_16_34/0.08),0_20px_50px_-20px_rgb(10_16_34/0.45)]",
        "aspect-[1/1.32] w-full overflow-hidden rounded-[3px] px-[7%] py-[8%] text-[10px] leading-[1.55] sm:text-[11px]",
        className
      )}
    >
      <p className="text-[1.9em] leading-tight font-semibold tracking-[-0.02em] text-[#0A1022]">
        {mark(DEMO_CV.name)}
      </p>
      <p className="mt-0.5 text-[1.1em] text-[#566079]">{mark(DEMO_CV.headline)}</p>
      <p className="mt-1 text-[#566079]">{DEMO_CV.contact}</p>

      <div className="mt-[6%] border-t border-[#DFE3EB] pt-[4%]">
        <p className="font-semibold tracking-[0.08em] text-[#0A1022] uppercase">Profile</p>
        <p className="mt-1">{DEMO_CV.summary}</p>
      </div>

      <div className="mt-[5%]">
        <p className="font-semibold tracking-[0.08em] text-[#0A1022] uppercase">Experience</p>
        {DEMO_CV.experience.map((job, i) => (
          <div key={job.org} className="mt-2">
            <p className="flex justify-between gap-2">
              <span className="font-semibold text-[#0A1022]">
                {i === 0 ? mark(job.role) : job.role} · {job.org}
              </span>
              <span className="shrink-0 text-[#566079]">
                {i === 0 ? mark(job.period) : job.period}
              </span>
            </p>
            <ul className="mt-0.5 list-disc pl-4">
              {job.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-[5%]">
        <p className="font-semibold tracking-[0.08em] text-[#0A1022] uppercase">Skills</p>
        <p className="mt-1">
          {DEMO_CV.skills.map((skill, i) => (
            <React.Fragment key={skill}>
              {i > 0 && " · "}
              {i < 5 ? mark(skill) : skill}
            </React.Fragment>
          ))}
        </p>
      </div>

      <div className="mt-[5%]">
        <p className="font-semibold tracking-[0.08em] text-[#0A1022] uppercase">Education</p>
        <p className="mt-1">{DEMO_CV.education}</p>
      </div>
    </div>
  );
}
