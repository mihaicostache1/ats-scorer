"use client";

import * as React from "react";
import {
  useFieldArray,
  useFormContext,
  type ControllerRenderProps,
  type FieldPath,
} from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TagsInput } from "@/components/ui/tags-input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { lowConfidenceFor, lowSectionConfidence, pointerFor } from "./confidence";
import { EscoCredit } from "./esco-credit";
import { LOW_CONFIDENCE_CONTROL, LowConfidenceNote, useReviewContext } from "./low-confidence";
import {
  blankEducation,
  blankExperience,
  blankLanguage,
  blankSkill,
  type ReviewFormValues,
} from "./parsed-cv-schema";

type Values = ReviewFormValues;
type Path = FieldPath<Values>;

/** What a control gets from its field. The control spreads `field`, so its ref is the one RHF focuses. */
interface ControlProps {
  field: ControllerRenderProps<Values, Path>;
  invalid: boolean;
  /** Warning styling when the parser was unsure about this value. */
  className: string | undefined;
  /** JSON pointer of the saved value, so "fields to check" can find the control. */
  pointer: string | undefined;
  /** Marks the first control of a row, so focus can be put there after adding or removing rows. */
  focusId?: string;
}

const asText = (value: unknown) => (typeof value === "string" ? value : "");

function TextControl({
  field,
  invalid,
  className,
  pointer,
  focusId,
  ...rest
}: ControlProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...field}
      value={asText(field.value)}
      error={invalid}
      className={className}
      data-pointer={pointer}
      data-focus-id={focusId}
      autoComplete="off"
      {...rest}
    />
  );
}

function AreaControl({
  field,
  invalid,
  className,
  pointer,
  focusId,
  ...rest
}: ControlProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Textarea
      {...field}
      value={asText(field.value)}
      error={invalid}
      className={className}
      data-pointer={pointer}
      data-focus-id={focusId}
      {...rest}
    />
  );
}

function TagsControl({
  field,
  invalid,
  className,
  pointer,
  ...rest
}: ControlProps & { placeholder?: string }) {
  return (
    <TagsInput
      {...field}
      value={Array.isArray(field.value) ? (field.value as string[]) : []}
      error={invalid}
      className={className}
      data-pointer={pointer}
      {...rest}
    />
  );
}

