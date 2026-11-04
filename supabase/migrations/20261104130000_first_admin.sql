-- First admin (architecture.md section 4.1, execution step B4). Real sign-in
-- (WorkOS) matches this row by email on first sign-in and fills auth_subject.
-- Later admins are promoted from the admin screens.
insert into users (email, full_name, role)
values ('darshanj@transfunnel.com', 'Darshan', 'admin')
on conflict (email) do update set role = 'admin';
