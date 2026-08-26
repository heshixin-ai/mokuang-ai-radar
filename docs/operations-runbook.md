# 模况上线运行手册

## 发布前

1. 运行 `npm ci && npm test && npm run lint && npm run build`。
2. 在目标 D1 执行全部 `drizzle/` 迁移并检查 `/api/v1/health` 返回 `ok`。
3. 设置 `REVIEW_AUTH_MODE=chatgpt` 与 `REVIEW_ADMIN_EMAILS`，确认未授权账号不能进入 `/review`。
4. 将 AI、Resend Key 保存为托管 Secret，不写入仓库或前端；设置已验证域名的 `EMAIL_FROM` 和 HTTPS `PUBLIC_SITE_URL`。
5. 用测试订阅走完确认、日报 outbox/发送和退订；用一条草稿走完修订、发布、撤下和重新发布。

Sites 生产环境的单次分析请求有明确执行期限。当前使用 `AI_TIMEOUT_MS=30000` 与 `AI_MAX_RETRIES=0`：高能力模型超时后立即回退，失败内容保留为可重试状态，避免长重试占满整个请求窗口。

如需受控服务端自动化审核，可配置至少 32 字符的 `REVIEW_AUTOMATION_TOKEN` 托管 Secret，并通过标准 Bearer 头调用审核 API。该身份只用于可审计的内部操作，不能替代浏览器 ChatGPT 登录和 `REVIEW_ADMIN_EMAILS` 白名单。

不要只根据构建产物中的 `triggers.crons` 判断线上 Cron 已启用。当前 Sites 公测环境在 2026-08-26 的实测中没有执行 Worker scheduled handler；上线无人值守更新前，必须在目标平台观察到 scheduled 日志和 D1 `ingestion_runs.trigger_kind=scheduled` 记录。若 Sites 仍不支持后台调度，应使用外部调度器或迁移到明确支持 Cron Trigger 的托管平台。

外部调度器先调用 `POST /api/v1/admin/refresh`，再调用 `POST /api/v1/admin/auto-publish`，不得循环调用单来源或单候选接口。生产使用私有 GitHub Actions 请求每 5 分钟触发一次，但 GitHub `schedule` 可能延迟，不能当作精确计时器。当前生产容量为每轮最多抓取 30 个到期来源、并发 5 个、分析 10 篇（最多 3 路并发），自动跳过超过 14 天仍未分析的旧内容，并优先处理中国来源；通过安全门禁时最多发布 5 条。采集批量由 `EXTERNAL_REFRESH_*` 限制，自动发布批量由 `AUTO_PUBLISH_*` 限制。私有 Sites 请求需要同时携带 Sites 访问绕过 Token 和审核自动化 Token，两者必须作为仓库 Actions Secret 保存。轮换任一 Token 后，应先手动运行工作流，再观察一个真实定时点；日志和文档不得记录 Token 明文。

本地和未验证环境的 `AUTO_PUBLISH_MODE` 默认必须为 `off`；生产经真实候选验证后设为 `safe`，最低置信度为 `0.80`。符合官方来源、事件类型、引用、结构、无冲突与置信度门禁的事件无需人工确认，由定时任务自动发布；未通过门禁的内容自动拦截。发生重大错误时立即切回 `off`，并由管理员撤下错误事件。

GitHub `schedule` 不是精确计时器，可能延迟或丢弃。每日检查时应同时查看 Actions 最近一次 `schedule` 成功时间和 D1 最近一次 `trigger_kind=scheduled` 时间；超过 30 分钟没有成功运行时，先手动触发工作流恢复数据更新，再检查默认分支、工作流 active 状态和 GitHub Actions 服务状态。

## 每日检查

- `/review/operations` 是否出现连续 3 次来源失败、邮件失败或观测不足。
- 待分析候选、聚类冲突和被门禁阻断草稿是否异常积压。
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
