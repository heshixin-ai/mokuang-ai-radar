CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_entities_slug` ON `entities` (`slug`);--> statement-breakpoint
CREATE TABLE `event_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_entities_event_entity` ON `event_entities` (`event_id`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_event_entities_entity` ON `event_entities` (`entity_id`);--> statement-breakpoint
CREATE TABLE `event_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`note` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_revisions_event_number` ON `event_revisions` (`event_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX `idx_event_revisions_event_created` ON `event_revisions` (`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `event_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_topics_event_slug` ON `event_topics` (`event_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_event_topics_slug` ON `event_topics` (`slug`);--> statement-breakpoint
INSERT INTO `event_revisions` (`id`, `event_id`, `revision_number`, `actor_id`, `actor_email`, `note`, `snapshot_json`, `created_at`)
SELECT 'rev_backfill_' || `id`, `id`, 1, 'system-migration', 'system@mokuang.local', '迁移既有正式草稿为初始版本。',
  json_object('titleZh', `title_zh`, 'deckZh', `deck_zh`, 'qualityStatus', `quality_status`), `created_at` FROM `events`;--> statement-breakpoint
INSERT INTO `event_topics` (`id`, `event_id`, `slug`, `label`, `created_at`)
SELECT 'topic_backfill_' || `id`, `id`, `event_type`, CASE `event_type`
  WHEN 'model_release' THEN '模型发布' WHEN 'api_change' THEN 'API 变化' WHEN 'pricing' THEN '价格变化'
  WHEN 'policy' THEN '政策' WHEN 'funding' THEN '融资' WHEN 'research' THEN '研究' ELSE `event_type` END, `created_at` FROM `events`;--> statement-breakpoint
INSERT INTO `entities` VALUES
  ('entity_openai', 'openai', 'OpenAI', 'company', 'AI 模型与产品公司。', datetime('now'), datetime('now')),
  ('entity_anthropic', 'anthropic', 'Anthropic', 'company', 'Claude 系列模型开发商。', datetime('now'), datetime('now')),
  ('entity_google', 'google', 'Google', 'company', 'Gemini 与 AI 平台提供方。', datetime('now'), datetime('now')),
  ('entity_deepseek', 'deepseek', 'DeepSeek', 'company', '基础模型与 API 提供方。', datetime('now'), datetime('now')),
  ('entity_vllm', 'vllm', 'vLLM', 'project', '开源大模型推理与服务项目。', datetime('now'), datetime('now')),
  ('entity_meta', 'meta', 'Meta', 'company', 'Llama 系列模型开发方。', datetime('now'), datetime('now'));--> statement-breakpoint
INSERT INTO `event_entities` (`id`, `event_id`, `entity_id`, `created_at`)
SELECT 'ee_openai_' || e.id, e.id, 'entity_openai', e.created_at FROM events e
WHERE lower(e.title_zh) LIKE '%openai%' OR lower(e.title_zh) LIKE '%gpt%';--> statement-breakpoint
INSERT INTO `event_entities` (`id`, `event_id`, `entity_id`, `created_at`)
SELECT 'ee_vllm_' || e.id, e.id, 'entity_vllm', e.created_at FROM events e WHERE lower(e.title_zh) LIKE '%vllm%';--> statement-breakpoint
PRAGMA optimize;
