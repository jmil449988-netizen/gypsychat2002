-- Seed 30 tester access codes -------------------------------------------------------------
--
-- Run this once, AFTER access_keys_feature.sql has created the table. Safe to re-run --
-- on conflict (code) it just skips rows that already exist rather than erroring.
--
-- Hand each code out to one tester. To cut one off later, find its row in the Supabase table
-- editor (public.access_keys) and set revoked = true -- no need to touch this file again.

insert into public.access_keys (code, label) values
  ('GYPSY-CS7S-C5VD', 'tester 01'),
  ('GYPSY-2T43-CYRG', 'tester 02'),
  ('GYPSY-4S8H-BUQT', 'tester 03'),
  ('GYPSY-SAA7-DXXX', 'tester 04'),
  ('GYPSY-E7AA-32MA', 'tester 05'),
  ('GYPSY-TCCX-5UF8', 'tester 06'),
  ('GYPSY-3ACC-YM8V', 'tester 07'),
  ('GYPSY-2TBX-YAD7', 'tester 08'),
  ('GYPSY-3P8E-3XAU', 'tester 09'),
  ('GYPSY-EF6P-ZUWC', 'tester 10'),
  ('GYPSY-XUPC-BBFM', 'tester 11'),
  ('GYPSY-WQJ9-GBSQ', 'tester 12'),
  ('GYPSY-23AQ-GRMB', 'tester 13'),
  ('GYPSY-YMXP-NBH5', 'tester 14'),
  ('GYPSY-PH4X-S2WV', 'tester 15'),
  ('GYPSY-YUM7-SHZN', 'tester 16'),
  ('GYPSY-DQMJ-TUB7', 'tester 17'),
  ('GYPSY-KU8A-VG7U', 'tester 18'),
  ('GYPSY-F9WA-8XU9', 'tester 19'),
  ('GYPSY-AVRY-EXQR', 'tester 20'),
  ('GYPSY-3F3T-7KRJ', 'tester 21'),
  ('GYPSY-63HG-YXJ7', 'tester 22'),
  ('GYPSY-473Z-UDZH', 'tester 23'),
  ('GYPSY-NKNY-PDYQ', 'tester 24'),
  ('GYPSY-JB6Q-NRT2', 'tester 25'),
  ('GYPSY-JABM-EJA3', 'tester 26'),
  ('GYPSY-SS4K-967F', 'tester 27'),
  ('GYPSY-DQFY-EJ58', 'tester 28'),
  ('GYPSY-HDS9-HHU9', 'tester 29'),
  ('GYPSY-BN5F-YY8N', 'tester 30')
on conflict (code) do nothing;
