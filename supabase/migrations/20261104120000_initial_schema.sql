-- Initial schema for the V1 pilot: tables, RLS and database functions.
-- Design: architecture.md sections 6 and 9. Never edit this file once it is
-- committed; schema changes go in new migration files (AGENTS.md hard rule 10).
-- gen_random_uuid() is built into Postgres 13+, so no extension is needed.

-- ---------------------------------------------------------------------------
-- Tables (section 6.1)
-- ---------------------------------------------------------------------------

-- People. Ours, not the sign-in provider's (section 4.1).
create table users (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique check (email = lower(btrim(email))),
  full_name           text,
  role                text not null default 'learner' check (role in ('learner', 'admin')),
  employee_code       text unique,
  auth_subject        text unique,
  first_signed_in_at  timestamptz,
  created_at          timestamptz not null default now()
);

-- One course = ordered videos + one assessment. Published courses are read-only.
create table courses (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  pass_percentage  int  not null check (pass_percentage between 1 and 100),
  max_attempts     int  not null default 1 check (max_attempts >= 1),
  due_at           timestamptz,
  status           text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by       uuid references users(id),
  published_at     timestamptz,
  created_at       timestamptz not null default now()
);

create table videos (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references courses(id) on delete cascade,
  position          int  not null,
  title             text not null,
  youtube_video_id  text not null,
  duration_seconds  int  not null check (duration_seconds > 0),
  unique (course_id, position)
);

create table questions (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  position   int  not null,
  text       text not null,
  type       text not null check (type in ('single', 'multiple')),
  points     int  not null default 1 check (points > 0),
  unique (course_id, position)
);

create table options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references questions(id) on delete cascade,
  position     int  not null,
  text         text not null,
  is_correct   boolean not null default false,   -- never sent to learners
  unique (question_id, position)
);

create table enrollments (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references courses(id),
  user_id          uuid not null references users(id),
  source           text not null check (source in ('self', 'admin')),
  assigned_by      uuid references users(id),
  status           text not null default 'enrolled'
                   check (status in ('enrolled', 'videos_done', 'assessment_in_progress', 'completed')),
  attempts_used    int not null default 0,
  best_score_pct   numeric(5,2),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (course_id, user_id)
);
create index enrollments_user_id_idx on enrollments (user_id);

-- Watch progress per person per video (section 9.1).
create table video_progress (
  enrollment_id          uuid not null references enrollments(id),
  video_id               uuid not null references videos(id),
  watched                bit varying not null,   -- one bit per 5-second segment
  watched_segments       int  not null default 0,
  last_position_seconds  int  not null default 0,
  last_reported_at       timestamptz,
  completed_at           timestamptz,
  primary key (enrollment_id, video_id)
);

create table attempts (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references enrollments(id),
  attempt_no     int  not null,
  status         text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  submit_reason  text check (submit_reason in ('learner', 'due_date')),
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  score_points   int,
  max_points     int,
  score_pct      numeric(5,2),
  passed         boolean,                        -- admin-only
  unique (enrollment_id, attempt_no)
);

-- At most one open attempt per enrollment (refreshes, extra tabs, double clicks)
create unique index one_open_attempt_per_enrollment
  on attempts (enrollment_id) where status = 'in_progress';

