-- Tests for the database functions (architecture.md section 9). Runs in one
-- transaction and rolls back, so it is safe on any database that has the
-- schema. CI runs it after the migrations; it raises on the first failure.
begin;

do $$
declare
  u_id uuid; c_id uuid; c2_id uuid; v1 uuid; v2 uuid; q1 uuid; q2 uuid;
  o1a uuid; o1b uuid; o2a uuid; o2b uuid; o2c uuid;
  e_id uuid; e2_id uuid; a_id uuid; a2_id uuid;
  r record; s numeric; n int;
  failed boolean;
begin
  -- Setup: one learner, a published course (pass 60%), two 20-second videos
  -- (4 segments each), a single-choice and a multiple-choice question.
  insert into users (email) values ('learner@transfunnel.com') returning id into u_id;
  insert into courses (title, pass_percentage, status) values ('Test course', 60, 'published') returning id into c_id;
  insert into videos (course_id, position, title, youtube_video_id, duration_seconds) values (c_id, 1, 'V1', 'aaa', 20) returning id into v1;
  insert into videos (course_id, position, title, youtube_video_id, duration_seconds) values (c_id, 2, 'V2', 'bbb', 20) returning id into v2;
  insert into questions (course_id, position, text, type) values (c_id, 1, 'Single', 'single') returning id into q1;
  insert into options (question_id, position, text, is_correct) values (q1, 1, 'right', true) returning id into o1a;
  insert into options (question_id, position, text, is_correct) values (q1, 2, 'wrong', false) returning id into o1b;
  insert into questions (course_id, position, text, type) values (c_id, 2, 'Multiple', 'multiple') returning id into q2;
  insert into options (question_id, position, text, is_correct) values (q2, 1, 'right 1', true) returning id into o2a;
  insert into options (question_id, position, text, is_correct) values (q2, 2, 'right 2', true) returning id into o2b;
  insert into options (question_id, position, text, is_correct) values (q2, 3, 'wrong', false) returning id into o2c;
  insert into enrollments (course_id, user_id, source) values (c_id, u_id, 'self') returning id into e_id;

  -- Video order: video 2 is locked until video 1 is complete.
  failed := false;
  begin perform record_video_progress(e_id, v2, '{0}', 0);
  exception when others then failed := sqlerrm = 'video_locked'; end;
  assert failed, 'video 2 should be locked before video 1 is complete';

  -- Assessment is locked until all videos are complete.
  failed := false;
  begin perform start_attempt(e_id);
  exception when others then failed := sqlerrm = 'videos_not_done'; end;
  assert failed, 'start_attempt should refuse before videos are done';

  -- First report credits at most one segment, even if it claims all four.
  select * into r from record_video_progress(e_id, v1, '{0,1,2,3}', 20);
  assert r.watched_segments = 1, format('first report credited %s segments, expected 1', r.watched_segments);
  assert not r.completed, 'video should not be complete after one segment';
  assert r.total_segments = 4, 'a 20-second video has 4 segments';

  -- A second report right away (no time passed) still credits at most one more.
  select * into r from record_video_progress(e_id, v1, '{0,1,2,3}', 20);
  assert r.watched_segments = 2, format('immediate second report: %s segments, expected 2', r.watched_segments);

  -- Out-of-range segments are ignored; the position is clamped to the video length.
  update video_progress set last_reported_at = now() - interval '60 seconds' where enrollment_id = e_id and video_id = v1;
  select * into r from record_video_progress(e_id, v1, '{-1,99}', 500);
  assert r.watched_segments = 2, 'out-of-range segments must not be credited';
  assert r.last_position_seconds = 20, 'position should be clamped to the duration';

  -- After 10 s at 2x, up to 5 new segments may be credited: video 1 completes (4/4).
  update video_progress set last_reported_at = now() - interval '10 seconds' where enrollment_id = e_id and video_id = v1;
  select * into r from record_video_progress(e_id, v1, '{2,3}', 20);
  assert r.watched_segments = 4 and r.completed, 'video 1 should complete at 4/4';

  -- 80% rule on video 2: 3 of 4 segments is 75%, not enough; 4 of 4 completes.
  perform record_video_progress(e_id, v2, '{0}', 5);
  update video_progress set last_reported_at = now() - interval '10 seconds' where enrollment_id = e_id and video_id = v2;
  select * into r from record_video_progress(e_id, v2, '{1,2}', 15);
  assert r.watched_segments = 3 and not r.completed, '75% must not complete a video';
  assert (select status from enrollments where id = e_id) = 'enrolled', 'enrollment stays enrolled until all videos are done';
  update video_progress set last_reported_at = now() - interval '10 seconds' where enrollment_id = e_id and video_id = v2;
  select * into r from record_video_progress(e_id, v2, '{3}', 20);
  assert r.completed, 'video 2 should complete at 4/4';
  assert (select status from enrollments where id = e_id) = 'videos_done', 'enrollment should be videos_done';

  -- Start: creates attempt 1; a second call returns the same open attempt.
  select id into a_id from start_attempt(e_id);
  select id into a2_id from start_attempt(e_id);
  assert a_id = a2_id, 'start_attempt should resume the open attempt';
  assert (select attempts_used from enrollments where id = e_id) = 1, 'attempts_used should be 1';
  assert (select status from enrollments where id = e_id) = 'assessment_in_progress', 'status should be assessment_in_progress';

  -- An option from another question is refused.
  failed := false;
  begin perform submit_attempt(a_id, jsonb_build_array(jsonb_build_object('question_id', q1, 'selected_option_ids', jsonb_build_array(o2a))));
  exception when others then failed := sqlerrm = 'option_not_in_question'; end;
  assert failed, 'options must belong to their question';

  -- Submit: single correct (1 point), multiple only half right (0 points,
  -- all-or-nothing) => 50%, below the 60% pass mark.
  s := submit_attempt(a_id, jsonb_build_array(
         jsonb_build_object('question_id', q1, 'selected_option_ids', jsonb_build_array(o1a)),
         jsonb_build_object('question_id', q2, 'selected_option_ids', jsonb_build_array(o2a))));
  assert s = 50.00, format('score %s, expected 50.00', s);
  select * into r from attempts where id = a_id;
  assert r.status = 'submitted' and r.submit_reason = 'learner' and r.score_points = 1 and r.max_points = 2 and not r.passed,
    'attempt should be submitted with 1/2 points and not passed';
  assert (select is_correct from answers where attempt_id = a_id and question_id = q2) = false, 'partial multiple-choice is wrong';

  -- Double submit returns the stored score and changes nothing.
  s := submit_attempt(a_id, jsonb_build_array(
         jsonb_build_object('question_id', q2, 'selected_option_ids', jsonb_build_array(o2a, o2b))));
  assert s = 50.00, 'second submit should return the stored score';

  select * into r from enrollments where id = e_id;
  assert r.status = 'completed' and r.best_score_pct = 50.00 and r.completed_at is not null, 'enrollment should be completed with best 50';

  -- One attempt only (max_attempts = 1).
  failed := false;
  begin perform start_attempt(e_id);
  exception when others then failed := sqlerrm = 'no_attempts_left'; end;
  assert failed, 'a second attempt should be refused';

  -- Second course: pass mark exactly 50%, no videos; tests the boundary,
  -- unanswered questions and auto-submit at the due date.
  insert into courses (title, pass_percentage, status, due_at)
    values ('Boundary course', 50, 'published', now() + interval '1 day') returning id into c2_id;
  insert into questions (course_id, position, text, type) values (c2_id, 1, 'Q1', 'single') returning id into q1;
  insert into options (question_id, position, text, is_correct) values (q1, 1, 'right', true) returning id into o1a;
  insert into questions (course_id, position, text, type) values (c2_id, 2, 'Q2', 'single') returning id into q2;
  insert into options (question_id, position, text, is_correct) values (q2, 1, 'right', true) returning id into o2a;
  insert into enrollments (course_id, user_id, source) values (c2_id, u_id, 'admin') returning id into e2_id;

  -- A course with no videos can start straight away.
  select id into a_id from start_attempt(e2_id);
  -- Save one correct answer (as the API would), leave Q2 unanswered.
  insert into answers (attempt_id, question_id, selected_option_ids) values (a_id, q1, array[o1a]);

  -- Not past due yet: auto-submit does nothing.
  n := auto_submit_overdue(c2_id);
  assert n = 0, 'nothing is overdue yet';

  -- Past due: auto-submit scores the saved answers; Q2 unanswered = 0 points.
  update courses set due_at = now() - interval '1 minute' where id = c2_id;
  n := auto_submit_overdue(c2_id);
  assert n = 1, format('auto-submit submitted %s attempts, expected 1', n);
  select * into r from attempts where id = a_id;
  assert r.submit_reason = 'due_date' and r.score_pct = 50.00, 'auto-submit should score 50 with reason due_date';
  assert r.passed, '50% must pass an exactly-50% pass mark';
  assert (select points_awarded from answers where attempt_id = a_id and question_id = q2) = 0, 'unanswered scores 0';

  -- Past due: no new video credit or attempt.
  failed := false;
  begin perform start_attempt(e2_id);
  exception when others then failed := sqlerrm in ('past_due', 'no_attempts_left'); end;
  assert failed, 'no attempt after the due date';

  -- Activity log recorded the key events.
  assert (select count(*) from activity_log where action = 'video.completed') = 2, 'two video.completed events';
  assert (select count(*) from activity_log where action = 'attempt.submitted') = 2, 'two attempt.submitted events';

  raise notice 'All function tests passed';
end $$;

rollback;
