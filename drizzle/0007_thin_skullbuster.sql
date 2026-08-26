CREATE TABLE `invite_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`label` text NOT NULL,
	`role` text DEFAULT 'reader' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`max_uses` integer DEFAULT 3 NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`expires_at` text,
	`last_used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invite_codes_hash` ON `invite_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `idx_invite_codes_status_expires` ON `invite_codes` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `invite_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`invite_code_id` text NOT NULL,
	`redeemed_at` text NOT NULL,
	FOREIGN KEY (`invite_code_id`) REFERENCES `invite_codes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_invite_redemptions_code_time` ON `invite_redemptions` (`invite_code_id`,`redeemed_at`);
--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_01', 'ca7e997092838979224cc0d2e23821eaec89765c97f0530edb74b84edcdf35bf', 'Alpha 01', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_02', '4213f290e297cc674df9c53a8cbe970076ed7f139abe00d2fce6a6c672ae70bc', 'Alpha 02', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_03', '4249ffcbd00c4141ce5f49979d6c88679ee1a7f2c298ab2e1cadc1499b455a67', 'Alpha 03', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_04', '6739fc1fb0deaffcf07d106294f1134f9d22998023ce29c85aa0cf4f7664c009', 'Alpha 04', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_05', '0cadefac914a64513dd90e5bb062c6de41eed9b193c76a1bc5beb311593e9796', 'Alpha 05', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_06', '41cd84d2d1792acfec230da44a78325a9b04bb328e8a53597c4e6d1c8ef0b10c', 'Alpha 06', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_07', 'b9a12f3467e2768b06ce7c5a95244c3536d4e959fc480f90b559ee710829d075', 'Alpha 07', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_08', 'a2a50ebfc1b1344863b7343296537ef9649a850f8e5f7808964b9dc4dd918d36', 'Alpha 08', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_09', 'eda6337dd1dafd99bd642afb0900afb10566ca02786d9761725641c3294e570f', 'Alpha 09', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_10', 'ca8c8a36c46e1ddbba223842578581b16351db4f51ce51bac01949a1912e5ba9', 'Alpha 10', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_11', '6a0e994ce1cd605a514581a64a5132117457ebb4040ff0427e68f133b366ce6e', 'Alpha 11', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_12', 'e68c0fa312ba3e4fd394ce6d76024f1226ab79ca85bca7e9d1cd7435446bb3c1', 'Alpha 12', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_13', 'b57ebef25221dce1101cbef763132ab395155b029351466fdf99875defa0c10d', 'Alpha 13', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_14', '9d680386615912833c02c7457dd333f320679d04475715ba45b246067929e36a', 'Alpha 14', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_15', 'a5f766b300209b1839cc3f6169d9c13d7e4e9a27eaf71194a97d5122cfe508f7', 'Alpha 15', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_16', 'd3598ba79a424a04bb5831bdc602c9a0c3edd3093ad0d5b52a63dd4436684931', 'Alpha 16', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_17', 'f34b0920e175508770c80e592f3eb58a66838504e2222989e35e50331f13c2b5', 'Alpha 17', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_18', '76a7684a49d5f785c68296a79db04de01ddd0663396eb021022e1e600cca5087', 'Alpha 18', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_19', '940fe0014b452f53f2c8a326bdb01577b6f8f265b4a41b07adc14d6851c0b9e7', 'Alpha 19', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_alpha_20', '9b6a741cccf1e5ad4916b46dc64fb2bf15de7fe6b70e89afad69625afed01d51', 'Alpha 20', 'reader', 'active', 3, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');--> statement-breakpoint
INSERT INTO `invite_codes` (`id`, `code_hash`, `label`, `role`, `status`, `max_uses`, `use_count`, `expires_at`, `created_at`) VALUES ('inv_admin_01', 'effb8ac1df2ded5796e0454547231d43ae4f4535bfdf4046ade2bf49e0f04393', 'Owner Admin', 'admin', 'active', 10, 0, '2026-09-30T15:59:59.000Z', '2026-08-26T17:45:00.000Z');
