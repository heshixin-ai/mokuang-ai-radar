# 模况 Mokuang

面向中文 AI 产品经理、开发者和小型创业团队的产品与模型变更雷达。模况把分散来源整理成带证据、影响判断和建议行动的变化事件。

当前进入 Stage 02 真实模型接入：保留 Stage 01 的版本化演示数据与确定性 mock，同时为预览流水线接入 DeepSeek V4 Flash，并在高风险、低置信度或主模型失败时升级到 V4 Pro。它仍不是实时新闻服务，不会抓取、持久化或自动发布新闻。

## 当前已实现

- 事件信息流和类型筛选
- 事件详情、变化前后、角色影响和建议行动
- 逐条事实引用与证据等级
- `GET /api/v1/events`
- `GET /api/v1/events/:id`
- `POST /api/v1/pipeline/preview`
- G-01、P-01、P-02 Prompt 版本记录
- DeepSeek Responses API 严格结构化输出
- Flash → Pro 确定性升级路由
- 模型超时、有限重试、受控错误与 Token/耗时元数据
- 统一 API 错误结构
- mock 领域测试、构建后渲染测试和浏览器验收

暂未实现：真实来源抓取、候选持久化、人工审核后台、账号、订阅邮件和自动发布。

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm ci
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

Stage 02 完成前必须同时通过离线 mock 回归与真实模型冒烟；真实冒烟需要验证 Flash 普通路径、Pro 升级路径、结构化输出、引用边界、延迟和 Token 用量。

## 文档与版本分支

- 产品 PRD：`mokuang-prd.html`
- 技术适配：`docs/technical-adaptation.md`
- Stage 01 文档：`docs/stages/stage-01-core-intelligence.md`
- Stage 02 文档：`docs/stages/stage-02-model-routing.md`
- `stage/00-foundation`：项目基线与技术适配
- `stage/01-core-intelligence`：核心情报纵向切片
- `stage/02-model-routing`：真实模型适配与分级路由

每个阶段完成验证并提交后保留分支；产品验收通过后再合入 `main` 并开始下一阶段。
