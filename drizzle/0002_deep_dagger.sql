CREATE TABLE `event_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`document_id` text NOT NULL,
	`claim` text NOT NULL,
	`supports_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_event_citations_event` ON `event_citations` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_event_citations_document` ON `event_citations` (`document_id`);--> statement-breakpoint
CREATE TABLE `event_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`document_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_sources_event_document` ON `event_sources` (`event_id`,`document_id`);--> statement-breakpoint
CREATE INDEX `idx_event_sources_document` ON `event_sources` (`document_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`event_type` text NOT NULL,
	`title_zh` text NOT NULL,
	`deck_zh` text NOT NULL,
	`what_changed` text NOT NULL,
	`before_text` text,
	`after_text` text,
	`why_it_matters` text NOT NULL,
	`recommended_action` text,
	`affected_roles_json` text NOT NULL,
	`evidence_level` text NOT NULL,
	`confidence` real NOT NULL,
	`needs_review` integer NOT NULL,
	`review_reasons_json` text NOT NULL,
	`announced_at` text,
	`effective_at` text,
	`quality_status` text NOT NULL,
	`quality_issues_json` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model_id` text NOT NULL,
	`provider` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`published_at` text,
	`published_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `event_candidates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_candidate` ON `events` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `idx_events_status_updated` ON `events` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_events_published_at` ON `events` (`published_at`);--> statement-breakpoint
CREATE TABLE `publication_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`note` text,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_publication_actions_event_created` ON `publication_actions` (`event_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
