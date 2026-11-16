-- Levels and level quizzes (architecture.md sections 6.1 and 9.8, decided
-- 16 Nov 2026). A course is a path of levels: each level has its videos and a
-- short quiz that must be answered 100% correctly (unlimited tries) before the
-- next level unlocks. Questions with no level make up the final test, which is
-- still scored once as before.

create table levels (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  position   int  not null,
  title      text not null,
  unique (course_id, position)
);

-- Every existing course gets one level holding all of its videos, so courses
-- made before levels keep working unchanged.
insert into levels (course_id, position, title)
select c.id, 1, 'Level 1' from courses c;

alter table videos add column level_id uuid references levels(id) on delete cascade;
update videos v set level_id = l.id from levels l where l.course_id = v.course_id and l.position = 1;
alter table videos alter column level_id set not null;
create index videos_level_id_idx on videos (level_id);

-- A question with a level belongs to that level's quiz; with none, to the
-- final test. Existing questions stay final-test questions.
alter table questions add column level_id uuid references levels(id) on delete cascade;
create index questions_level_id_idx on questions (level_id);

-- Every try at a level quiz. answers = [{question_id, selected_option_ids}].
create table level_quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  enrollment_id   uuid not null references enrollments(id),
  level_id        uuid not null references levels(id) on delete cascade,
  attempt_no      int  not null,
  answers         jsonb not null default '[]',
  correct_count   int  not null,
  question_count  int  not null,
  passed          boolean not null,
  submitted_at    timestamptz not null default now(),
  unique (enrollment_id, level_id, attempt_no)
);
create index level_quiz_attempts_level_id_idx on level_quiz_attempts (level_id);

alter table levels              enable row level security;
alter table level_quiz_attempts enable row level security;
revoke all on levels, level_quiz_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------

