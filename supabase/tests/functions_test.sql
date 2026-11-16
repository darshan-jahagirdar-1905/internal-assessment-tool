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
  l1 uuid; c3_id uuid; l3a uuid; l3b uuid; v3a uuid; v3b uuid; e3_id uuid;
  lq1 uuid; lq1r uuid; lq1w uuid; lq2 uuid; lq2r uuid; lq2w uuid; lq3 uuid; lq3r uuid; fq1 uuid; fq1r uuid;
begin
  -- Setup: one learner, a published course (pass 60%), two 20-second videos
  -- (4 segments each), a single-choice and a multiple-choice question.
  insert into users (email) values ('learner@transfunnel.com') returning id into u_id;
  insert into courses (title, pass_percentage, status) values ('Test course', 60, 'published') returning id into c_id;
  -- One level with no quiz questions: it counts as passed, like a course made before levels.
  insert into levels (course_id, position, title) values (c_id, 1, 'Level 1') returning id into l1;
  insert into videos (course_id, level_id, position, title, youtube_video_id, duration_seconds) values (c_id, l1, 1, 'V1', 'aaa', 20) returning id into v1;
  insert into videos (course_id, level_id, position, title, youtube_video_id, duration_seconds) values (c_id, l1, 2, 'V2', 'bbb', 20) returning id into v2;
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
  assert r.status = 'submitted' and r.submit_reason = 'learner' and r.score_points = 1 and r.max_points = 2,
    'attempt should be submitted with 1/2 points';
  -- Pass/fail is computed from the current pass mark (60%): 1/2 fails.
  assert not (r.score_points * 100 >= (select pass_percentage from courses where id = c_id) * r.max_points), '50% should fail a 60% pass mark';
  -- Lowering the pass mark after publishing flips pass/fail; the score stays.
  update courses set pass_percentage = 50 where id = c_id;
  assert (r.score_points * 100 >= (select pass_percentage from courses where id = c_id) * r.max_points), '50% should pass once the mark is 50%';
  assert (select score_pct from attempts where id = a_id) = 50.00, 'changing the pass mark never changes the score';
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
  assert r.score_points * 100 >= (select pass_percentage from courses where id = c2_id) * r.max_points, '50% must pass an exactly-50% pass mark';
  assert (select points_awarded from answers where attempt_id = a_id and question_id = q2) = 0, 'unanswered scores 0';

  -- Past due: no new video credit or attempt.
  failed := false;
  begin perform start_attempt(e2_id);
  exception when others then failed := sqlerrm in ('past_due', 'no_attempts_left'); end;
  assert failed, 'no attempt after the due date';


  -- Third course: two levels, each with one 5-second video (1 segment) and a
  -- quiz, plus one final-test question (architecture.md 9.8).
  insert into courses (title, pass_percentage, status) values ('Levels course', 70, 'published') returning id into c3_id;
  insert into levels (course_id, position, title) values (c3_id, 1, 'Speaking') returning id into l3a;
  insert into levels (course_id, position, title) values (c3_id, 2, 'Email') returning id into l3b;
  insert into videos (course_id, level_id, position, title, youtube_video_id, duration_seconds) values (c3_id, l3a, 1, 'VA', 'ccc', 5) returning id into v3a;
  insert into videos (course_id, level_id, position, title, youtube_video_id, duration_seconds) values (c3_id, l3b, 2, 'VB', 'ddd', 5) returning id into v3b;
  insert into questions (course_id, level_id, position, text, type) values (c3_id, l3a, 1, 'LQ1', 'single') returning id into lq1;
  insert into options (question_id, position, text, is_correct) values (lq1, 1, 'right', true) returning id into lq1r;
  insert into options (question_id, position, text, is_correct) values (lq1, 2, 'wrong', false) returning id into lq1w;
  insert into questions (course_id, level_id, position, text, type) values (c3_id, l3a, 2, 'LQ2', 'single') returning id into lq2;
  insert into options (question_id, position, text, is_correct) values (lq2, 1, 'right', true) returning id into lq2r;
  insert into options (question_id, position, text, is_correct) values (lq2, 2, 'wrong', false) returning id into lq2w;
  insert into questions (course_id, level_id, position, text, type) values (c3_id, l3b, 3, 'LQ3', 'single') returning id into lq3;
  insert into options (question_id, position, text, is_correct) values (lq3, 1, 'right', true) returning id into lq3r;
  insert into questions (course_id, position, text, type) values (c3_id, 4, 'FQ1', 'single') returning id into fq1;
  insert into options (question_id, position, text, is_correct) values (fq1, 1, 'right', true) returning id into fq1r;
  insert into enrollments (course_id, user_id, source) values (c3_id, u_id, 'self') returning id into e3_id;

  -- The level quiz needs the level's videos watched first.
  failed := false;
  begin perform submit_level_quiz(e3_id, l3a, '[]'::jsonb);
  exception when others then failed := sqlerrm = 'videos_not_done'; end;
  assert failed, 'level quiz should wait for the level videos';

  select * into r from record_video_progress(e3_id, v3a, '{0}', 5);
  assert r.completed, 'a 5-second video completes with its one segment';

  -- Level 2's video stays locked until level 1's quiz is passed.
  failed := false;
  begin perform record_video_progress(e3_id, v3b, '{0}', 0);
  exception when others then failed := sqlerrm = 'video_locked'; end;
  assert failed, 'level 2 video should be locked before level 1 is passed';
  failed := false;
  begin perform submit_level_quiz(e3_id, l3b, '[]'::jsonb);
  exception when others then failed := sqlerrm = 'level_locked'; end;
  assert failed, 'level 2 quiz should be locked before level 1 is passed';

  -- A question from another level is refused.
  failed := false;
  begin perform submit_level_quiz(e3_id, l3a, jsonb_build_array(jsonb_build_object('question_id', lq3, 'selected_option_ids', jsonb_build_array(lq3r))));
  exception when others then failed := sqlerrm = 'question_not_in_level'; end;
  assert failed, 'answers must be for questions of this level';

  -- Try 1: one right, one wrong. Not passed; the wrong question is named.
  select * into r from submit_level_quiz(e3_id, l3a, jsonb_build_array(
    jsonb_build_object('question_id', lq1, 'selected_option_ids', jsonb_build_array(lq1r)),
    jsonb_build_object('question_id', lq2, 'selected_option_ids', jsonb_build_array(lq2w))));
  assert r.correct_count = 1 and r.question_count = 2 and not r.passed, 'try 1 should be 1 of 2, not passed';
  assert r.wrong_question_ids = array[lq2], 'try 1 should name LQ2 as wrong';
  assert not level_passed(e3_id, l3a), 'level 1 is not passed after a wrong try';

  -- Try 2: an unanswered question counts as wrong.
  select * into r from submit_level_quiz(e3_id, l3a, jsonb_build_array(
    jsonb_build_object('question_id', lq1, 'selected_option_ids', jsonb_build_array(lq1r))));
  assert not r.passed and r.wrong_question_ids = array[lq2], 'unanswered counts as wrong';

  -- Try 3: all right. Passed; tries are numbered.
  select * into r from submit_level_quiz(e3_id, l3a, jsonb_build_array(
    jsonb_build_object('question_id', lq1, 'selected_option_ids', jsonb_build_array(lq1r)),
    jsonb_build_object('question_id', lq2, 'selected_option_ids', jsonb_build_array(lq2r))));
  assert r.passed and r.correct_count = 2 and r.wrong_question_ids = '{}', 'try 3 should pass';
  assert (select max(attempt_no) from level_quiz_attempts where enrollment_id = e3_id and level_id = l3a) = 3, 'three tries recorded';
  assert level_passed(e3_id, l3a), 'level 1 is passed';

  -- Level 2 unlocks. With its video watched but its quiz not passed, the final test stays locked.
  select * into r from record_video_progress(e3_id, v3b, '{0}', 5);
  assert r.completed, 'level 2 video completes once level 1 is passed';
  failed := false;
  begin perform start_attempt(e3_id);
  exception when others then failed := sqlerrm = 'levels_not_passed'; end;
  assert failed, 'final test should wait for every level';

  select * into r from submit_level_quiz(e3_id, l3b, jsonb_build_array(
    jsonb_build_object('question_id', lq3, 'selected_option_ids', jsonb_build_array(lq3r))));
  assert r.passed, 'level 2 quiz passes';

  -- Final test: only final questions count; level questions are refused.
  select id into a_id from start_attempt(e3_id);
  failed := false;
  begin perform submit_attempt(a_id, jsonb_build_array(jsonb_build_object('question_id', lq1, 'selected_option_ids', jsonb_build_array(lq1r))));
  exception when others then failed := sqlerrm = 'question_not_in_course'; end;
  assert failed, 'level questions are not part of the final test';
  s := submit_attempt(a_id, jsonb_build_array(jsonb_build_object('question_id', fq1, 'selected_option_ids', jsonb_build_array(fq1r))));
  assert s = 100.00, format('final test score %s, expected 100.00', s);
  assert (select max_points from attempts where id = a_id) = 1, 'final test scores only the 1 final question';
  assert (select count(*) from answers where attempt_id = a_id) = 1, 'only final questions get answer rows';
  assert (select count(*) from activity_log where action = 'level_quiz.submitted' and enrollment_id = e3_id) = 4, 'four level quiz tries logged';

  -- Activity log recorded the key events.
  assert (select count(*) from activity_log where action = 'video.completed') = 4, 'four video.completed events';
  assert (select count(*) from activity_log where action = 'attempt.submitted') = 3, 'three attempt.submitted events';

  raise notice 'All function tests passed';
end $$;

rollback;
