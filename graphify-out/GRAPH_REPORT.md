# Graph Report - ats-scorer  (2026-11-12)

## Corpus Check
- 404 files · ~197,867 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 23 file(s) not represented in the graph (top: (none) 13, .csv 4, .example 1)

## Summary
- 2896 nodes · 7894 edges · 153 communities (127 shown, 26 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 587 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Parser Errors & Extraction
- Auth Endpoints
- ORM Models
- Job UI & Dev Components
- Synthetic Data Generator
- CV Confidence Display
- Frontend API Client & CV Rows
- Jobs & Candidates Pages
- Security (Argon2/JWT)
- Skill Normalizer
- Data Tables & Auth Layout
- Applications Endpoints
- CV Parser
- Embedding Spike Common
- Web Dev Tooling Config
- CV Documents Endpoints
- Jobs Endpoints
- CV Document Tests
- CV Extraction Worker
- Application Tests
- Parsed CV Schema (TS)
- Job Create/Edit UI
- Model Comparison Benchmark
- Candidate Profile Page
- Scorer Evaluation Metrics
- OpenAPI Schema & List Tests
- Labeling Tool
- Parsed CV Pydantic Models
- Audit & Me Endpoints
- Candidate Endpoints & Schemas
- CV Review & Auth Guards
- Test Fixtures
- ESCO Index
- Candidate-Job Scoring
- Web Dependencies
- Candidate CRUD
- Candidate Tests
- Job Tests
- Dev Routes & Labeling Data
- Privacy & Scope Docs
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 140
- Community 144
- Community 146
- Community 147
- Community 148
- Community 151
- Community 152

## God Nodes (most connected - your core abstractions)
1. `User` - 120 edges
2. `react` - 67 edges
3. `SkillNormalizer` - 57 edges
4. `Button()` - 46 edges
5. `score()` - 42 edges
6. `lucide-react` - 42 edges
7. `Candidate` - 41 edges
8. `vitest` - 39 edges
9. `CvDocument` - 38 edges
10. `extract_text()` - 36 edges

## Surprising Connections (you probably didn't know these)
- `Parser accuracy benchmark on 100 synthetic CVs` --semantically_similar_to--> `Evaluation harness (L-9)`  [INFERRED] [semantically similar]
  ats-scorer/docs/ml/cv-structured-extraction.md → ats-scorer/docs/ml/evaluation.md
- `ml/ package (ats_scoring, synthetic, embedding_spike)` --conceptually_related_to--> `Parsed-CV schema v1.0 (L-10)`  [INFERRED]
  ats-scorer/CLAUDE.md → ats-scorer/docs/ml/parsed-cv-schema.md
- `_get_application_or_404()` --uses--> `Application`  [INFERRED]
  ats-scorer/api/app/api/v1/endpoints/applications.py → ats-scorer/api/app/models/application.py
- `list_applications()` --uses--> `Application`  [INFERRED]
  ats-scorer/api/app/api/v1/endpoints/applications.py → ats-scorer/api/app/models/application.py
- `list_applications()` --uses--> `User`  [INFERRED]
  ats-scorer/api/app/api/v1/endpoints/applications.py → ats-scorer/api/app/models/user.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CV ingestion pipeline (upload, extract, parse, review)** — ats_scorer_docs_api_spec_cv_upload_processing, ats_scorer_readme_arq_worker, docs_ml_cv_structured_extraction_cv_parser, docs_ml_skill_normalization_skillnormalizer, docs_ml_cv_structured_extraction_review_policy [EXTRACTED 0.95]
- **Candidate data purged by hard delete** — ats_scorer_docs_erd_candidates, ats_scorer_docs_erd_applications, ats_scorer_docs_erd_scores, ats_scorer_docs_erd_cv_documents, ats_scorer_docs_erd_pgvector_hnsw, ats_scorer_docs_erd_consent_records [EXTRACTED 0.95]
- **Parsed-CV schema artifacts kept in sync** — docs_ml_parsed_cv_schema_json_schema, docs_ml_parsed_cv_schema_parsedcv_model, docs_ml_parsed_cv_schema_versioning, ats_scorer_github_pull_request_template_parsed_cv_schema_checklist [EXTRACTED 0.95]
- **ESCO matching experiment and results** — ats_scorer_ml_embedding_spike_esco_match, ats_scorer_ml_embedding_spike_results_esco_matching_e5_small, ats_scorer_ml_embedding_spike_results_esco_matching_minilm [EXTRACTED 1.00]
- **Human rating workflow for evaluation** — ats_scorer_ml_evaluation_jobs, ats_scorer_ml_evaluation_ratings_readme, ats_scorer_web_readme_labeling_tool, ats_scorer_ml_readme_evaluate [INFERRED 0.85]
- **Stories enforcing humans-decide principle** — ats_scorer_docs_privacy_ethics_checklist_humans_decide, ats_scorer_docs_scope_us_08_ranked_list, ats_scorer_docs_scope_us_09_understand_score, ats_scorer_docs_scope_us_10_stage_moves [INFERRED 0.85]

## Communities (153 total, 26 thin omitted)

### Community 0 - "Parser Errors & Extraction"
Cohesion: 0.07
Nodes (38): ParserUnavailableError, QueueUnavailableError, ExtractionResult, LocalDiskStorage, WorkerSettings, RecordingJobQueue, test_local_disk_storage(), _row() (+30 more)

### Community 1 - "Auth Endpoints"
Cohesion: 0.05
Nodes (21): login(), logout(), refresh(), register(), health_check(), Settings, create_access_token(), create_refresh_token() (+13 more)

### Community 2 - "ORM Models"
Cohesion: 0.09
Nodes (18): Base, Application, ApplicationStageHistory, AuditEvent, Candidate, ConsentRecord, Job, Organization (+10 more)

### Community 3 - "Job UI & Dev Components"
Cohesion: 0.09
Nodes (58): archiveJob(), updateJobStatus(), candidateFormSchema, CandidateFormValues, DevComponentsPage(), sampleCandidates, SampleJobCandidate, HomePage() (+50 more)

### Community 4 - "Synthetic Data Generator"
Cohesion: 0.07
Nodes (35): build_cv(), build_job(), build_rating_pairs(), _bullets(), _clear(), _contact(), _date_range(), _doc_args() (+27 more)

### Community 5 - "CV Confidence Display"
Cohesion: 0.08
Nodes (60): confidenceFor(), ConfidenceMap, describePointer(), FIELD_LABELS, formatConfidence(), LISTS, LOW_CONFIDENCE_THRESHOLD, LowConfidenceField (+52 more)

### Community 6 - "Frontend API Client & CV Rows"
Cohesion: 0.06
Nodes (49): downloadCandidateCV(), listCandidates(), listJobs(), retryCandidateCvExtraction(), Can(), CvRow(), DownloadButton(), POLL_MESSAGES (+41 more)

### Community 7 - "Jobs & Candidates Pages"
Cohesion: 0.11
Nodes (38): CandidatesPage(), EditJobPage(), JobDetailPage(), JobsPage(), dynamic, LabelingPage(), CandidateAccess(), CandidatesList() (+30 more)

### Community 8 - "Security (Argon2/JWT)"
Cohesion: 0.07
Nodes (18): _create_token(), hash_password(), verify_password(), seed_default_stages(), seed_db(), _make_expired_access_token(), _make_expired_refresh_token(), test_login_happy_path() (+10 more)

### Community 9 - "Skill Normalizer"
Cohesion: 0.10
Nodes (33): SkillNormalizer, FakeEmbedder, one(), _real_esco_path(), skill_strings(), test_1000_skills_against_full_esco_take_a_few_seconds(), test_1000_skills_with_the_sample_are_fast(), test_a_second_language_file_matches_and_shows_the_main_language() (+25 more)

### Community 10 - "Data Tables & Auth Layout"
Cohesion: 0.11
Nodes (24): AuthLayout(), CandidatesTable(), COLUMNS, DataTableProps, SortDirection, EMPLOYMENT_TYPES, STATUS_BADGE, COLUMNS (+16 more)

### Community 11 - "Applications Endpoints"
Cohesion: 0.09
Nodes (15): create_application(), get_application(), get_application_history(), _get_application_or_404(), list_applications(), move_application_stage(), _not_found(), ApplicationResponse (+7 more)

### Community 12 - "CV Parser"
Cohesion: 0.10
Nodes (22): CvParser, _date_value(), detect_sections(), _experience_years(), get_cv_parser(), needs_review(), parse_cv_text(), _phone_values() (+14 more)

### Community 13 - "Embedding Spike Common"
Cohesion: 0.10
Nodes (18): encode(), load_model(), ModelSpec, _cell(), clean(), dataset_vocabulary(), Esco, esco_embeddings() (+10 more)

### Community 14 - "Web Dev Tooling Config"
Cohesion: 0.05
Nodes (39): eslintConfig, devDependencies, eslint@^9, eslint-config-next@16.3.8, eslint-config-prettier@^10.1.8, eslint-plugin-prettier@^5.5.6, jsdom@^27.4.0, openapi-typescript@^7.13.0 (+31 more)

### Community 15 - "CV Documents Endpoints"
Cohesion: 0.09
Nodes (11): download_cv(), _enqueue_extraction(), _get_candidate_or_404(), get_cv_document(), _get_document_or_404(), _is_pdf(), list_cv_documents(), retry_cv_extraction() (+3 more)

### Community 16 - "Jobs Endpoints"
Cohesion: 0.11
Nodes (15): archive_job(), create_job(), get_job(), _get_job_or_404(), get_job_stages_endpoint(), list_jobs(), _set_status(), update_job() (+7 more)

### Community 17 - "CV Document Tests"
Cohesion: 0.16
Nodes (17): CvDocument, _create_candidate(), _cv_events(), _padded_pdf(), _stored_files(), test_cv_endpoints_require_authentication(), test_deleting_a_candidate_removes_their_cv_files(), test_download_when_file_is_missing() (+9 more)

### Community 18 - "CV Extraction Worker"
Cohesion: 0.12
Nodes (13): CvStatus, _claim(), _ClaimedDocument, _extract(), extract_cv_text(), _finish(), _mark_extracted(), _mark_failed() (+5 more)

### Community 19 - "Application Tests"
Cohesion: 0.17
Nodes (15): _application_events(), _apply(), _create_candidate(), _create_job(), _stages(), test_applications_require_authentication(), test_create_application(), test_create_application_rejections() (+7 more)

### Community 20 - "Parsed CV Schema (TS)"
Cohesion: 0.11
Nodes (32): buildRows(), bulletsOf(), checkPatch(), clean(), CONTACT_LIMITS, deepEqual(), educationRow(), experienceRow() (+24 more)

### Community 21 - "Job Create/Edit UI"
Cohesion: 0.11
Nodes (26): createJob(), updateJob(), NewJobPage(), job(), open, { push, getJob, updateJobStatus, archiveJob, toast, session }, JobForm(), { push, createJob, updateJob, toast, session } (+18 more)

### Community 22 - "Model Comparison Benchmark"
Cohesion: 0.11
Nodes (16): build_dataset(), cv_text(), job_text(), benchmark(), environment(), family_precision(), human_ndcg(), load_ratings() (+8 more)

### Community 23 - "Candidate Profile Page"
Cohesion: 0.13
Nodes (25): getJob(), getJobStages(), listApplications(), CandidateProfilePage(), ApplicationRow, ApplicationStatus, CandidateApplications(), loadApplicationRows() (+17 more)

### Community 24 - "Scorer Evaluation Metrics"
Cohesion: 0.13
Nodes (21): evaluate(), load_scorer(), ndcg_at_k(), random_ndcg_at_k(), spearman(), test_baseline_ranks_a_clear_case_correctly(), test_default_scorer_is_the_baseline(), test_missing_ratings_are_reported() (+13 more)

### Community 25 - "OpenAPI Schema & List Tests"
Cohesion: 0.09
Nodes (25): components, $defs, operations, webhooks, { push, replace, listJobs, url }, ApplicationResponse, mockApplications, mockScores (+17 more)

### Community 26 - "Labeling Tool"
Cohesion: 0.20
Nodes (27): describe(), LabelingTool(), showing(), StatusChip(), ProgressHeader(), RatingBar(), csvFileName(), exportRatingsCsv() (+19 more)

### Community 27 - "Parsed CV Pydantic Models"
Cohesion: 0.12
Nodes (17): Contact, Education, Experience, Language, _Model, Skill, fixture_names(), load_parsed_cv_example() (+9 more)

### Community 28 - "Audit & Me Endpoints"
Cohesion: 0.09
Nodes (10): list_audit_events(), me(), me(), get_current_admin(), get_current_recruiter_or_admin(), get_current_user(), decode_access_token(), User (+2 more)

### Community 29 - "Candidate Endpoints & Schemas"
Cohesion: 0.12
Nodes (8): list_candidates(), CandidateResponse, CandidateSortField, CreateCandidateRequest, PaginatedCandidatesResponse, PaginatedJobsResponse, SortOrder, PaginationMeta

### Community 30 - "CV Review & Auth Guards"
Cohesion: 0.11
Nodes (22): CvReviewPage(), AppLayout(), safeNextPath(), useRedirectWhenAuthenticated(), RequireAuth(), CvReviewAccess(), AppHeader(), AppShell() (+14 more)

### Community 31 - "Test Fixtures"
Cohesion: 0.09
Nodes (13): async_client(), committed_db(), create_user(), _create(), cv_storage(), db_engine(), db_session(), job_queue() (+5 more)

### Community 32 - "ESCO Index"
Cohesion: 0.12
Nodes (10): _add_other_labels(), EscoConcept, EscoIndex, EscoLabel, _split_labels(), strip_qualifier(), clean_skill(), relabelled() (+2 more)

### Community 33 - "Candidate-Job Scoring"
Cohesion: 0.12
Nodes (18): NothingToScoreError, score(), test_better_matches_score_higher(), test_empty_candidate_is_an_error_not_a_zero(), test_empty_job_is_an_error(), test_explanations_use_the_singular_for_one_skill(), test_identical_pair_scores_100(), test_identity_details_do_not_change_the_score() (+10 more)

### Community 34 - "Web Dependencies"
Cohesion: 0.09
Nodes (27): dependencies, @base-ui/react@^1.8.0, class-variance-authority@^0.7.1, cn@^0.4.0, @hookform/resolvers@^5.9.1, lucide-react@^1.52.0, next@16.3.8, openapi-fetch@^0.17.0 (+19 more)

### Community 35 - "Candidate CRUD"
Cohesion: 0.11
Nodes (7): create_candidate(), delete_candidate(), get_candidate(), _get_candidate_or_404(), update_candidate(), update_parsed_profile(), log_audit_event()

### Community 36 - "Candidate Tests"
Cohesion: 0.17
Nodes (11): _candidate_events(), _create_candidate(), test_candidate_roles(), test_candidates_require_authentication(), test_create_candidate(), test_create_candidate_validation_and_duplicates(), test_create_candidate_with_consent_and_minimal_fields(), test_delete_candidate() (+3 more)

### Community 37 - "Job Tests"
Cohesion: 0.17
Nodes (11): _create_job(), _job_events(), test_archive_job(), test_create_job(), test_create_job_validation(), test_get_job_not_found(), test_jobs_require_authentication(), test_list_jobs_filter_search_sort_pagination() (+3 more)

### Community 38 - "Dev Routes & Labeling Data"
Cohesion: 0.14
Nodes (18): files(), MANIFESTS, NEEDLES, NEXT_DIR, SHIPPED, DEFAULT_EVAL_DIR, exists(), isNullableString() (+10 more)

### Community 39 - "Privacy & Scope Docs"
Cohesion: 0.10
Nodes (24): Privacy and ethics checklist, Fairness and accountability checks, Target-market regulations (EU AI Act, GDPR, NYC LL144), Retention and deletion rules, ATS project scope, personas and user stories, Persona Daniel (hiring manager, viewer), Persona Maya (recruiter), Persona Priya (admin) (+16 more)

### Community 40 - "Community 40"
Cohesion: 0.13
Nodes (15): listCandidateCvDocuments(), CandidateCvs(), changedMeaningfully(), {
  listCandidateCvDocuments,
  getCandidateCvDocument,
  retryCandidateCvExtraction,
  downloadCandidateCV,
  uploadCandidateCvWithProgress,
  toast,
  session,
}, CvDocument, CvStatus, describeCvFile(), describeCvStatus() (+7 more)

### Community 41 - "Community 41"
Cohesion: 0.10
Nodes (8): upgrade(), upgrade(), upgrade(), downgrade(), upgrade(), upgrade(), upgrade(), upgrade()

### Community 42 - "Community 42"
Cohesion: 0.14
Nodes (11): _explanations(), _percent(), _skill_count(), candidate_text(), job_text(), _join(), _mappings(), skill_texts() (+3 more)

### Community 43 - "Community 43"
Cohesion: 0.08
Nodes (23): fromService, generateValue, key, sync, value, name, property, type (+15 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (18): apiClient, pending, refreshMiddleware, refreshSession(), UnauthorizedListener, unauthorizedListeners, paths, CvDocumentResponse (+10 more)

### Community 45 - "Community 45"
Cohesion: 0.13
Nodes (7): get_db(), test_org_a_cannot_access_org_b_data_on_existing_endpoints(), test_org_b_cannot_read_or_write_org_a_applications_and_stages(), test_org_b_cannot_read_or_write_org_a_candidates(), test_org_b_cannot_read_or_write_org_a_cv_documents(), test_org_b_cannot_read_or_write_org_a_jobs(), test_viewer_cannot_write_and_rbac_dependencies()

### Community 46 - "Community 46"
Cohesion: 0.14
Nodes (8): evaluate(), main(), skill_metrics(), test_empty_dataset_does_not_produce_a_passing_report(), test_metrics_penalize_extra_and_missing_skills(), _mean(), load_candidates(), main()

### Community 47 - "Community 47"
Cohesion: 0.13
Nodes (10): match_skills(), normalize_skill(), SkillMatch, _unique(), test_c_family_languages_stay_distinct(), test_duplicates_and_case_are_ignored(), test_job_without_skills_has_no_overlap(), test_normalize_skill() (+2 more)

### Community 48 - "Community 48"
Cohesion: 0.14
Nodes (10): _fixture(), _ocr_missing(), _scanned(), test_ocr_result_is_used_only_when_it_finds_more(), test_only_pages_with_little_text_are_sent_to_ocr(), test_password_protected_pdf_is_reported(), test_real_tesseract_reads_a_scanned_l5_cv(), test_scanned_page_falls_back_to_ocr() (+2 more)

### Community 49 - "Community 49"
Cohesion: 0.13
Nodes (8): _fmt(), format_report(), load_ratings(), load_records(), main(), rater_agreement(), save(), _total()

### Community 50 - "Community 50"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 51 - "Community 51"
Cohesion: 0.11
Nodes (17): ParsedProfilePatch, CandidateResponse, candidatesStore, changedPointers(), CONTACT_COLUMNS, CvDocumentResponse, cvStore, isJson() (+9 more)

### Community 52 - "Community 52"
Cohesion: 0.15
Nodes (8): ParsedProfileResponse, UpdateCandidateRequest, _changes(), correct_parsed_profile(), _leaves(), _merge(), _resolve(), _validation_error()

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (13): _events(), profile(), test_admin_can_review_and_each_save_records_current_reviewer(), test_client_cannot_assign_confidence_or_authorship(), test_contact_email_conflict_rolls_back_all_changes(), test_correct_profile_records_reviewer_preserves_snapshot_and_audits(), test_field_errors_do_not_mutate_profile_or_audit(), test_invalid_existing_profile_and_unknown_ids() (+5 more)

### Community 54 - "Community 54"
Cohesion: 0.16
Nodes (15): getCandidateCvDocument(), isTerminalStatus(), nextDelay(), POLL_BUDGET_MS, POLL_FACTOR, POLL_INITIAL_MS, POLL_MAX_FAILURES, POLL_MAX_MS (+7 more)

### Community 55 - "Community 55"
Cohesion: 0.15
Nodes (5): ArqJobQueue, get_job_queue(), redis_settings(), on_shutdown(), on_startup()

### Community 56 - "Community 56"
Cohesion: 0.18
Nodes (4): Embedder, _label_cache_key(), _load_label_cache(), _save_label_cache()

### Community 57 - "Community 57"
Cohesion: 0.13
Nodes (10): data, { downloadTextFile, toast }, data, LabelingData, { session }, css, files(), SRC (+2 more)

### Community 58 - "Community 58"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 59 - "Community 59"
Cohesion: 0.20
Nodes (12): _load(), load_parsed_cv_fixture(), load_parsed_cv_schema(), error_texts(), test_a_skill_that_is_not_recognized_keeps_its_raw_text(), test_invalid_fixture_fails_the_json_schema(), test_invalid_fixture_fails_the_pydantic_model(), test_model_output_passes_the_json_schema() (+4 more)

### Community 60 - "Community 60"
Cohesion: 0.14
Nodes (7): onUnauthorized(), getCurrentUser(), login(), logout(), refreshSession(), register(), SessionProvider()

### Community 61 - "Community 61"
Cohesion: 0.20
Nodes (17): raterSlug(), emptyProgress(), isRecord(), parseStoredProgress(), serializeProgress(), StoredProgress, fresh(), canUseStorage() (+9 more)

### Community 62 - "Community 62"
Cohesion: 0.16
Nodes (16): MOCK_ORG_ID, MOCK_PASSWORD, MockAccount, mockAccounts, mockOrg, MockUser, accounts, cookie() (+8 more)

### Community 63 - "Community 63"
Cohesion: 0.17
Nodes (15): CV_SCENARIOS, CvDocumentResponse, extracting, parsed, scenarioForFile(), callApi(), covered, Cv (+7 more)

### Community 64 - "Community 64"
Cohesion: 0.21
Nodes (9): CSV_HEADER, exportLooseRatingsCsv(), EVAL_DIR, pairs, pairsText, isRating(), Rating, RATING_LABELS (+1 more)

### Community 65 - "Community 65"
Cohesion: 0.23
Nodes (9): CvDropzone(), text(), CV_ACCEPT, CV_NOT_PDF_MESSAGE, CV_ONE_FILE_MESSAGE, CV_TOO_LARGE_MESSAGE, MAX_CV_SIZE_BYTES, readStart() (+1 more)

### Community 66 - "Community 66"
Cohesion: 0.16
Nodes (8): extract_text(), _visible_chars(), with_ocr(), _positions(), test_columns_and_spanning_blocks(), test_single_column_is_read_top_to_bottom(), test_table_cv_keeps_rows_together(), test_two_column_cv_is_read_column_by_column()

### Community 67 - "Community 67"
Cohesion: 0.16
Nodes (8): ADMIN, countOf(), MotionWindow, pageWrapper(), Recorded, recorded(), rowAnimations(), visibleRows()

### Community 68 - "Community 68"
Cohesion: 0.29
Nodes (14): ResolvedTheme, Theme, applyCurrent(), darkQuery(), listeners, notify(), readSystemDark(), readTheme() (+6 more)

### Community 69 - "Community 69"
Cohesion: 0.18
Nodes (10): JobResponse, jobsStore, updateJob(), detailResponse(), ErrorEnvelope, errorResponse(), notFound(), paginate() (+2 more)

### Community 70 - "Community 70"
Cohesion: 0.22
Nodes (5): _Block, _find_gutter(), _line_order(), _page_text(), _reading_order()

### Community 71 - "Community 71"
Cohesion: 0.18
Nodes (12): REST API Contract & Mock Payload Specification, Applications endpoints and stage history, Standard error envelope and codes, Jobs endpoints (/jobs), Standard pagination envelope, GET /applications/{id}/score (hybrid score breakdown), application_stage_history table, applications table (+4 more)

### Community 72 - "Community 72"
Cohesion: 0.14
Nodes (7): ADMIN, RECRUITER, VIEWER, ADMIN, ADMIN, @playwright/test@^1.64.1, @playwright/test

### Community 73 - "Community 73"
Cohesion: 0.19
Nodes (13): L-6 embedding spike README, Evaluation jobs (J01, J07, J10), J01 Senior Backend Engineer, J07 Data Analyst, J10 Marketing Assistant, Ratings folder README, ML folder README, ats_scoring package (+5 more)

### Community 74 - "Community 74"
Cohesion: 0.24
Nodes (9): msw@^3.0.3, globalForMsw, worker, applicationHandlers, authHandlers, candidateHandlers, jobHandlers, server (+1 more)

### Community 75 - "Community 75"
Cohesion: 0.18
Nodes (10): { push, replace, listCandidates, url }, MOCK_USER_ID, CandidateResponse, CvDocumentResponse, generatedCandidates(), mockCandidates, mockCvDocuments, mockPaginatedCandidates (+2 more)

### Community 76 - "Community 76"
Cohesion: 0.17
Nodes (3): run_migrations_offline(), run_migrations_online(), test_alembic_migration_lifecycle()

### Community 77 - "Community 77"
Cohesion: 0.21
Nodes (11): pgvector HNSW embedding indexes (vector(384)), Embedding model and skill matching (L-6), intfloat/multilingual-e5-small (chosen embedding model), ESCO skills taxonomy, all-MiniLM-L6-v2 (rejected alternative), Skill normalization cascade (clean, alias, exact, fuzzy, embedding, free text), Skill normalization (L-11), Alias table (abbreviations and tech terms ESCO lacks) (+3 more)

### Community 78 - "Community 78"
Cohesion: 0.21
Nodes (12): ESCO skill taxonomy, Jobs list and job form screens, multilingual-e5-small, ESCO skills v1.2.1, all-MiniLM-L6-v2, ESCO matching results (e5-small), ESCO matching results (MiniLM), ESCO matching pipeline (clean, alias, exact, fuzzy, embedding) (+4 more)

### Community 79 - "Community 79"
Cohesion: 0.23
Nodes (3): _accepted(), NormalizedSkill, _suggested()

### Community 80 - "Community 80"
Cohesion: 0.32
Nodes (5): job_markdown(), main(), parsed_cv(), read_json(), write_json()

### Community 81 - "Community 81"
Cohesion: 0.29
Nodes (10): activeClientIds, getResponse(), handleRequest(), IS_MOCKED_RESPONSE, pendingRequests, resolveMainClient(), respondWithMock(), sendToClient() (+2 more)

### Community 82 - "Community 82"
Cohesion: 0.27
Nodes (9): formatYearMonth(), isObj(), MONTHS, num(), Obj, ParsedSummary, period(), readParsedSummary() (+1 more)

### Community 83 - "Community 83"
Cohesion: 0.20
Nodes (5): OcrUnavailableError, tesseract_ocr(), without_ocr(), missing(), test_tesseract_missing_is_reported_as_unavailable()

### Community 84 - "Community 84"
Cohesion: 0.22
Nodes (3): new_cv_storage_key(), StorageError, test_storage_keys_are_random()

### Community 85 - "Community 85"
Cohesion: 0.31
Nodes (11): Candidates endpoints (/candidates), CV upload and processing status lifecycle, PATCH /candidates/{id}/parsed-profile (B-14), candidates table, cv_documents table, CV structured extraction (B-13), Parser accuracy benchmark on 100 synthetic CVs, cv_parser service (spaCy + regex + headings) (+3 more)

### Community 86 - "Community 86"
Cohesion: 0.22
Nodes (11): US-04 Upload a CV and follow processing, Staging deploy (L-8), Free-tier limits (CVs lost on deploy, worker not deployed), Render web service ats-api, Supabase Postgres + pgvector, CV upload dialog states, ATS Scorer web app README, CV upload scenarios by file name (+3 more)

### Community 87 - "Community 87"
Cohesion: 0.24
Nodes (7): _ambiguous(), names(), test_extract_skills(), test_extracted_raw_is_the_phrase_as_written(), test_extracted_skills_are_all_accepted(), test_extraction_finds_the_labels_of_every_loaded_language(), test_extraction_spans_line_breaks()

### Community 88 - "Community 88"
Cohesion: 0.24
Nodes (6): default_normalizer(), extract_skills(), normalize_skills(), test_module_functions_fail_on_a_missing_esco_file(), test_module_functions_use_the_esco_files_in_the_environment(), test_module_functions_warn_when_no_esco_file_is_set()

### Community 89 - "Community 89"
Cohesion: 0.24
Nodes (7): ADMIN, choose(), html(), themeButton(), Probe(), renderProbe(), useTheme()

### Community 90 - "Community 90"
Cohesion: 0.18
Nodes (11): scripts, build, dev, format, gen:api, lint, start, test (+3 more)

### Community 91 - "Community 91"
Cohesion: 0.24
Nodes (9): getCandidate(), updateCandidateParsedProfile(), CvReview(), newestCvId(), {
  getCandidate,
  getCandidateCvDocument,
  listCandidateCvDocuments,
  downloadCandidateCV,
  updateCandidateParsedProfile,
  toast,
  session,
  router,
}, ok(), parsed, renderReview() (+1 more)

### Community 92 - "Community 92"
Cohesion: 0.29
Nodes (7): CvUploadItem(), PendingUpload, Progress(), ProgressProps, dateFormat, formatBytes(), getInitials()

### Community 93 - "Community 93"
Cohesion: 0.29
Nodes (7): renderToggle(), applyTheme(), DARK_QUERY, parseTheme(), resolveTheme(), THEME_STORAGE_KEY, themeInitScript

### Community 95 - "Community 95"
Cohesion: 0.20
Nodes (10): CLAUDE.md (repo guidance), api/ FastAPI backend, Cookie-based JWT auth, Dev-only routes (page.dev.tsx) and /dev/labeling, ml/ package (ats_scoring, synthetic, embedding_spike), MSW mock API layer, docs/openapi.yaml (planned API contract), Storage protocol / LocalDiskStorage (+2 more)

### Community 96 - "Community 96"
Cohesion: 0.20
Nodes (10): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, container_name, environment, image, ports, restart (+2 more)

### Community 97 - "Community 97"
Cohesion: 0.20
Nodes (9): concurrency, cancel-in-progress, group, jobs, name, on, pull_request, workflow_dispatch (+1 more)

### Community 98 - "Community 98"
Cohesion: 0.22
Nodes (9): services, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, env, image, options, ports (+1 more)

### Community 99 - "Community 99"
Cohesion: 0.39
Nodes (9): steps, steps, if, name, run, uses, working-directory, steps (+1 more)

### Community 100 - "Community 100"
Cohesion: 0.28
Nodes (6): load_esco(), _read_rows(), full_normalizer(), normalizer(), test_load_esco_ignores_concepts_only_in_a_later_file(), test_load_esco_skips_duplicate_rows()

### Community 101 - "Community 101"
Cohesion: 0.31
Nodes (3): SentenceTransformerEmbedder, main(), skill_strings()

### Community 103 - "Community 103"
Cohesion: 0.25
Nodes (4): _no_ocr_expected(), test_all_generated_l5_cvs_produce_text(), test_corrupt_pdf_is_reported_not_raised_as_a_crash(), test_every_l5_layout_produces_text()

### Community 104 - "Community 104"
Cohesion: 0.25
Nodes (8): defaults, run, web, working-directory, defaults, name, runs-on, timeout-minutes

### Community 105 - "Community 105"
Cohesion: 0.25
Nodes (8): with, cache, cache-dependency-path, name, node-version, path, python-version, retention-days

### Community 107 - "Community 107"
Cohesion: 0.29
Nodes (4): cvs(), liveRegion(), RECRUITER, SLOW_STEP

### Community 108 - "Community 108"
Cohesion: 0.54
Nodes (5): nextConfig(), DEFAULT_PAGE_EXTENSIONS, DEV_ONLY_PAGE_EXTENSIONS, DEV_SERVER_PHASE, pageExtensionsFor()

### Community 109 - "Community 109"
Cohesion: 0.36
Nodes (5): actionForKey(), isEditable(), KeyEventLike, ShortcutAction, SHORTCUTS

### Community 110 - "Community 110"
Cohesion: 0.29
Nodes (3): PdfExtractionError, test_damaged_page_content_is_reported(), test_page_limit()

### Community 112 - "Community 112"
Cohesion: 0.29
Nodes (5): Audit events (no PII in details), Database ERD & Schema Documentation, audit_events table, organizations table, users table

### Community 113 - "Community 113"
Cohesion: 0.57
Nodes (7): healthcheck, interval, retries, test, timeout, healthcheck, healthcheck

### Community 114 - "Community 114"
Cohesion: 0.29
Nodes (7): env, name, runs-on, timeout-minutes, DATABASE_URL, PGPASSWORD, api

### Community 116 - "Community 116"
Cohesion: 0.33
Nodes (5): services, volumes, cvdata, pgdata, redisdata

### Community 117 - "Community 117"
Cohesion: 0.33
Nodes (6): container_name, environment, ports, restart, volumes, api

### Community 118 - "Community 118"
Cohesion: 0.40
Nodes (6): depends_on, postgres, redis, condition, condition, depends_on

### Community 119 - "Community 119"
Cohesion: 0.33
Nodes (6): container_name, image, ports, restart, volumes, redis

### Community 120 - "Community 120"
Cohesion: 0.33
Nodes (6): web, container_name, depends_on, environment, ports, restart

### Community 121 - "Community 121"
Cohesion: 0.33
Nodes (6): worker, command, container_name, environment, restart, volumes

### Community 122 - "Community 122"
Cohesion: 0.47
Nodes (6): Pull Request Template, PR checklist: parsed-CV schema bump, Parsed-CV schema v1.0 (L-10), parsed_cv.schema.json, ParsedCV pydantic model (parsed_cv.py), Schema versioning rules and changelog

### Community 124 - "Community 124"
Cohesion: 0.33
Nodes (3): SRC, TOOL, walk()

### Community 125 - "Community 125"
Cohesion: 0.40
Nodes (4): metadata, RootLayout(), MockProvider(), startWorker()

### Community 126 - "Community 126"
Cohesion: 0.47
Nodes (6): Evaluation harness (L-9), 30-pair evaluation set (3 jobs x 10 candidates), ats_scoring.evaluate module, F-13 labeling tool (/dev/labeling), Metrics: Spearman, NDCG@10, Cohen's kappa, 0-3 rating scale and rating rules

### Community 128 - "Community 128"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, build, build

### Community 129 - "Community 129"
Cohesion: 0.40
Nodes (3): ADR 001: Hard deletion of candidate data, Anonymized consent record (SHA-256 email hash), consent_records table

### Community 130 - "Community 130"
Cohesion: 0.40
Nodes (5): ml, defaults, name, runs-on, timeout-minutes

### Community 131 - "Community 131"
Cohesion: 0.40
Nodes (5): web-e2e, defaults, name, runs-on, timeout-minutes

### Community 132 - "Community 132"
Cohesion: 0.50
Nodes (5): README (local development setup), Arq background worker, Demo seed data (make seed), Docker infrastructure (Postgres pgvector, Redis), Tesseract OCR

### Community 133 - "Community 133"
Cohesion: 0.60
Nodes (4): formatEmploymentType(), JobCard(), Skills(), JobRecord

## Ambiguous Edges - Review These
- `Score breakdown panel (skill 40, semantic 30, experience 20, title 10)` → `Baseline score (skill overlap 0.6 + TF-IDF 0.4)`  [AMBIGUOUS]
  ats-scorer/docs/ui_wireframes.md · relation: conceptually_related_to

## Knowledge Gaps
- **30 isolated node(s):** `ats-api`, `ats-scoring`, `Pull Request Template`, `Cookie-based JWT auth`, `MSW mock API layer` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1084 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `User` connect `Audit & Me Endpoints` to `Parser Errors & Extraction`, `Auth Endpoints`, `ORM Models`, `Candidate CRUD`, `Candidate Tests`, `Job Tests`, `Community 134`, `Security (Argon2/JWT)`, `Applications Endpoints`, `Community 45`, `CV Documents Endpoints`, `Jobs Endpoints`, `CV Document Tests`, `Application Tests`, `Community 52`, `Community 53`, `Candidate Endpoints & Schemas`, `Test Fixtures`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Are the 90 inferred relationships involving `User` (e.g. with `create_application()` and `get_application()`) actually correct?**
  _`User` has 90 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ats-api`, `ats-scoring`, `Pull Request Template` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Parser Errors & Extraction` be split into smaller, more focused modules?**
  _Cohesion score 0.07183908045977011 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Data Tables & Auth Layout` to `Community 65`, `Web Dependencies`, `Job UI & Dev Components`, `Community 68`, `CV Confidence Display`, `Frontend API Client & CV Rows`, `Jobs & Candidates Pages`, `Community 40`, `Community 44`, `Job Create/Edit UI`, `Community 54`, `Candidate Profile Page`, `Labeling Tool`, `Community 92`, `Community 61`, `CV Review & Auth Guards`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 28 inferred relationships involving `SkillNormalizer` (e.g. with `CvParser` and `parser()`) actually correct?**
  _`SkillNormalizer` has 28 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Score breakdown panel (skill 40, semantic 30, experience 20, title 10)` and `Baseline score (skill overlap 0.6 + TF-IDF 0.4)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._