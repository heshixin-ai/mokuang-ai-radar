# 模况 Mokuang

面向中文 AI 产品经理、开发者和小型创业团队的产品与模型变更雷达。模况把分散来源整理成带证据、影响判断和建议行动的变化事件。

当前完成 Stage 10 上线准备：真实发布信息流、主题/实体时间线、双重确认日报、运行监控、合成质量回归、健康检查与合规页面已经接通。连续 7 天来源成功率仍必须在实际部署后按监控窗口完成。

## 当前已实现

- 事件信息流和类型筛选
- 事件详情、变化前后、角色影响和建议行动
- 逐条事实引用与证据等级
- `GET /api/v1/events`
- `GET /api/v1/events/:id`
- `POST /api/v1/pipeline/preview`
- 20 个经真实解析验证的 RSS、Atom、Release 与专用公开页面来源
- DeepSeek API 与 Kimi 开放平台固定白名单 HTML 解析；不接受通用网页抓取
- NIST 政策/研究来源与 TechCrunch、VentureBeat 可信媒体补充来源
- Cloudflare Cron 每 30 分钟检查到期来源，带来源数、并发、每源条数和 AI 批次上限
- 原子防重入、scheduled/manual 运行记录和失败隔离
- RSS/Atom/受控 HTML 解析、HTTPS 主机白名单、重定向校验、1.5 MB 大小上限和 URL 去重
- D1 持久化：来源健康、采集运行、短摘录文档、事件候选和审核审计
- `/review` 内部采集与审核工作台
- 单条内容 AI 分析和可恢复文档状态
- 候选批准、驳回和重新打开；所有操作保留审核记录
- 已批准候选生成正式事件草稿，保存影响角色、建议行动、引用、模型与 Token 元数据
- 草稿质量门禁：引用、置信度、证据级别、高风险复核和模型复核状态
- 独立人工发布与撤下操作，包含状态校验、审计记录和事件快照
- 保守自动发布：仅官方高置信、无风险候选在聚类无歧义且草稿二次门禁通过后发布
- 跨来源候选聚类、版本冲突隔离、人工合并与独立事件判断
- 正式事件人工编辑、版本快照与修订审计
- 主题与实体索引及正式事件时间线
- 双重确认订阅、主题偏好、一键退订和幂等每日邮件
- 120 条确定性发布契约回归（合成用例，非人工金标）
- 7 天来源观测、连续失败和邮件队列监控
- 健康检查、隐私、条款、纠错请求与运行手册
- 公开事件仓库只读取 `published` 状态；没有正式事件时回退到版本化演示数据
- G-01、P-01、P-02、P-03、P-04 Prompt 版本记录
- DeepSeek Responses API 严格结构化输出
- Flash → Pro 确定性升级路由
- 模型超时、有限重试、受控错误与 Token/耗时元数据
- 统一 API 错误结构
- mock 领域测试、构建后渲染测试和浏览器验收

面向读者的账号体系不属于当前 MVP；订阅无需账号。20 个来源已完成单次真实解析；PRD 要求的连续 7 天成功率仍需部署后观测，不能由一次测试替代。

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm ci
npm run build
npm run db:migrate:local
npm run dev
```

开发服务会使用第一个可用端口；本次环境中 3000 已占用，因此预览位于 `http://localhost:3001/`。

## 配置

复制 `.env.example` 为 `.env.local`。离线回归默认：

```dotenv
AI_PROVIDER=mock
```

真实模型本地配置：

```dotenv
AI_PROVIDER=deepseek
AI_BASE_URL=https://api.deepseek.com
AI_MODEL_PRIMARY=deepseek-v4-flash
AI_MODEL_ESCALATION=deepseek-v4-pro
AI_API_KEY=只填写在本地
```

真实 Key 只能存放在未提交的 `.env.local` 或托管平台 Secret 中，不得进入前端、日志、响应或 Git。超时、重试、升级阈值和输出预算见 `.env.example`，未填写时使用安全默认值。

Stage 05 起的调度容量由 `INGESTION_*` 配置控制。默认单轮可检查全部 20 个来源；`INGESTION_ANALYSIS_MODE=auto` 只有在 `AI_PROVIDER=deepseek` 时才自动分析，mock 环境只采集、不生成伪候选。Stage 17 的自动发布默认关闭；生产已设为 `AUTO_PUBLISH_MODE=safe`，外部调度器每轮刷新后再调用一次保守自动发布，高风险内容继续由人工处理。2026-08-26 已通过真实 GitHub `schedule` 事件验证从刷新到正式发布的完整链路。

本地审核后台默认 `REVIEW_AUTH_MODE=local`。托管环境必须改为 `chatgpt`，并通过 `REVIEW_ADMIN_EMAILS` 填写逗号分隔的审核员邮箱；未在白名单中的登录用户只能看到拒绝访问页面。