/** Label, control, low-confidence note and error message, wired together. */
function ReviewField({
  name,
  label,
  pointer,
  description,
  scope,
  render,
  className,
}: {
  name: Path;
  label: string;
  pointer?: string;
  description?: string;
  /** What the low-confidence note calls the value: "value", "date", … */
  scope?: string;
  render: (props: ControlProps) => React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  className?: string;
}) {
  const form = useFormContext<Values>();
  const { confidence } = useReviewContext();
  const low = pointer ? lowConfidenceFor(confidence, pointer) : null;

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {render({
              field,
              invalid: !!fieldState.error,
              className: low !== null ? LOW_CONFIDENCE_CONTROL : undefined,
              pointer,
            })}
          </FormControl>
          {(low !== null || description) && (
            <FormDescription>
              {low !== null && (
                <span className="block">
                  <LowConfidenceNote value={low} scope={scope} />
                </span>
              )}
              {description && <span className="block">{description}</span>}
            </FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ─── Layout pieces ────────────────────────────────────────────────────────────

const focusRing =
  "focus-visible:ring-primary/25 rounded-md outline-none focus-visible:ring-4 focus:outline-none";

function Section({
  id,
  title,
  description,
  sectionPointer,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  /** Pointer for a confidence value that covers the whole section, such as `/experiences`. */
  sectionPointer?: string;
  children: React.ReactNode;
}) {
  const { confidence } = useReviewContext();
  const low = sectionPointer ? lowSectionConfidence(confidence, sectionPointer.slice(1)) : null;

  return (
    <section aria-labelledby={`${id}-heading`} className="glass space-y-4 rounded-2xl p-6">
      <div>
        <h2
          id={`${id}-heading`}
          tabIndex={-1}
          data-pointer={sectionPointer}
          className={cn("text-foreground text-headline", focusRing)}
        >
          {title}
        </h2>
        {description && <p className="text-muted-foreground text-footnote mt-0.5">{description}</p>}
        {low !== null && (
          <p className="text-footnote mt-1">
            <LowConfidenceNote value={low} scope="section" />
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** One entry of a list: a named group, its own low-confidence note and a remove button. */
function RowFrame({
  legend,
  pointer,
  hideLegend,
  onRemove,
  removeLabel,
  children,
}: {
  legend: string;
  pointer: string | undefined;
  hideLegend?: boolean;
  onRemove: () => void;
  removeLabel: string;
  children: React.ReactNode;
}) {
  const { confidence, readOnly } = useReviewContext();
  const low = pointer ? lowConfidenceFor(confidence, pointer) : null;

  return (
    <fieldset
      tabIndex={-1}
      data-pointer={pointer}
      className={cn(
        "border-border/60 min-w-0 space-y-3 rounded-xl border p-4",
        focusRing,
        low !== null && "border-warning/60"
      )}
    >
      <legend className={cn("text-foreground px-1 text-sm font-semibold", hideLegend && "sr-only")}>
        {legend}
      </legend>
      {low !== null && (
        <p className="text-footnote">
          <LowConfidenceNote value={low} scope="entry" />
        </p>
      )}
      {children}
      {!readOnly && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onRemove}
            aria-label={removeLabel}
          >
            <Trash2 aria-hidden="true" />
            Remove
          </Button>
        </div>
      )}
    </fieldset>
  );
}

function AddButton({
  id,
  children,
  onClick,
}: {
  id: string;
  children: string;
  onClick: () => void;
}) {
  const { readOnly } = useReviewContext();
  if (readOnly) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-focus-id={id}
      onClick={onClick}
      className="self-start"
    >
      <Plus aria-hidden="true" />
      {children}
    </Button>
  );
}

/**
 * Focus after a row was added or removed: the new row's first control, the row that took the place of
 * a removed one, or the add button when the list is empty. Call the returned function in the handler;
 * the focus moves once the list has re-rendered.
 */
function useFocusAfterChange() {
  const pending = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = pending.current;
    if (!id) return;
    const target = document.querySelector<HTMLElement>(`[data-focus-id="${id}"]`);
    if (target) {
      pending.current = null;
      target.focus();
    }
  });
  return React.useCallback((id: string) => {
    pending.current = id;
  }, []);
}

/** A polite announcement for screen readers when rows come and go. */
function useAnnouncer() {
  const [message, setMessage] = React.useState("");
  const region = (
    <p role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  );
  return [setMessage, region] as const;
}

const rowPointer = (section: string, origin: number | null, field?: string) =>
  origin === null
    ? undefined
    : field
      ? pointerFor(section, origin, field)
      : pointerFor(section, origin);

// ─── Sections ─────────────────────────────────────────────────────────────────

function ContactSection() {
  return (
    <Section
      id="cv-contact"
      title="Contact"
      description="Saving a changed name, email, phone or location also updates the candidate's record."
      sectionPointer="/contact"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ReviewField
          name="contact.name"
          label="Name"
          pointer={pointerFor("contact", "name")}
          render={(p) => <TextControl {...p} />}
        />
        <ReviewField
          name="contact.email"
          label="Email"
          pointer={pointerFor("contact", "email")}
          render={(p) => <TextControl {...p} type="email" inputMode="email" />}
        />
        <ReviewField
          name="contact.phone"
          label="Phone"
          pointer={pointerFor("contact", "phone")}
          render={(p) => <TextControl {...p} type="tel" inputMode="tel" />}
        />
        <ReviewField
          name="contact.location"
          label="Location"
          pointer={pointerFor("contact", "location")}
          render={(p) => <TextControl {...p} />}
        />
      </div>
      <ReviewField
        name="contact.links"
        label="Links"
        pointer={pointerFor("contact", "links")}
        description="Profile and portfolio URLs. Press Enter or comma to add one."
        render={(p) => <TagsControl {...p} placeholder="https://…" />}
      />
    </Section>
  );
}

function ProfileSection() {
  return (
    <Section id="cv-profile" title="Profile">
      <ReviewField
        name="headline"
        label="Headline"
        pointer={pointerFor("headline")}
        description="Current or most recent job title."
        render={(p) => <TextControl {...p} />}
      />
      <ReviewField
        name="summary"
        label="Summary"
        pointer={pointerFor("summary")}
        render={(p) => <AreaControl {...p} rows={4} />}
      />
      <ReviewField
        name="experience_years"
        label="Years of experience"
        pointer={pointerFor("experience_years")}
        className="max-w-48"
        render={(p) => <TextControl {...p} inputMode="decimal" placeholder="5.5" />}
      />
    </Section>
  );
}

function SkillsSection() {
  const form = useFormContext<Values>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "skills" });
  const focusAfter = useFocusAfterChange();
  const [announce, region] = useAnnouncer();

  return (
    <Section
      id="cv-skills"
      title="Skills"
      description="The scorer compares the skill as written. The standard name is for display; leave it empty when the skill isn't recognized."
      sectionPointer="/skills"
    >
      {fields.length === 0 && (
        <p role="status" className="text-muted-foreground text-sm">
          No skills were found.
        </p>
      )}
      {fields.map((row, index) => {
        const name = `Skill ${index + 1}`;
        return (
          <RowFrame
            key={row.id}
            legend={name}
            hideLegend
            pointer={rowPointer("skills", row.originIndex)}
            removeLabel={`Remove ${name}${row.raw ? `: ${row.raw}` : ""}`}
            onRemove={() => {
              const remaining = fields.length - 1;
              focusAfter(
                remaining === 0 ? "skills-add" : `skills-${Math.min(index, remaining - 1)}`
              );
              remove(index);
              announce(`${name} removed.`);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewField
                name={`skills.${index}.raw` as const}
                label={`${name} as written`}
                pointer={rowPointer("skills", row.originIndex, "raw")}
                render={(p) => <TextControl {...p} focusId={`skills-${index}`} />}
              />
              <ReviewField
                name={`skills.${index}.normalized` as const}
                label={`${name} standard name`}
                pointer={rowPointer("skills", row.originIndex, "normalized")}
                scope="match"
                render={(p) => <TextControl {...p} />}
              />
            </div>
          </RowFrame>
        );
      })}
      {region}
      <AddButton
        id="skills-add"
        onClick={() => {
          focusAfter(`skills-${fields.length}`);
          append(blankSkill());
          announce("Skill added.");
        }}
      >
        Add skill
      </AddButton>
      <EscoCredit />
    </Section>
  );
}

function ExperienceSection() {
  const form = useFormContext<Values>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "experiences" });
  const focusAfter = useFocusAfterChange();
  const [announce, region] = useAnnouncer();

  return (
    <Section
      id="cv-experience"
      title="Experience"
      description="Most recent first. Dates are year and month."
      sectionPointer="/experiences"
    >
      {fields.length === 0 && (
        <p role="status" className="text-muted-foreground text-sm">
          No positions were found.
        </p>
      )}
      {fields.map((row, index) => {
        const name = `Experience ${index + 1}`;
        const at = (field: string) => rowPointer("experiences", row.originIndex, field);
        return (
          <RowFrame
            key={row.id}
            legend={name}
            pointer={rowPointer("experiences", row.originIndex)}
            removeLabel={`Remove ${name}${row.title ? `: ${row.title}` : ""}`}
            onRemove={() => {
              const remaining = fields.length - 1;
              focusAfter(
                remaining === 0
                  ? "experiences-add"
                  : `experiences-${Math.min(index, remaining - 1)}`
              );
              remove(index);
              announce(`${name} removed.`);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewField
                name={`experiences.${index}.title` as const}
                label="Job title"
                pointer={at("title")}
                render={(p) => <TextControl {...p} focusId={`experiences-${index}`} />}
              />
              <ReviewField
                name={`experiences.${index}.company` as const}
                label="Company"
                pointer={at("company")}
                render={(p) => <TextControl {...p} />}
              />
              <ReviewField
                name={`experiences.${index}.start` as const}
                label="Start (YYYY-MM)"
                pointer={at("start")}
                scope="date"
                render={(p) => <TextControl {...p} type="month" placeholder="2022-05" />}
              />
              <ReviewField
                name={`experiences.${index}.end` as const}
                label="End (YYYY-MM)"
                pointer={at("end")}
                scope="date"
                description="Leave empty if unknown or still current."
                render={(p) => <TextControl {...p} type="month" placeholder="2024-01" />}
              />
            </div>
            <FormField
              control={form.control}
              name={`experiences.${index}.is_current` as const}
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <input
                      type="checkbox"
                      ref={field.ref}
                      name={field.name}
                      checked={field.value === true}
                      onChange={(event) => field.onChange(event.target.checked)}
                      onBlur={field.onBlur}
                      data-pointer={at("is_current")}
                      className="accent-primary focus-visible:ring-primary/25 size-5 rounded outline-none focus-visible:ring-4 disabled:opacity-50"
                    />
                  </FormControl>
                  <FormLabel className="leading-snug">Current position</FormLabel>
                </FormItem>
              )}
            />
            <ReviewField
              name={`experiences.${index}.summary` as const}
              label="Summary"
              pointer={at("summary")}
              render={(p) => <AreaControl {...p} rows={2} />}
            />
            <ReviewField
              name={`experiences.${index}.bullets` as const}
              label="Bullets"
              pointer={at("bullets")}
              description="One per line."
              render={(p) => <AreaControl {...p} rows={4} />}
            />
          </RowFrame>
        );
      })}
      {region}
      <AddButton
        id="experiences-add"
        onClick={() => {
          focusAfter(`experiences-${fields.length}`);
          append(blankExperience());
          announce("Experience added.");
        }}
      >
        Add experience
      </AddButton>
    </Section>
  );
}

