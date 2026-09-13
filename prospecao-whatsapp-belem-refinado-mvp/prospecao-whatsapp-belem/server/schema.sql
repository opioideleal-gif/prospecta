-- Prospecta intelligence schema (PostgreSQL/Supabase-ready)
create table if not exists companies (
  id text primary key,
  name text not null,
  segment text not null,
  subsegment text,
  business_model text,
  city text,
  address text,
  site text,
  phone text,
  source_type text not null default 'cadastrado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists contacts (id text primary key, company_id text not null references companies(id), name text, phone text, email text, whatsapp text, source_type text not null default 'cadastrado');
create table if not exists leads (id text primary key, company_id text not null references companies(id), status text not null default 'Novo', score integer not null default 0, confidence integer, next_action text, next_action_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists opportunities (id text primary key, lead_id text not null references leads(id), title text not null, description text, score integer, source_type text not null default 'inferencia');
create table if not exists services (id text primary key, name text not null, category text, description text);
create table if not exists activities (id text primary key, lead_id text not null references leads(id), type text not null, payload jsonb not null default '{}', occurred_at timestamptz not null default now());
create table if not exists notes (id text primary key, lead_id text not null references leads(id), body text not null, created_at timestamptz not null default now());
create table if not exists follow_ups (id text primary key, lead_id text not null references leads(id), due_at timestamptz not null, status text not null default 'pending', created_at timestamptz not null default now());
create table if not exists messages (id text primary key, lead_id text not null references leads(id), kind text not null, body text not null, sent_at timestamptz, created_at timestamptz not null default now());
create table if not exists pipeline_stages (id text primary key, name text not null, position integer not null);
create table if not exists research (id text primary key, company_id text not null references companies(id), research_hash text not null, last_research_at timestamptz not null, created_at timestamptz not null default now());
create table if not exists research_sources (id text primary key, research_id text not null references research(id), source_url text not null, source_type text not null, source_title text, retrieved_at timestamptz not null, confidence text not null, claim text not null);
create table if not exists scores (id text primary key, lead_id text not null references leads(id), score integer not null, reasons jsonb not null default '[]', calculated_at timestamptz not null default now());
create index if not exists idx_leads_next_action on leads(next_action_at);
create index if not exists idx_research_company on research(company_id);
