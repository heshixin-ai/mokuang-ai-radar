CREATE TABLE `feedback_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`email` text NOT NULL,
	`event_id` text,
	`message` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_requests_status_created` ON `feedback_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_feedback_requests_event` ON `feedback_requests` (`event_id`);--> statement-breakpoint
PRAGMA optimize;
