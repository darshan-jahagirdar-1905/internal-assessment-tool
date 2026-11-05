-- Pass/fail is no longer stored (architecture.md section 9.3, decided 4 Nov
-- 2026): admin views compute it from the score and the course's CURRENT pass
-- mark, so admins can change the pass mark after publishing.

alter table attempts drop column passed;

-- Same as before, minus writing "passed".
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

  insert into answers (attempt_id, question_id)
  select p_attempt_id, q.id from questions q
  where q.course_id = v_course.id
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

revoke execute on function submit_attempt(uuid, jsonb, text) from public, anon, authenticated;
