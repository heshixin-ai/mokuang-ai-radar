ALTER TABLE `event_candidates` ADD `provider` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `event_candidates` ADD `escalated` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event_candidates` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event_candidates` ADD `latency_ms` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event_candidates` ADD `input_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event_candidates` ADD `output_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event_candidates` ADD `total_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event_candidates` ADD `reasoning_tokens` integer DEFAULT 0 NOT NULL;