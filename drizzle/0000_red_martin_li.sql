CREATE TABLE `event_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`review_status` text NOT NULL,
	`event_type` text NOT NULL,
	`title_zh` text NOT NULL,
	`what_changed` text NOT NULL,
	`evidence_level` text NOT NULL,
	`confidence` real NOT NULL,
	`needs_review` integer NOT NULL,
	`review_reasons_json` text NOT NULL,
	`source_ids_json` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model_id` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text,
	`review_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_candidates_document` ON `event_candidates` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_event_candidates_review_created` ON `event_candidates` (`review_status`,`created_at`);--> statement-breakpoint
CREATE TABLE `ingestion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`status` text NOT NULL,
	`trigger_kind` text NOT NULL,
	`triggered_by` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`inserted_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ingestion_runs_source_started` ON `ingestion_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_ingestion_runs_status_started` ON `ingestion_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `review_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `event_candidates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_review_actions_candidate_created` ON `review_actions` (`candidate_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`published_at` text NOT NULL,
	`discovered_at` text NOT NULL,
	`content_excerpt` text NOT NULL,
	`content_hash` text NOT NULL,
	`status` text NOT NULL,
	`analysis_started_at` text,
	`analyzed_at` text,
	`analysis_error_code` text,
	`candidate_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_documents_canonical_url` ON `source_documents` (`canonical_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_documents_source_external` ON `source_documents` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_source_documents_status_discovered` ON `source_documents` (`status`,`discovered_at`);--> statement-breakpoint
CREATE INDEX `idx_source_documents_source_published` ON `source_documents` (`source_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`homepage_url` text NOT NULL,
	`feed_url` text NOT NULL,
	`source_type` text NOT NULL,
	`fetch_method` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`frequency_minutes` integer DEFAULT 30 NOT NULL,
	`allowed_hosts_json` text NOT NULL,
	`authorization_status` text NOT NULL,
	`terms_note` text NOT NULL,
	`robots_note` text NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sources_feed_url` ON `sources` (`feed_url`);--> statement-breakpoint
CREATE INDEX `idx_sources_status_priority` ON `sources` (`status`,`priority`);--> statement-breakpoint
PRAGMA optimize;