create table answers (
  id                   uuid primary key default gen_random_uuid(),
  attempt_id           uuid not null references attempts(id),
  question_id          uuid not null references questions(id),
  selected_option_ids  uuid[] not null default '{}',
  is_correct           boolean,                  -- set at submit; admin-only
  points_awarded       int,                      -- set at submit; admin-only
  saved_at             timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table activity_log (
  id             bigint generated always as identity primary key,
  actor_user_id  uuid,
  action         text not null,
  course_id      uuid,
  enrollment_id  uuid,
  details        jsonb,
  created_at     timestamptz not null default now()
);
create index activity_log_course_idx on activity_log (course_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security (section 6.2): RLS on, no policies, nothing for the
-- public roles. The API connects as the owner role and bypasses RLS.
-- ---------------------------------------------------------------------------

alter table users          enable row level security;
alter table courses        enable row level security;
alter table videos         enable row level security;
alter table questions      enable row level security;
alter table options        enable row level security;
alter table enrollments    enable row level security;
alter table video_progress enable row level security;
alter table attempts       enable row level security;
alter table answers        enable row level security;
alter table activity_log   enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions (section 9). Each runs as one transaction. Errors are raised with
-- a short code as the message (e.g. 'video_locked') for the API to map.
-- ---------------------------------------------------------------------------

-- Records watched 5-second segments for one video (section 9.1).
-- The first report for a video credits at most one segment; the player sends
-- a report when playback starts, so real watching is credited from there.
create function record_video_progress(
  p_enrollment_id uuid,
  p_video_id      uuid,
  p_segments      int[],
  p_position      int
)
returns table (watched_segments int, total_segments int, completed boolean, last_position_seconds int)
language plpgsql
set search_path = public
as $$
declare
  v_course     courses;
  v_video      videos;
  v_progress   video_progress;
  v_total      int;
  v_allowance  int;
  v_seg        int;
  v_credited   int := 0;
  v_now        timestamptz := now();
begin
  select c.* into v_course
  from enrollments e join courses c on c.id = e.course_id
  where e.id = p_enrollment_id
  for update of e;
  if not found then raise exception 'enrollment_not_found'; end if;

  select * into v_video from videos where id = p_video_id and course_id = v_course.id;
  if not found then raise exception 'video_not_in_course'; end if;
  if v_course.status <> 'published' then raise exception 'course_not_open'; end if;
  if v_course.due_at is not null and v_now > v_course.due_at then raise exception 'past_due'; end if;

  -- Order: every earlier video must be complete.
  if exists (
    select 1 from videos v
    left join video_progress p on p.video_id = v.id and p.enrollment_id = p_enrollment_id
    where v.course_id = v_course.id and v.position < v_video.position and p.completed_at is null
  ) then
    raise exception 'video_locked';
  end if;

  v_total := ceil(v_video.duration_seconds / 5.0)::int;

  select * into v_progress from video_progress
  where enrollment_id = p_enrollment_id and video_id = p_video_id
  for update;

  if not found then
    insert into video_progress (enrollment_id, video_id, watched)
    values (p_enrollment_id, p_video_id, repeat('0', v_total)::bit varying)
    returning * into v_progress;
    v_allowance := 1;
  else
    -- At most what could have played since the last report at 2x speed, plus one.
    v_allowance := floor(extract(epoch from (v_now - coalesce(v_progress.last_reported_at, v_now))) * 2 / 5)::int + 1;
  end if;

  for v_seg in
    select distinct s from unnest(coalesce(p_segments, '{}')) as s
    where s >= 0 and s < v_total
    order by s
  loop
    exit when v_credited >= v_allowance;
    if get_bit(v_progress.watched, v_seg) = 0 then
      v_progress.watched := set_bit(v_progress.watched, v_seg, 1);
      v_credited := v_credited + 1;
    end if;
  end loop;

  v_progress.watched_segments := length(replace(v_progress.watched::text, '0', ''));
  v_progress.last_position_seconds := least(greatest(coalesce(p_position, 0), 0), v_video.duration_seconds);

  if v_progress.completed_at is null and v_progress.watched_segments * 100 >= 80 * v_total then
    v_progress.completed_at := v_now;
    insert into activity_log (action, course_id, enrollment_id, details)
    values ('video.completed', v_course.id, p_enrollment_id, jsonb_build_object('video_id', p_video_id));
  end if;

  update video_progress p
  set watched = v_progress.watched,
      watched_segments = v_progress.watched_segments,
      last_position_seconds = v_progress.last_position_seconds,
      last_reported_at = v_now,
      completed_at = v_progress.completed_at
  where p.enrollment_id = p_enrollment_id and p.video_id = p_video_id;

  -- All videos done: the assessment unlocks.
  if v_progress.completed_at is not null and not exists (
    select 1 from videos v
    left join video_progress p on p.video_id = v.id and p.enrollment_id = p_enrollment_id
    where v.course_id = v_course.id and p.completed_at is null
  ) then
    update enrollments set status = 'videos_done'
    where id = p_enrollment_id and status = 'enrolled';
  end if;

  return query select v_progress.watched_segments, v_total,
                      v_progress.completed_at is not null, v_progress.last_position_seconds;
end;
$$;

-- Starts the assessment, or returns the open attempt (section 9.2).
create function start_attempt(p_enrollment_id uuid)
returns attempts
language plpgsql
set search_path = public
as $$
declare
  v_enrollment enrollments;
  v_course     courses;
  v_attempt    attempts;
begin
  select * into v_enrollment from enrollments where id = p_enrollment_id for update;
  if not found then raise exception 'enrollment_not_found'; end if;

  select * into v_attempt from attempts
  where enrollment_id = p_enrollment_id and status = 'in_progress';
  if found then return v_attempt; end if;

  select * into v_course from courses where id = v_enrollment.course_id;
  if v_course.status <> 'published' then raise exception 'course_not_open'; end if;
  if v_course.due_at is not null and now() > v_course.due_at then raise exception 'past_due'; end if;
  if exists (
    select 1 from videos v
    left join video_progress p on p.video_id = v.id and p.enrollment_id = p_enrollment_id
    where v.course_id = v_course.id and p.completed_at is null
  ) then
    raise exception 'videos_not_done';
  end if;
  if v_enrollment.attempts_used >= v_course.max_attempts then raise exception 'no_attempts_left'; end if;

  insert into attempts (enrollment_id, attempt_no)
  values (p_enrollment_id, v_enrollment.attempts_used + 1)
  returning * into v_attempt;

  update enrollments
  set attempts_used = attempts_used + 1, status = 'assessment_in_progress'
  where id = p_enrollment_id;

  insert into activity_log (actor_user_id, action, course_id, enrollment_id, details)
  values (v_enrollment.user_id, 'attempt.started', v_course.id, p_enrollment_id,
          jsonb_build_object('attempt_id', v_attempt.id, 'attempt_no', v_attempt.attempt_no));

  return v_attempt;
end;
$$;

-- Scores and closes an attempt (sections 9.2 and 9.3). p_answers is the final
-- snapshot: [{"question_id": "...", "selected_option_ids": ["..."]}, ...].
-- NULL keeps the answers already saved (used by auto-submit). Returns the
-- score only; pass/fail is stored for admins.
create function submit_attempt(p_attempt_id uuid, p_answers jsonb, p_reason text default 'learner')
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_attempt     attempts;
  v_enrollment  enrollments;
  v_course      courses;
  v_item        jsonb;
  v_qid         uuid;
  v_selected    uuid[];
  v_score       int;
  v_max         int;
  v_pct         numeric(5,2);
begin
  if p_reason not in ('learner', 'due_date') then raise exception 'bad_reason'; end if;

  select * into v_attempt from attempts where id = p_attempt_id for update;
  if not found then raise exception 'attempt_not_found'; end if;
  if v_attempt.status = 'submitted' then return v_attempt.score_pct; end if;

  select * into v_enrollment from enrollments where id = v_attempt.enrollment_id for update;
  select * into v_course from courses where id = v_enrollment.course_id;

  -- 1. Final answers: every question must belong to this course and every
  --    option to its question.
  if p_answers is not null then
    if jsonb_typeof(p_answers) <> 'array' then raise exception 'bad_answers'; end if;
    for v_item in select * from jsonb_array_elements(p_answers) loop
      v_qid := (v_item->>'question_id')::uuid;
      select coalesce(array_agg(distinct x::uuid), '{}') into v_selected
      from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) as x;

      if not exists (select 1 from questions where id = v_qid and course_id = v_course.id) then
        raise exception 'question_not_in_course';
      end if;
      if exists (
        select 1 from unnest(v_selected) s
        where not exists (select 1 from options o where o.id = s and o.question_id = v_qid)
      ) then
        raise exception 'option_not_in_question';
      end if;

      insert into answers (attempt_id, question_id, selected_option_ids, saved_at)
      values (p_attempt_id, v_qid, v_selected, now())
      on conflict (attempt_id, question_id)
      do update set selected_option_ids = excluded.selected_option_ids, saved_at = excluded.saved_at;
    end loop;
  end if;

  -- 2. Unanswered questions get an empty answer, so every question is scored.
  insert into answers (attempt_id, question_id)
  select p_attempt_id, q.id from questions q
  where q.course_id = v_course.id
  on conflict (attempt_id, question_id) do nothing;

  -- 3. Score (section 9.3): the selected set must equal the correct set.
  --    Single-choice has exactly one correct option, so this covers both types.
  update answers a
  set is_correct = s.correct,
      points_awarded = case when s.correct then s.points else 0 end
  from (
    select a2.id, q.points,
           cardinality(a2.selected_option_ids) > 0
           and (select coalesce(array_agg(x order by x), '{}') from unnest(a2.selected_option_ids) x)
             = (select coalesce(array_agg(o.id order by o.id), '{}') from options o
                where o.question_id = q.id and o.is_correct) as correct
    from answers a2 join questions q on q.id = a2.question_id
    where a2.attempt_id = p_attempt_id
  ) s
  where a.id = s.id;

  select coalesce(sum(a.points_awarded), 0), coalesce(sum(q.points), 0)
  into v_score, v_max
  from answers a join questions q on q.id = a.question_id
  where a.attempt_id = p_attempt_id;

  if v_max = 0 then raise exception 'no_questions'; end if;
  v_pct := round(v_score * 100.0 / v_max, 2);

  update attempts
  set status = 'submitted', submit_reason = p_reason, submitted_at = now(),
      score_points = v_score, max_points = v_max, score_pct = v_pct,
      passed = (v_score * 100 >= v_course.pass_percentage * v_max)
  where id = p_attempt_id;

  update enrollments
  set best_score_pct = greatest(coalesce(best_score_pct, 0), v_pct),
      status = 'completed',
      completed_at = coalesce(completed_at, now())
  where id = v_enrollment.id;

  insert into activity_log (actor_user_id, action, course_id, enrollment_id, details)
  values (case when p_reason = 'learner' then v_enrollment.user_id end, 'attempt.submitted',
          v_course.id, v_enrollment.id,
          jsonb_build_object('attempt_id', p_attempt_id, 'score_pct', v_pct, 'reason', p_reason));

  return v_pct;
end;
$$;

-- Submits open attempts of a course that is past its due date, with their
-- saved answers (section 9.5). Called at the start of learner and admin
-- requests for that course. Returns how many attempts it submitted.
create function auto_submit_overdue(p_course_id uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_attempt_id uuid;
  v_count      int := 0;
begin
  for v_attempt_id in
    select a.id from attempts a
    join enrollments e on e.id = a.enrollment_id
    join courses c on c.id = e.course_id
    where c.id = p_course_id and a.status = 'in_progress'
      and c.due_at is not null and now() > c.due_at
  loop
    perform submit_attempt(v_attempt_id, null, 'due_date');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Nobody but the owner role (the API) may run these (AGENTS.md hard rule 9).
revoke execute on function record_video_progress(uuid, uuid, int[], int) from public, anon, authenticated;
revoke execute on function start_attempt(uuid)                             from public, anon, authenticated;
revoke execute on function submit_attempt(uuid, jsonb, text)               from public, anon, authenticated;
revoke execute on function auto_submit_overdue(uuid)                       from public, anon, authenticated;
