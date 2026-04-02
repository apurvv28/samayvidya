create table if not exists public.subjects (
  subject_id text not null,
  subject_name text not null,
  subject_type text not null,
  credits integer not null,
  hours_per_week integer not null,
  requires_continuity boolean null default false,
  department_id uuid null,
  theory_hours integer null default 0,
  lab_hours integer null default 0,
  tutorial_hours integer null default 0,
  year text not null,
  delivery_mode text not null default 'OFFLINE'::text,
  is_theory_online boolean null default false,
  is_lab_online boolean null default false,
  is_tutorial_online boolean null default false,
  sub_short_form text null,
  constraint subjects_pkey primary key (subject_id),
  constraint subjects_department_id_fkey foreign key (department_id) references departments (department_id),
  constraint subjects_delivery_mode_check check (
    delivery_mode = any (array['OFFLINE'::text, 'ONLINE'::text, 'PARTIAL'::text])
  )
) tablespace pg_default;
