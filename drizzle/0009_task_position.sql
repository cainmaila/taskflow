ALTER TABLE `task` ADD `position` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- 回填：維持舊的 due_date, created_at 順序（個人根不參與排序）
UPDATE `task` SET `position` = r.rn FROM (SELECT `id`, row_number() OVER (ORDER BY `due_date`, `created_at`, `id`) * 1024.0 AS rn FROM `task` WHERE `root_owner_id` IS NULL) AS r WHERE r.`id` = `task`.`id`;
