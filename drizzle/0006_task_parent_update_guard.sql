-- 與 task_parent_guard 相同的規則，擋住 UPDATE 繞過 INSERT 護欄
CREATE TRIGGER `task_parent_update_guard` BEFORE UPDATE ON `task_parent` WHEN NEW.`parent_id` = NEW.`child_id` OR EXISTS (SELECT 1 FROM `task` WHERE `id` IN (NEW.`parent_id`, NEW.`child_id`) AND `root_owner_id` IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'invalid task_parent link'); END;
