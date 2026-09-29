CREATE TYPE business_status AS ENUM (
  'active',
  'temporarily_closed',
  'permanently_closed',
  'unknown'
);

CREATE TYPE source_kind AS ENUM (
  'inchelin_db',
  'official_website',
  'official_social',
  'map_service',
  'reservation_platform',
  'delivery_platform',
  'review',
  'blog'
);

CREATE TYPE verification_state AS ENUM (
  'verified',
  'needs_review',
  'conflict',
  'stale',
  'rejected'
);

CREATE TYPE resolution_status AS ENUM (
  'confirmed',
  'needs_review',
  'conflict',
  'missing'
);

CREATE TABLE places (
  id uuid PRIMARY KEY,
  inchelin_place_id text NOT NULL UNIQUE,
  canonical_name text NOT NULL,
  canonical_address text NOT NULL,
  normalized_name text NOT NULL,
  normalized_address text NOT NULL,
  identity_key char(64) NOT NULL UNIQUE,
  business_status business_status NOT NULL DEFAULT 'unknown',
  status_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sources (
  id uuid PRIMARY KEY,
  kind source_kind NOT NULL,
  source_rank smallint NOT NULL CHECK (source_rank BETWEEN 0 AND 4),
  publisher text,
  url text,
  external_id text,
  published_at timestamptz,
  retrieved_at timestamptz NOT NULL,
  content_hash char(64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE place_match_candidates (
  id uuid PRIMARY KEY,
  place_id uuid NOT NULL REFERENCES places(id),
  source_id uuid NOT NULL REFERENCES sources(id),
  candidate_name text NOT NULL,
  candidate_address text,
  name_score numeric(5,4),
  address_score numeric(5,4),
  decision verification_state NOT NULL DEFAULT 'needs_review',
  reviewed_at timestamptz,
  reviewed_by text
);

CREATE TABLE field_observations (
  id uuid PRIMARY KEY,
  place_id uuid NOT NULL REFERENCES places(id),
  field_name text NOT NULL,
  value_json jsonb,
  raw_value text,
  source_id uuid NOT NULL REFERENCES sources(id),
  observed_at timestamptz,
  retrieved_at timestamptz NOT NULL,
  expires_at timestamptz,
  confidence numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  verification_state verification_state NOT NULL DEFAULT 'needs_review',
  observation_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, field_name, observation_hash, source_id)
);

CREATE TABLE resolved_facts (
  place_id uuid NOT NULL REFERENCES places(id),
  field_name text NOT NULL,
  value_json jsonb,
  resolution_status resolution_status NOT NULL,
  selected_observation_id uuid REFERENCES field_observations(id),
  supporting_observation_ids uuid[] NOT NULL DEFAULT '{}',
  confidence numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  checked_at timestamptz NOT NULL,
  expires_at timestamptz,
  resolution_note text,
  PRIMARY KEY (place_id, field_name)
);

CREATE TABLE enrichment_runs (
  id uuid PRIMARY KEY,
  place_id uuid REFERENCES places(id),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  sources_checked integer NOT NULL DEFAULT 0,
  error_summary text
);

CREATE INDEX field_observations_lookup
  ON field_observations (place_id, field_name, retrieved_at DESC);

CREATE INDEX resolved_facts_usable
  ON resolved_facts (field_name, resolution_status, expires_at);

CREATE VIEW recommendation_candidates AS
SELECT
  p.*,
  CASE p.business_status
    WHEN 'active' THEN 0
    WHEN 'temporarily_closed' THEN 1
    WHEN 'unknown' THEN 2
    ELSE 9
  END AS status_rank
FROM places p
WHERE p.business_status <> 'permanently_closed';

