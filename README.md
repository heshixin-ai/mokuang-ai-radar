# 模况 Mokuang

面向中文 AI 产品经理、开发者和小型创业团队的产品与模型变更雷达。模况把分散来源整理成带证据、影响判断和建议行动的变化事件。

当前进入 Stage 03 采集与审核：公开信息流继续使用版本化演示事件；内部后台接入受控官方 RSS，把来源文档和 AI 候选持久化到 D1，并由人工批准或驳回。批准只进入下一阶段，不会自动发布。

## 当前已实现

- 事件信息流和类型筛选
- 事件详情、变化前后、角色影响和建议行动
- 逐条事实引用与证据等级
- `GET /api/v1/events`
- `GET /api/v1/events/:id`
- `POST /api/v1/pipeline/preview`
- 3 个经登记的官方 RSS 来源：OpenAI News、Google Blog、GitHub Changelog
- RSS/Atom 解析、HTTPS 主机白名单、重定向校验、1.5 MB 大小上限和 URL 去重
- D1 持久化：来源健康、采集运行、短摘录文档、事件候选和审核审计
- `/review` 内部采集与审核工作台
- 单条内容 AI 分析和可恢复文档状态
- 候选批准、驳回和重新打开；所有操作保留审核记录且不触发发布
- G-01、P-01、P-02 Prompt 版本记录
- DeepSeek Responses API 严格结构化输出
- Flash → Pro 确定性升级路由
- 模型超时、有限重试、受控错误与 Token/耗时元数据
- 统一 API 错误结构
- mock 领域测试、构建后渲染测试和浏览器验收

暂未实现：定时调度、事件聚类入正式事件表、公开发布、实体时间线、订阅邮件和面向读者的账号体系。PRD 要求的 12–20 个来源与连续 7 天成功率需要在扩源阶段验收；本阶段先验证 3 个官方 RSS 的真实链路。

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

Stage 03 内部接口全部受审核权限保护：

```text
GET  /api/v1/admin/dashboard
POST /api/v1/admin/ingestion/runs
POST /api/v1/admin/documents/:id/analyze
POST /api/v1/admin/candidates/:id/review
```

采集请求只接受代码中登记的 `sourceId`，不能提交任意 URL。采集和分析拆成两步，避免一次请求批量调用模型；失败文档会保留为可重试状态。

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

Stage 03 同时验证离线状态机、真实 RSS、D1 迁移和真实模型“采集 → 持久化 → 候选 → 审核”链路。公开页仍显示演示数据，不能把内部候选当作已发布新闻。

## 文档与版本分支

- 产品 PRD：`mokuang-prd.html`
- 技术适配：`docs/technical-adaptation.md`
- Stage 01 文档：`docs/stages/stage-01-core-intelligence.md`
- Stage 02 文档：`docs/stages/stage-02-model-routing.md`
- Stage 03 文档：`docs/stages/stage-03-ingestion-review.md`
- `stage/00-foundation`：项目基线与技术适配
- `stage/01-core-intelligence`：核心情报纵向切片
- `stage/02-model-routing`：真实模型适配与分级路由
- `stage/03-ingestion-review`：受控来源采集、D1 候选队列与人工审核

每个阶段完成验证并提交后保留分支；产品验收通过后再合入 `main` 并开始下一阶段。
