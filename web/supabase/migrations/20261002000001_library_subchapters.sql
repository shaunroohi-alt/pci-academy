-- Library sub-chapters (PCI website handoff, 29 September 2026): texts filed
-- under a parent chapter — Other People’s Material and Coherence in Business
-- under Individualism. They are stored as content_items of type 'sub_chapter'
-- in collection 'library'. `collection` is free text; `type` is constrained,
-- so the check is widened here. Idempotent: drop-and-recreate the constraint.
alter table public.content_items drop constraint if exists content_items_type_check;
alter table public.content_items add constraint content_items_type_check
  check (type in ('book', 'chapter', 'sub_chapter', 'booklet', 'article', 'research_note', 'framework', 'glossary', 'course', 'audio', 'front_matter', 'back_matter'));
