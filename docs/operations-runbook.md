# 模况上线运行手册

## 发布前

1. 运行 `npm ci && npm test && npm run lint && npm run build`。
2. 在目标 D1 执行全部 `drizzle/` 迁移并检查 `/api/v1/health` 返回 `ok`。
3. 设置 `REVIEW_AUTH_MODE=chatgpt` 与 `REVIEW_ADMIN_EMAILS`，确认未授权账号不能进入 `/review`。
4. 将 AI、Resend Key 保存为托管 Secret，不写入仓库或前端；设置已验证域名的 `EMAIL_FROM` 和 HTTPS `PUBLIC_SITE_URL`。
5. 用测试订阅走完确认、日报 outbox/发送和退订；用一条草稿走完修订、发布、撤下和重新发布。

Sites 生产环境的单次审核请求有明确执行期限。当前使用 `AI_TIMEOUT_MS=12000` 与 `AI_MAX_RETRIES=0`：高能力模型超时后立即回退，失败内容保留给人工重试，避免长重试占满整个请求窗口。

如需受控服务端自动化审核，可配置至少 32 字符的 `REVIEW_AUTOMATION_TOKEN` 托管 Secret，并通过标准 Bearer 头调用审核 API。该身份只用于可审计的内部操作，不能替代浏览器 ChatGPT 登录和 `REVIEW_ADMIN_EMAILS` 白名单。

不要只根据构建产物中的 `triggers.crons` 判断线上 Cron 已启用。当前 Sites 公测环境在 2026-08-26 的实测中没有执行 Worker scheduled handler；上线无人值守更新前，必须在目标平台观察到 scheduled 日志和 D1 `ingestion_runs.trigger_kind=scheduled` 记录。若 Sites 仍不支持后台调度，应使用外部调度器或迁移到明确支持 Cron Trigger 的托管平台。

## 每日检查

- `/review/operations` 是否出现连续 3 次来源失败、邮件失败或观测不足。
- 待审核候选、聚类建议和被门禁阻断草稿是否积压。
- 日报是否每天只有一条 `digest_run`，每位订阅者是否只有一个 dedupe key。

## 故障处理

- 来源连续失败：暂停该来源，检查授权、robots、Feed 地址与解析变化；不临时放宽通用抓取白名单。
- AI 失败：保留文档为可重试状态，检查限流和输出契约；不要把 mock 结果发布。
- 邮件失败：保留 outbox 失败记录，修复 Key/域名后重试；不得把失败状态改成已发送。
- 错误发布：先撤下，记录原因，修订并重新通过质量门禁；不要直接改数据库抹掉审计。

## 回滚

- 代码按 `stage/*` 分支与合并提交回退；数据库迁移默认只向前修复，不执行破坏性降级。
- 发布前导出 D1 备份；涉及订阅者和审计数据的恢复需保持原 ID 与唯一去重键。

## 尚需真实时间完成

来源成功率必须在部署后连续观测满 7 天。`/review/operations` 会显示实际起点与天数，未满时不得宣称通过该验收项。