## API 示例

事件列表：

```text
GET /api/v1/events?type=api_change&status=published
```

流水线预览接受 1–6 个受控来源文档。mock 与真实模型都不持久化、不发布：

```text
POST /api/v1/pipeline/preview
Content-Type: application/json
```

内部接口全部受审核权限保护：

```text
GET  /api/v1/admin/dashboard
POST /api/v1/admin/ingestion/runs
POST /api/v1/admin/refresh
POST /api/v1/admin/auto-publish
POST /api/v1/admin/documents/:id/analyze
POST /api/v1/admin/candidates/:id/review
POST /api/v1/admin/candidates/:id/draft
POST /api/v1/admin/candidates/:id/cluster
GET  /api/v1/admin/clusters
POST /api/v1/admin/clusters/:id/review
GET  /api/v1/admin/events
PATCH /api/v1/admin/events/:id
POST /api/v1/admin/events/:id/publication
POST /api/v1/subscriptions
GET  /api/v1/subscriptions/verify
GET  /api/v1/subscriptions/unsubscribe
POST /api/v1/feedback
GET  /api/v1/health
GET  /api/v1/admin/operations
```

采集请求只接受代码中登记的 `sourceId`，不能提交任意 URL。外部刷新入口不接受来源 URL 或批量参数，只使用服务端配置的小批次运行采集、有限 AI 分析和当日日报；失败文档会保留为可重试状态。

错误统一返回：

```json
{
  "error": {
    "code": "EVENT_NOT_FOUND",
    "message": "没有找到这个变化事件。",
    "requestId": "..."
  }
}
```

## 验证

```bash
npm test
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
```

Stage 06 同时验证离线状态机、真实来源、D1 迁移和真实模型“候选批准 → P-03 影响分析 → P-04 中文稿 → 质量门禁”链路。公开页只读取正式发布事件，不能把候选或草稿当作已发布新闻。

Stage 05 的真实来源回归可显式运行：

```bash
RUN_LIVE_SOURCE_TESTS=1 npm test -- tests/live-sources.test.ts
curl 'http://localhost:3001/cdn-cgi/handler/scheduled?format=json'
```

## 文档与版本分支

- 产品 PRD：`mokuang-prd.html`
- 技术适配：`docs/technical-adaptation.md`
- Stage 01 文档：`docs/stages/stage-01-core-intelligence.md`
- Stage 02 文档：`docs/stages/stage-02-model-routing.md`
- Stage 03 文档：`docs/stages/stage-03-ingestion-review.md`
- Stage 04 文档：`docs/stages/stage-04-scheduled-sources.md`
- Stage 05 文档：`docs/stages/stage-05-coverage-expansion.md`
- Stage 06 文档：`docs/stages/stage-06-event-publishing.md`
- Stage 07 文档：`docs/stages/stage-07-event-clustering.md`
- Stage 08 文档：`docs/stages/stage-08-reading-and-revisions.md`
- Stage 09 文档：`docs/stages/stage-09-daily-digest.md`
- Stage 10 文档：`docs/stages/stage-10-launch-readiness.md`
- Stage 15 文档：`docs/stages/stage-15-production-data-validation.md`
- Stage 16 文档：`docs/stages/stage-16-external-scheduler.md`
- Stage 17 文档：`docs/stages/stage-17-safe-auto-publishing.md`
- 上线运行手册：`docs/operations-runbook.md`
- `stage/00-foundation`：项目基线与技术适配
- `stage/01-core-intelligence`：核心情报纵向切片
- `stage/02-model-routing`：真实模型适配与分级路由
- `stage/03-ingestion-review`：受控来源采集、D1 候选队列与人工审核
- `stage/04-scheduled-sources`：12 个官方来源、定时采集与有限自动分析
- `stage/05-coverage-expansion`：20 个来源、国内厂商、政策与可信媒体补缺
- `stage/06-event-publishing`：正式事件草稿、质量门禁、人工发布与撤下
- `stage/07-event-clustering`：跨来源聚类建议、人工合并与重复发布防护
- `stage/08-reading-and-revisions`：事件人工修订、版本审计与主题/实体时间线
- `stage/09-daily-digest`：双重确认订阅、主题偏好、退订与幂等日报
- `stage/10-launch-readiness`：质量回归、运行监控、合规页面与部署准备
- `stage/15-production-data-validation`：生产模型、真实来源、审核发布闭环与线上浏览器验收
- `stage/16-external-scheduler`：受保护的小批量刷新入口与外部 Timer 调度
- `stage/17-safe-auto-publishing`：官方高置信候选的保守自动发布与双重门禁

每个阶段完成验证并提交后保留分支；产品验收通过后再合入 `main` 并开始下一阶段。
