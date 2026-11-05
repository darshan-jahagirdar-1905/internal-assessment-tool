-- Indexes for the four foreign keys the Supabase Advisor lists without one
-- (architecture.md section 13, Phase B status). They speed up the admin
-- tracking, reports and stats (execution step C5) and deletes of parent rows.
create index answers_question_id_idx        on answers (question_id);
create index courses_created_by_idx         on courses (created_by);
create index enrollments_assigned_by_idx    on enrollments (assigned_by);
create index video_progress_video_id_idx    on video_progress (video_id);