function EducationSection() {
  const form = useFormContext<Values>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "education" });
  const focusAfter = useFocusAfterChange();
  const [announce, region] = useAnnouncer();

  return (
    <Section id="cv-education" title="Education" sectionPointer="/education">
      {fields.length === 0 && (
        <p role="status" className="text-muted-foreground text-sm">
          No education was found.
        </p>
      )}
      {fields.map((row, index) => {
        const name = `Education ${index + 1}`;
        const at = (field: string) => rowPointer("education", row.originIndex, field);
        return (
          <RowFrame
            key={row.id}
            legend={name}
            pointer={rowPointer("education", row.originIndex)}
            removeLabel={`Remove ${name}${row.degree ? `: ${row.degree}` : ""}`}
            onRemove={() => {
              const remaining = fields.length - 1;
              focusAfter(
                remaining === 0 ? "education-add" : `education-${Math.min(index, remaining - 1)}`
              );
              remove(index);
              announce(`${name} removed.`);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewField
                name={`education.${index}.degree` as const}
                label="Degree"
                pointer={at("degree")}
                render={(p) => <TextControl {...p} focusId={`education-${index}`} />}
              />
              <ReviewField
                name={`education.${index}.institution` as const}
                label="Institution"
                pointer={at("institution")}
                render={(p) => <TextControl {...p} />}
              />
              <ReviewField
                name={`education.${index}.grad_year` as const}
                label="Graduation year"
                pointer={at("grad_year")}
                className="max-w-48"
                render={(p) => <TextControl {...p} inputMode="numeric" placeholder="2020" />}
              />
            </div>
          </RowFrame>
        );
      })}
      {region}
      <AddButton
        id="education-add"
        onClick={() => {
          focusAfter(`education-${fields.length}`);
          append(blankEducation());
          announce("Education added.");
        }}
      >
        Add education
      </AddButton>
    </Section>
  );
}

function LanguagesSection() {
  const form = useFormContext<Values>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "languages" });
  const focusAfter = useFocusAfterChange();
  const [announce, region] = useAnnouncer();

  return (
    <Section id="cv-languages" title="Languages" sectionPointer="/languages">
      {fields.length === 0 && (
        <p role="status" className="text-muted-foreground text-sm">
          No languages were found.
        </p>
      )}
      {fields.map((row, index) => {
        const name = `Language ${index + 1}`;
        return (
          <RowFrame
            key={row.id}
            legend={name}
            hideLegend
            pointer={rowPointer("languages", row.originIndex)}
            removeLabel={`Remove ${name}${row.language ? `: ${row.language}` : ""}`}
            onRemove={() => {
              const remaining = fields.length - 1;
              focusAfter(
                remaining === 0 ? "languages-add" : `languages-${Math.min(index, remaining - 1)}`
              );
              remove(index);
              announce(`${name} removed.`);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewField
                name={`languages.${index}.language` as const}
                label={`${name}`}
                pointer={rowPointer("languages", row.originIndex, "language")}
                render={(p) => <TextControl {...p} focusId={`languages-${index}`} />}
              />
              <ReviewField
                name={`languages.${index}.level` as const}
                label={`${name} level`}
                pointer={rowPointer("languages", row.originIndex, "level")}
                description="As written: B2, native, fluent."
                render={(p) => <TextControl {...p} />}
              />
            </div>
          </RowFrame>
        );
      })}
      {region}
      <AddButton
        id="languages-add"
        onClick={() => {
          focusAfter(`languages-${fields.length}`);
          append(blankLanguage());
          announce("Language added.");
        }}
      >
        Add language
      </AddButton>
    </Section>
  );
}

function CertificationsSection() {
  return (
    <Section id="cv-certifications" title="Certifications" sectionPointer="/certifications">
      <ReviewField
        name="certifications"
        label="Certifications"
        pointer={pointerFor("certifications")}
        description="Press Enter or comma to add one. Backspace removes the last."
        render={(p) => <TagsControl {...p} placeholder="AWS Certified Developer" />}
      />
    </Section>
  );
}

/** The editable fields of a parsed CV, one card per part of the L-10 profile. */
export function ReviewForm() {
  return (
    <div className="space-y-6">
      <ContactSection />
      <ProfileSection />
      <SkillsSection />
      <ExperienceSection />
      <EducationSection />
      <LanguagesSection />
      <CertificationsSection />
    </div>
  );
}
