-- Sample data for the LOCAL database only (supabase db reset runs it).
-- Never run this on the hosted Supabase project (architecture.md section 12).
-- Sign in locally with Test sign-in as admin@transfunnel.com or
-- learner@transfunnel.com. The video ids are placeholders: replace them with
-- real embeddable YouTube ids to try the player locally.

insert into users (email, full_name, role) values
  ('admin@transfunnel.com',   'Sample Admin',   'admin'),
  ('learner@transfunnel.com', 'Sample Learner', 'learner');

with course as (
  insert into courses (title, description, pass_percentage, status, published_at, created_by)
  select 'Email Etiquette (sample)', 'Sample course for local development.', 60, 'published', now(), id
  from users where email = 'admin@transfunnel.com'
  returning id
), vids as (
  insert into videos (course_id, position, title, youtube_video_id, duration_seconds)
  select id, v.position, v.title, v.yt, v.secs from course,
    (values (1, 'Writing clear subject lines', 'SAMPLE_VIDEO_1', 180),
            (2, 'Reply-all and CC etiquette',  'SAMPLE_VIDEO_2', 240)) as v(position, title, yt, secs)
  returning id
), q as (
  insert into questions (course_id, position, text, type)
  select id, v.position, v.text, v.type from course,
    (values (1, 'What makes a good subject line?', 'single'),
            (2, 'When should you use Reply all? (choose all that apply)', 'multiple'),
            (3, 'Who belongs in CC?', 'single')) as v(position, text, type)
  returning id, position
)
insert into options (question_id, position, text, is_correct)
select q.id, o.position, o.text, o.is_correct from q
join (values
  (1, 1, 'Short and specific to the email''s purpose', true),
  (1, 2, 'Left blank so people open it',               false),
  (2, 1, 'When everyone on the thread needs the reply', true),
  (2, 2, 'When the reply changes what others will do',  true),
  (2, 3, 'Always, to be safe',                          false),
  (3, 1, 'People who need to know but not act',         true),
  (3, 2, 'Everyone in the department',                  false)
) as o(qpos, position, text, is_correct) on o.qpos = q.position;
