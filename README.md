# 模况 Mokuang

面向中文 AI 产品经理、开发者和小型创业团队的产品与模型变更雷达。模况把分散来源整理成带证据、影响判断和建议行动的变化事件。

当前是 Stage 01 核心情报纵向切片：使用版本化演示数据与确定性 mock 验证事件契约、信息流、详情、引用和 API。它不是实时新闻服务，也没有用 mock 冒充真实模型结果。

## 当前已实现

- 事件信息流和类型筛选
- 事件详情、变化前后、角色影响和建议行动
- 逐条事实引用与证据等级
- `GET /api/v1/events`
- `GET /api/v1/events/:id`
- `POST /api/v1/pipeline/preview`
- G-01、P-01、P-02 Prompt 版本记录
- 统一 API 错误结构
- mock 领域测试、构建后渲染测试和浏览器验收

暂未实现：真实来源抓取、真实模型、人工审核后台、账号、订阅邮件和自动发布。

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm ci
npm run dev
```

开发服务会使用第一个可用端口；本次环境中 3000 已占用，因此预览位于 `http://localhost:3001/`。

## 配置

复制 `.env.example` 为 `.env` 后填写本地值。Stage 01 默认：

```dotenv
AI_PROVIDER=mock
AI_MODEL=mock-v1
AI_API_KEY=
```

真实 Key 只能存放在未提交的 `.env` 或托管平台 Secret 中，不得进入前端、日志或 Git。

## API 示例

事件列表：

```text
GET /api/v1/events?type=api_change&status=published
```

流水线预览接受 1–6 个受控来源文档，只运行 mock，不持久化、不发布：

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

真实模型冒烟尚未执行，因为当前没有配置模型 Key；接入供应商后必须补测真实认证、网络、结构化输出、重试、延迟和结果质量。

## 文档与版本分支

- 产品 PRD：`mokuang-prd.html`
- 技术适配：`docs/technical-adaptation.md`
- Stage 01 文档：`docs/stages/stage-01-core-intelligence.md`
- `stage/00-foundation`：项目基线与技术适配
- `stage/01-core-intelligence`：当前核心情报纵向切片

每个阶段完成验证并提交后保留分支；产品验收通过后再合入 `main` 并开始下一阶段。