-- A level counts as passed when it has no quiz questions, or when a try at its
-- quiz got every question right.
create function level_passed(p_enrollment_id uuid, p_level_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (select 1 from questions q where q.level_id = p_level_id)
      or exists (select 1 from level_quiz_attempts a
                 where a.enrollment_id = p_enrollment_id and a.level_id = p_level_id and a.passed);
$$;

-- Same as before, plus: a video is locked until every earlier level is passed.
create or replace function record_video_progress(
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

  -- Order: every earlier video must be complete, and every earlier level passed.
  if exists (
    select 1 from videos v
    left join video_progress p on p.video_id = v.id and p.enrollment_id = p_enrollment_id
    where v.course_id = v_course.id and v.position < v_video.position and p.completed_at is null
  ) or exists (
    select 1 from levels l
    where l.course_id = v_course.id
      and l.position < (select position from levels where id = v_video.level_id)
      and not level_passed(p_enrollment_id, l.id)
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

  -- All videos done.
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

-- Scores one try at a level quiz (section 9.8). Unlimited tries; passing
-- needs every question right. Returns which questions were wrong, never which
-- option is correct.
create function submit_level_quiz(p_enrollment_id uuid, p_level_id uuid, p_answers jsonb)
returns table (correct_count int, question_count int, passed boolean, wrong_question_ids uuid[])
language plpgsql
set search_path = public
as $$
declare
  v_course    courses;
  v_level     levels;
  v_item      jsonb;
  v_qid       uuid;
  v_selected  uuid[];
  v_total     int;
  v_correct   int;
  v_wrong     uuid[];
  v_attempt   int;
begin
  select c.* into v_course
  from enrollments e join courses c on c.id = e.course_id
  where e.id = p_enrollment_id
  for update of e;
  if not found then raise exception 'enrollment_not_found'; end if;

  select * into v_level from levels where id = p_level_id and course_id = v_course.id;
  if not found then raise exception 'level_not_in_course'; end if;
  if v_course.status <> 'published' then raise exception 'course_not_open'; end if;
  if v_course.due_at is not null and now() > v_course.due_at then raise exception 'past_due'; end if;

  if exists (
    select 1 from levels l
    where l.course_id = v_course.id and l.position < v_level.position
      and not level_passed(p_enrollment_id, l.id)
  ) then
    raise exception 'level_locked';
  end if;
  if exists (
    select 1 from videos v
    left join video_progress p on p.video_id = v.id and p.enrollment_id = p_enrollment_id
    where v.level_id = p_level_id and p.completed_at is null
  ) then
    raise exception 'videos_not_done';
  end if;

  select count(*) into v_total from questions where level_id = p_level_id;
  if v_total = 0 then raise exception 'no_questions'; end if;

  -- Every answer must be for a question of this level, with its own options.
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then raise exception 'bad_answers'; end if;
  for v_item in select * from jsonb_array_elements(p_answers) loop
    v_qid := (v_item->>'question_id')::uuid;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_selected
    from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) as x;
    if not exists (select 1 from questions where id = v_qid and level_id = p_level_id) then
      raise exception 'question_not_in_level';
    end if;
    if exists (
      select 1 from unnest(v_selected) s
      where not exists (select 1 from options o where o.id = s and o.question_id = v_qid)
    ) then
      raise exception 'option_not_in_question';
    end if;
  end loop;

  -- A question is right when the selected set equals the correct set.
  select count(*) filter (where s.correct)::int,
         coalesce(array_agg(s.id order by s.position) filter (where not s.correct), '{}')
  into v_correct, v_wrong
  from (
    select q.id, q.position,
           coalesce(cardinality(sel.selected), 0) > 0
           and (select coalesce(array_agg(x order by x), '{}') from unnest(sel.selected) x)
             = (select coalesce(array_agg(o.id order by o.id), '{}') from options o
                where o.question_id = q.id and o.is_correct) as correct
    from questions q
    left join (
      select distinct on ((e->>'question_id')::uuid) (e->>'question_id')::uuid as question_id,
             array(select distinct x::uuid from jsonb_array_elements_text(coalesce(e->'selected_option_ids', '[]'::jsonb)) x) as selected
      from jsonb_array_elements(p_answers) with ordinality as t(e, n)
      order by (e->>'question_id')::uuid, n desc
    ) sel on sel.question_id = q.id
    where q.level_id = p_level_id
  ) s;

  select coalesce(max(attempt_no), 0) + 1 into v_attempt
  from level_quiz_attempts where enrollment_id = p_enrollment_id and level_id = p_level_id;

  insert into level_quiz_attempts (enrollment_id, level_id, attempt_no, answers, correct_count, question_count, passed)
  values (p_enrollment_id, p_level_id, v_attempt, p_answers, v_correct, v_total, v_correct = v_total);

  insert into activity_log (actor_user_id, action, course_id, enrollment_id, details)
  select e.user_id, 'level_quiz.submitted', v_course.id, p_enrollment_id,
         jsonb_build_object('level_id', p_level_id, 'attempt_no', v_attempt,
                            'correct', v_correct, 'total', v_total, 'passed', v_correct = v_total)
  from enrollments e where e.id = p_enrollment_id;

  return query select v_correct, v_total, v_correct = v_total, v_wrong;
end;
$$;

-- Same as before, plus: the final test needs every level passed.
create or replace function start_attempt(p_enrollment_id uuid)
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
  if exists (
    select 1 from levels l
    where l.course_id = v_course.id and not level_passed(p_enrollment_id, l.id)
  ) then
    raise exception 'levels_not_passed';
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

-- Same as before, but only final-test questions (no level) are answered and
-- scored.
create or replace function submit_attempt(p_attempt_id uuid, p_answers jsonb, p_reason text default 'learner')
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

  if p_answers is not null then
    if jsonb_typeof(p_answers) <> 'array' then raise exception 'bad_answers'; end if;
    for v_item in select * from jsonb_array_elements(p_answers) loop
      v_qid := (v_item->>'question_id')::uuid;
      select coalesce(array_agg(distinct x::uuid), '{}') into v_selected
      from jsonb_array_elements_text(coalesce(v_item->'selected_option_ids', '[]'::jsonb)) as x;

      if not exists (select 1 from questions where id = v_qid and course_id = v_course.id and level_id is null) then
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

  insert into answers (attempt_id, question_id)
  select p_attempt_id, q.id from questions q
  where q.course_id = v_course.id and q.level_id is null
  on conflict (attempt_id, question_id) do nothing;

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
      score_points = v_score, max_points = v_max, score_pct = v_pct
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

-- Nobody but the owner role (the API) may run these (AGENTS.md hard rule 9).
revoke execute on function level_passed(uuid, uuid)                         from public, anon, authenticated;
revoke execute on function record_video_progress(uuid, uuid, int[], int)    from public, anon, authenticated;
revoke execute on function submit_level_quiz(uuid, uuid, jsonb)             from public, anon, authenticated;
revoke execute on function start_attempt(uuid)                             from public, anon, authenticated;
revoke execute on function submit_attempt(uuid, jsonb, text)               from public, anon, authenticated;
