CREATE TABLE `digest_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`digest_date` text NOT NULL,
	`status` text NOT NULL,
	`subscriber_count` integer DEFAULT 0 NOT NULL,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_digest_runs_date` ON `digest_runs` (`digest_date`);--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`subscriber_id` text NOT NULL,
	`kind` text NOT NULL,
	`to_email` text NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_email_outbox_dedupe` ON `email_outbox` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_email_outbox_status_created` ON `email_outbox` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`normalized_email` text NOT NULL,
	`status` text NOT NULL,
	`verify_token_hash` text NOT NULL,
	`unsubscribe_token` text NOT NULL,
	`unsubscribe_token_hash` text NOT NULL,
	`consent_at` text NOT NULL,
	`verified_at` text,
	`unsubscribed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subscribers_normalized_email` ON `subscribers` (`normalized_email`);--> statement-breakpoint
CREATE INDEX `idx_subscribers_status_updated` ON `subscribers` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `subscription_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`subscriber_id` text NOT NULL,
	`topic_slug` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subscription_preferences_subscriber_topic` ON `subscription_preferences` (`subscriber_id`,`topic_slug`);--> statement-breakpoint
CREATE INDEX `idx_subscription_preferences_topic` ON `subscription_preferences` (`topic_slug`);--> statement-breakpoint
PRAGMA optimize;
