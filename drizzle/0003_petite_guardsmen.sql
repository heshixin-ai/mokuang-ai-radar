CREATE TABLE `candidate_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`action` text NOT NULL,
	`target_event_id` text,
	`similarity` real NOT NULL,
	`reasons_json` text NOT NULL,
	`status` text NOT NULL,
	`decided_by` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text,
	`review_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `event_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidate_clusters_candidate` ON `candidate_clusters` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `idx_candidate_clusters_status_created` ON `candidate_clusters` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_candidate_clusters_target` ON `candidate_clusters` (`target_event_id`);--> statement-breakpoint
CREATE TABLE `event_candidate_links` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`link_kind` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `event_candidates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_candidate_links_candidate` ON `event_candidate_links` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `idx_event_candidate_links_event` ON `event_candidate_links` (`event_id`);--> statement-breakpoint
INSERT INTO `event_candidate_links` (`id`, `event_id`, `candidate_id`, `link_kind`, `created_at`)
SELECT 'ecl_backfill_' || `id`, `id`, `candidate_id`, 'primary', `created_at` FROM `events`;--> statement-breakpoint
PRAGMA optimize;
