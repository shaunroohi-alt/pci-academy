-- Initial schema for the Music and Arts site.
-- Money is stored in integer cents. NULL price = "not published yet".

create extension if not exists pgcrypto;

create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Section 1: piano technician services
-- ---------------------------------------------------------------------------
create table if not exists services (
  slug             text primary key,
  name             text not null,
  tagline          text not null default '',
  description      text not null default '',
  includes         text[] not null default '{}',
  price_cents      integer,                 -- null = price not announced yet
  price_note       text not null default '',
  duration_minutes integer,
  is_active        boolean not null default true,
  sort_order       integer not null default 0
);

create table if not exists appointments (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique,
  service_slug     text not null references services(slug),
  customer_name    text not null,
  email            text not null,
  phone            text not null,
  address_line     text not null,
  city             text not null,
  postal_code      text not null default '',
  piano_type       text not null,           -- upright | grand | digital_hybrid | other
  piano_brand      text not null default '',
  piano_notes      text not null default '',
  preferred_date   date,
  preferred_window text not null default '',-- morning | afternoon | evening | flexible
  notes            text not null default '',
  status           text not null default 'requested', -- requested | confirmed | completed | cancelled
  admin_notes      text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists appointments_status_idx on appointments(status, created_at desc);

-- ---------------------------------------------------------------------------
-- Piano trade-in marketplace: sellers, buyers, deals
-- ---------------------------------------------------------------------------
create table if not exists piano_listings (
  id                 uuid primary key default gen_random_uuid(),
  ref                text not null unique,
  seller_name        text not null,
  email              text not null,
  phone              text not null,
  city               text not null,
  piano_type         text not null,
  brand              text not null default '',
  model              text not null default '',
  year_made          text not null default '',
  serial_number      text not null default '',
  condition          text not null default 'unknown', -- excellent | good | fair | poor | unknown
  description        text not null default '',
  photo_urls         text[] not null default '{}',
  asking_price_cents integer,                -- what the seller wants; null = make me an offer
  status             text not null default 'new', -- new | reviewing | offer_made | listed | sold | declined
  -- set by admin when the piano goes on the public "Pianos for sale" page
  public_title       text not null default '',
  public_description text not null default '',
  buy_price_cents    integer,                -- what we pay the seller
  list_price_cents   integer,                -- what buyers see (buy price + markup)
  admin_notes        text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists piano_listings_status_idx on piano_listings(status, created_at desc);

create table if not exists buyer_interests (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique,
  listing_id       uuid references piano_listings(id) on delete set null, -- null = general "looking for a piano"
  buyer_name       text not null,
  email            text not null,
  phone            text not null,
  city             text not null default '',
  piano_type       text not null default 'any',
  budget_min_cents integer,
  budget_max_cents integer,
  timeline         text not null default '',   -- asap | 1_3_months | 3_6_months | browsing
  notes            text not null default '',
  status           text not null default 'new', -- new | contacted | matched | closed
  admin_notes      text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists buyer_interests_status_idx on buyer_interests(status, created_at desc);
create index if not exists buyer_interests_listing_idx on buyer_interests(listing_id);

create table if not exists deals (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references piano_listings(id) on delete cascade,
  buyer_id         uuid references buyer_interests(id) on delete set null,
  buy_price_cents  integer not null,
  markup_percent   numeric(5,2) not null,
  sale_price_cents integer not null,
  status           text not null default 'proposed', -- proposed | agreed | paid | delivered | cancelled
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists deals_listing_idx on deals(listing_id);

-- ---------------------------------------------------------------------------
-- Section 2: music tutoring
-- ---------------------------------------------------------------------------
create table if not exists programs (
  slug        text primary key,
  name        text not null,
  tagline     text not null default '',
  description text not null default '',
  highlights  text[] not null default '{}',
  age_range   text not null default '',
  is_active   boolean not null default true,
  sort_order  integer not null default 0
);

create table if not exists lesson_packages (
  slug           text primary key,
  name           text not null,
  description    text not null default '',
  lessons_count  integer not null,
  lesson_minutes integer not null,
  billing        text not null default 'monthly', -- monthly | one_time
  price_cents    integer,                 -- null = price not announced yet
  is_active      boolean not null default true,
  sort_order     integer not null default 0
);

create table if not exists lesson_inquiries (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique,
  parent_name    text not null,
  email          text not null,
  phone          text not null,
  student_name   text not null,
  student_age    integer,
  program_slug   text not null references programs(slug),
  package_slug   text references lesson_packages(slug),
  experience     text not null default 'beginner', -- beginner | some | intermediate | advanced
  format         text not null default 'in_person', -- in_person | online | either
  availability   text not null default '',
  notes          text not null default '',
  status         text not null default 'new', -- new | contacted | trial_booked | enrolled | closed
  admin_notes    text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists lesson_inquiries_status_idx on lesson_inquiries(status, created_at desc);

-- ---------------------------------------------------------------------------
-- Seed: catalogue and defaults (idempotent; prices stay editable in /admin)
-- ---------------------------------------------------------------------------
insert into settings (key, value) values
  ('marketplace_markup_percent', '15'),
  ('service_area', '"Serving the local area. Travel outside it may carry a small surcharge."'),
  ('contact_email', '""'),
  ('contact_phone', '""')
on conflict (key) do nothing;

insert into services (slug, name, tagline, description, includes, price_cents, price_note, duration_minutes, sort_order) values
  ('regular-tuning', 'Regular Tuning', 'Bring your piano back to pitch.',
   'A standard tuning to A440 for a piano that is tuned regularly and is close to pitch. Includes a quick check of the action and pedals so you know if anything else needs attention.',
   array['Fine tuning to concert pitch (A440)', 'Unisons and octaves checked across the keyboard', 'Brief inspection of action, pedals and case', 'Care recommendations for your room and climate'],
   null, 'Price to be announced', 90, 10),
  ('tuning-regulation', 'Tuning + Regulation', 'Tuning plus a responsive, even touch.',
   'Tuning combined with regulation of the action: the mechanical adjustments that make every key respond evenly, repeat quickly and feel consistent from bass to treble.',
   array['Everything in Regular Tuning', 'Key level, dip and let-off adjusted', 'Hammer line, repetition and damper timing checked', 'Pedal adjustment'],
   null, 'Price to be announced', 180, 20),
  ('full-package', 'Full Package', 'Tuning, regulation and voicing in one visit.',
   'The complete service: pitch correction and fine tuning, action regulation, voicing of the hammers for an even tone, and cleaning of the interior. Best for pianos that have gone a long time without attention or are being prepared for performance or sale.',
   array['Pitch raise or lowering if needed, then fine tuning', 'Full action regulation', 'Hammer voicing for an even, musical tone', 'Interior cleaning and lubrication of friction points', 'Written condition report'],
   null, 'Price to be announced', 300, 30),
  ('quote-me-up', 'Quote Me Up', 'A technician visits, diagnoses, and gives you a written offer.',
   'Not sure what your piano needs? For a flat fee a technician comes to your property, inspects the instrument, diagnoses what it requires, and gives you a clear written offer for the work. No pressure and no obligation to go ahead.',
   array['On-site visit and full inspection', 'Diagnosis of tuning, regulation, repair and structural needs', 'Written offer with itemised pricing', 'Honest advice if the piano is not worth the investment'],
   3000, 'Flat fee per visit', 45, 40)
on conflict (slug) do nothing;

insert into programs (slug, name, tagline, description, highlights, age_range, sort_order) values
  ('classical-piano', 'Classical Piano', 'Technique, repertoire and musicianship from the ground up.',
   'A structured path through classical repertoire with proper technique, sight-reading and ear training. Students can prepare for graded examinations and recitals, or simply play the music they love well.',
   array['Posture, hand position and tone production', 'Sight-reading and rhythm', 'Repertoire from Baroque to Contemporary', 'Optional exam and recital preparation'],
   'Ages 5 and up', 10),
  ('pop-piano', 'Pop Piano', 'Play the songs you actually listen to.',
   'Chords, grooves, lead sheets and playing by ear. Students learn to accompany themselves and others, improvise over progressions and play current songs quickly while still building solid technique.',
   array['Chord voicings and progressions', 'Reading lead sheets and chord charts', 'Playing by ear and improvising', 'Accompanying singers and bands'],
   'Ages 7 and up', 20),
  ('music-theory', 'Music Theory', 'Understand how music works.',
   'From note names and rhythm to harmony, form and analysis. Theory lessons support instrument study, prepare students for theory examinations and make composing and improvising far easier.',
   array['Notation, rhythm and key signatures', 'Intervals, scales and chords', 'Harmony and analysis', 'Ear training and dictation'],
   'Ages 8 and up', 30),
  ('songwriting-composition', 'Songwriting & Composition', 'Turn ideas into finished pieces.',
   'Guided writing in the student''s own style: melody, lyrics, harmony, structure and arrangement. Students finish real songs and pieces, learn to notate or record them, and build a portfolio.',
   array['Melody and lyric writing', 'Harmony and song structure', 'Arranging for piano, voice and small ensembles', 'Basic recording and notation software'],
   'Ages 10 and up', 40)
on conflict (slug) do nothing;

insert into lesson_packages (slug, name, description, lessons_count, lesson_minutes, billing, price_cents, sort_order) values
  ('trial-lesson', 'Trial Lesson', 'A single introductory lesson to meet the teacher and set goals.', 1, 30, 'one_time', null, 10),
  ('starter-4x30', 'Starter', 'Four 30-minute lessons per month. Ideal for younger beginners.', 4, 30, 'monthly', null, 20),
  ('standard-4x45', 'Standard', 'Four 45-minute lessons per month. Our most popular option.', 4, 45, 'monthly', null, 30),
  ('intensive-4x60', 'Intensive', 'Four 60-minute lessons per month for committed or advanced students.', 4, 60, 'monthly', null, 40),
  ('accelerated-8x45', 'Accelerated', 'Eight 45-minute lessons per month (twice weekly) for fast progress or exam preparation.', 8, 45, 'monthly', null, 50)
on conflict (slug) do nothing;
