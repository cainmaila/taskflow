-- D49: task_parent 只存真正的 parent；移除第 3 步寫入的「個人根 → 任務」關聯
DELETE FROM `task_parent` WHERE `parent_id` IN (SELECT `id` FROM `task` WHERE `root_owner_id` IS NOT NULL);--> statement-breakpoint
-- 資料庫層護欄：個人根不能當 parent／child，也不能自己掛自己
CREATE TRIGGER `task_parent_guard` BEFORE INSERT ON `task_parent` WHEN NEW.`parent_id` = NEW.`child_id` OR EXISTS (SELECT 1 FROM `task` WHERE `id` IN (NEW.`parent_id`, NEW.`child_id`) AND `root_owner_id` IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'invalid task_parent link'); END;
