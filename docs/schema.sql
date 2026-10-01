-- =============================================================================
-- AI-Assisted Applicant Tracking System (ATS) - Database Schema DDL
-- Database: PostgreSQL 17+ with pgvector extension
-- Target: Multi-tenant, AI-Assisted ATS Workspace
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- -----------------------------------------------------------------------------
-- 1. ORGANIZATIONS (Tenants)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2. USERS & ROLE-BASED ACCESS CONTROL
-- Roles: 'admin', 'recruiter', 'viewer'
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'recruiter', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_users_org_email UNIQUE (org_id, email)
);

-- -----------------------------------------------------------------------------
-- 3. JOBS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    department VARCHAR(100),
    location VARCHAR(100),
    employment_type VARCHAR(50) DEFAULT 'full_time',
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paused', 'closed', 'archived')),
    description TEXT NOT NULL,
    required_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    preferred_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    min_experience_years INT NOT NULL DEFAULT 0,
    embedding vector(384), -- CPU-friendly sentence-transformer embedding (384 dims)
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 4. PIPELINE STAGES (Hiring Pipeline)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE, -- NULL indicates global tenant default stage
    name VARCHAR(100) NOT NULL,
    stage_order INT NOT NULL,
    stage_type VARCHAR(50) NOT NULL DEFAULT 'custom' CHECK (stage_type IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'custom')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pipeline_stage_order UNIQUE (org_id, job_id, stage_order)
);

-- -----------------------------------------------------------------------------
-- 5. CANDIDATES
-- Note: Hard delete behavior configured via ON DELETE CASCADE on dependent records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    location VARCHAR(255),
    cv_file_path TEXT,
    raw_text TEXT,
    parsed_data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Extracted skills, work history, education, OCR status
    embedding vector(384), -- Candidate resume text embedding (384 dims for vector similarity search)
    protected_attributes JSONB NOT NULL DEFAULT '{}'::jsonb, -- Redacted/encrypted demographic proxies for fairness audit
    is_anonymized BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_candidates_org_email UNIQUE (org_id, email)
);

-- -----------------------------------------------------------------------------
-- 6. APPLICATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hired', 'rejected', 'withdrawn')),
    rejection_reason TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_applications_job_candidate UNIQUE (org_id, job_id, candidate_id)
);

-- -----------------------------------------------------------------------------
-- 7. SCORES
-- Stores hybrid ranking scores, model_version, and component_breakdown JSON
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    overall_score NUMERIC(5, 2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    skill_overlap_score NUMERIC(5, 2) NOT NULL CHECK (skill_overlap_score >= 0 AND skill_overlap_score <= 100),
    semantic_score NUMERIC(5, 2) NOT NULL CHECK (semantic_score >= 0 AND semantic_score <= 100),
    experience_score NUMERIC(5, 2) NOT NULL CHECK (experience_score >= 0 AND experience_score <= 100),
    title_fit_score NUMERIC(5, 2) NOT NULL CHECK (title_fit_score >= 0 AND title_fit_score <= 100),
    model_version VARCHAR(50) NOT NULL, -- Version identifier of ranking model/algorithm used
    component_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb, -- Matched/missing skills list, score weightings, breakdown explanation
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_scores_application_model UNIQUE (application_id, model_version)
);

-- -----------------------------------------------------------------------------
-- 8. AUDIT EVENTS
-- Multi-tenant audit logging for recruiter actions, compliance, and learning ranker
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- System events can have NULL user_id
    action VARCHAR(100) NOT NULL, -- e.g., 'candidate.upload', 'candidate.hard_delete', 'application.stage_moved', 'score.generated'
    target_entity VARCHAR(50) NOT NULL, -- e.g., 'candidate', 'job', 'application', 'score'
    target_id UUID,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 9. CONSENT RECORDS
-- Privacy controls, candidate data processing consent, GDPR compliance tracking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL, -- Preserves consent audit trail post candidate hard delete
    candidate_email_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of email for verification post hard-deletion
    consent_type VARCHAR(50) NOT NULL DEFAULT 'data_processing' CHECK (consent_type IN ('data_processing', 'ai_scoring', 'third_party_sharing')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('granted', 'revoked', 'expired')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    ip_address VARCHAR(45),
    user_agent TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INDEXES FOR MULTI-TENANCY, PERFORMANCE, SEARCH, AND AUDITING
-- =============================================================================

-- Multi-Tenant Composite Indexes
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(org_id, role);
CREATE INDEX IF NOT EXISTS idx_jobs_org_status ON jobs(org_id, status);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_org_job ON pipeline_stages(org_id, job_id, stage_order);
CREATE INDEX IF NOT EXISTS idx_candidates_org_email ON candidates(org_id, email);
CREATE INDEX IF NOT EXISTS idx_applications_org_job_stage ON applications(org_id, job_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_applications_org_candidate ON applications(org_id, candidate_id);

-- Scoring Engine & Ranking Indexes
CREATE INDEX IF NOT EXISTS idx_scores_org_job_score ON scores(org_id, job_id, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_application ON scores(application_id);
CREATE INDEX IF NOT EXISTS idx_scores_model_version ON scores(model_version);

-- Audit & Consent Query Indexes
CREATE INDEX IF NOT EXISTS idx_audit_events_org_created ON audit_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(org_id, action);
CREATE INDEX IF NOT EXISTS idx_consent_records_org_candidate ON consent_records(org_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_email_hash ON consent_records(org_id, candidate_email_hash);

-- Full-Text & Vector Similarity Indexes (pgvector HNSW index for candidate resume matching)
CREATE INDEX IF NOT EXISTS idx_candidates_embedding_hnsw ON candidates USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_embedding_hnsw ON jobs USING hnsw (embedding vector_cosine_ops);

-- JSONB GIN Indexes for fast filtering on skills and candidate structured data
CREATE INDEX IF NOT EXISTS idx_jobs_required_skills_gin ON jobs USING gin (required_skills);
CREATE INDEX IF NOT EXISTS idx_candidates_parsed_data_gin ON candidates USING gin (parsed_data);
CREATE INDEX IF NOT EXISTS idx_scores_component_breakdown_gin ON scores USING gin (component_breakdown);

-- Automatic updated_at Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_pipeline_stages_updated_at BEFORE UPDATE ON pipeline_stages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_candidates_updated_at BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
