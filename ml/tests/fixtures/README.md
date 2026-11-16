# Test fixtures

- `esco_skills_sample.csv`: 24 concepts copied from ESCO v1.2.1 `skills_en.csv`, with fewer columns and trimmed label lists. They include the concepts behind the failures documented in L-6 (`JSSS`, `ML (computer programming)`, `viticulture`, `dock operations`, `work with playwrights`). The `SQL` row appears twice, as in the real download.
- `esco_skills_sample_ro.csv`: a second-language file for testing `load_esco` with several files. The Romanian labels were **written for the test**, not copied from ESCO. The last row is a made-up concept that appears only in this file.

- `jobs/J01.json` to `J20.json`: the 20 synthetic job descriptions from `ml/synthetic/generate.py` (seed 42), copied because the generator's output folder is git-ignored. Each has the expected skills, minimum experience and seniority. Regenerating with another seed or generator version changes them.
- `job_descriptions/*.txt`: hand-written job descriptions in messy real-world styles, for `test_job_parser.py`. The expected results are in the test. Invented, with no real company.

ESCO data: (c) European Union, <https://esco.ec.europa.eu>, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: the columns and label lists are trimmed.
