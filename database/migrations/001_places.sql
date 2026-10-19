CREATE TABLE districts (
  id text PRIMARY KEY,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE campuses (
  id text PRIMARY KEY,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE places (
  id text PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('city', 'campus')),
  campus_id text REFERENCES campuses(id),
  district_id text REFERENCES districts(id),
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  category text NOT NULL,
  emoji text NOT NULL DEFAULT '📍',
  lng double precision CHECK (lng BETWEEN -180 AND 180),
  lat double precision CHECK (lat BETWEEN -90 AND 90),
  map_x double precision,
  map_y double precision,
  visit_minutes integer NOT NULL CHECK (visit_minutes BETWEEN 0 AND 1440),
  short text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  highlights text[] NOT NULL DEFAULT '{}',
  best_time text NOT NULL DEFAULT '',
  tips text NOT NULL DEFAULT '',
  must_see boolean NOT NULL DEFAULT false,
  opening_hours text,
  booking_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'city' AND campus_id IS NULL AND district_id IS NOT NULL AND lng IS NOT NULL AND lat IS NOT NULL)
    OR (scope = 'campus' AND campus_id IS NOT NULL AND map_x IS NOT NULL AND map_y IS NOT NULL))
);
CREATE INDEX places_scope_district ON places(scope, district_id) WHERE status = 'active';
CREATE INDEX places_campus ON places(campus_id) WHERE status = 'active';
CREATE INDEX places_category ON places(category) WHERE status = 'active';
CREATE TABLE tags (
  id text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE place_tags (
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  tag_id text NOT NULL REFERENCES tags(id),
  PRIMARY KEY(place_id, tag_id)
);
CREATE INDEX place_tags_tag ON place_tags(tag_id, place_id);
CREATE TABLE place_sources (
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  reference text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('project-import', 'official', 'manual')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified')),
  verified_at timestamptz,
  PRIMARY KEY(place_id, reference),
  CHECK (verification_status <> 'verified' OR verified_at IS NOT NULL)
);
