-- Като обикновено число в JS (BigInt не минава през JSON); гледанията са далеч под 2^53.
alter table public.tracks alter column youtube_views type double precision;
