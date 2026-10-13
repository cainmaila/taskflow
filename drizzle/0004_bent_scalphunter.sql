CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`assignee_id` text,
	`start_date` text,
	`due_date` text,
	`created_by` text NOT NULL,
	`root_owner_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`root_owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "task_status_check" CHECK("task"."status" in ('todo','in_progress','pending','done')),
	CONSTRAINT "task_due_date_check" CHECK("task"."root_owner_id" is not null or "task"."due_date" is not null),
	CONSTRAINT "task_date_order_check" CHECK("task"."start_date" is null or "task"."due_date" is null or "task"."start_date" <= "task"."due_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_root_owner_id_unique` ON `task` (`root_owner_id`);--> statement-breakpoint
CREATE TABLE `task_parent` (
	`parent_id` text NOT NULL,
	`child_id` text NOT NULL,
	PRIMARY KEY(`parent_id`, `child_id`),
	FOREIGN KEY (`parent_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade
);
