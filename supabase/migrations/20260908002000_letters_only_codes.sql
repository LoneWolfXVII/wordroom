-- Room codes are letters only.
--
-- The original constraint allowed A-Z plus 2-9, a superset chosen while the spec
-- ("4-letter code, A-Z minus O and I") and the build plan (an example code of
-- `KHX7`) disagreed. Playing the real app settled it: the generator produced
-- `7764`, and an all-numeric code for a word game reads as a bug. Letters-only
-- also satisfies the build plan's actual requirement — "codes exclude 0/O/1/I" —
-- because an alphabet with no digits has no 0 or 1 to exclude.
--
-- Mirrors CODE_ALPHABET in @wordroom/shared. Change both together.

alter table public.rooms drop constraint if exists rooms_code_format;

alter table public.rooms
  add constraint rooms_code_format check (code ~ '^[A-HJ-NP-Z]{4}$');
