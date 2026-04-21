create table if not exists hospitals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists doctors (
  id text primary key,
  hospital_slug text not null references hospitals(slug) on delete cascade,
  name text not null,
  specialty text,
  photo_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists videos (
  id text primary key,
  hospital_slug text not null references hospitals(slug) on delete cascade,
  type text not null,
  topic text,
  doctor_id text references doctors(id) on delete set null,
  doctor_name text,
  duration_seconds numeric not null,
  relative_path text not null,
  file_name text not null,
  script_summary text,
  created_at timestamptz not null default now()
);

create index if not exists videos_hospital_created_idx
  on videos (hospital_slug, created_at desc);
