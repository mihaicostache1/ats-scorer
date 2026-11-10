/**
 * ESCO credit. The review screen shows ESCO skill names (`skills[].normalized`), and CC BY 4.0
 * requires the credit wherever they reach a user (docs/ml/skill-normalization.md). The wording is
 * `ESCO_ATTRIBUTION` in ml/ats_scoring/esco.py.
 */
export function EscoCredit() {
  return (
    <p className="text-muted-foreground text-footnote">
      Skill names from{" "}
      <a
        href="https://esco.ec.europa.eu"
        target="_blank"
        rel="noopener noreferrer"
        className="focus-visible:ring-primary/25 rounded underline underline-offset-2 focus-visible:ring-4 focus-visible:outline-none"
      >
        ESCO (European Skills, Competences, Qualifications and Occupations)
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      , © European Union, licensed under{" "}
      <a
        href="https://creativecommons.org/licenses/by/4.0/"
        target="_blank"
        rel="noopener noreferrer"
        className="focus-visible:ring-primary/25 rounded underline underline-offset-2 focus-visible:ring-4 focus-visible:outline-none"
      >
        CC BY 4.0<span className="sr-only"> (opens in a new tab)</span>
      </a>
      . Labels are cleaned and indexed for matching; the classification itself is not changed.
    </p>
  );
}
