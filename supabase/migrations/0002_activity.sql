-- Activity log: every change gets an action and a one-line summary.
-- Run after 0001_init.sql (safe to run on an existing project).
alter table edits add column if not exists action  text not null default 'update';
alter table edits add column if not exists summary text not null default '';
