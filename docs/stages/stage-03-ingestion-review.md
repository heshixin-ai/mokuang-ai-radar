# 第 3 阶段技术开发文档｜受控来源采集与人工审核

> 配套文档：`mokuang-prd.html`、《AI 产品 Vibe Coding 通用技术栈手册》与《技术适配声明》。本文档只覆盖第 3 阶段。

## 一、阶段目标

- 交付范围：接入首批公开官方 RSS，把采集运行、来源文档、AI 候选和人工审核状态持久化，并提供内部审核工作台。
- 阶段产物：3 个受控来源、RSS/Atom 解析与安全抓取、D1 Schema/迁移、采集/分析/审核 API、`/review` 页面和审计记录。
- 验收标准：真实来源能进入 D1；同一 URL 不重复入库；单条文档可经真实模型生成候选；批准/驳回/重开可恢复且有审计；任何操作都不自动发布。
- 明确不做：定时调度、12–20 个来源完整扩源、7 天健康率验收、跨来源聚类、正式事件发布、实体时间线、订阅邮件和读者账号。
- 主链路：来源登记 → RSS 采集 → 标准化/去重 → 待分析文档 → Flash/Pro 流水线 → 待审核候选 → 人工批准/驳回 → 保留给后续发布阶段。

## 二、技术适配摘要

- 延续全栈 TypeScript 纵向切片，复用 Stage 02 模型适配层，不引入第二套后端。
- 关系、筛选、状态恢复与审计触发 D1/SQLite；Schema 由 Drizzle 管理并提交 SQL 迁移。
- 采集与 AI 分析拆成两个显式操作：采集只写文档，分析每次只领取一条，失败可重试。
- 审核页是核心人工确认点，因此作为受保护的最小真实界面；公开首页继续使用演示事件。

## 三、技术栈与模型

- Vinext/Next.js 兼容 App Router、React、TypeScript、Zod、Vitest。
- Cloudflare D1 + Drizzle ORM Schema/迁移；应用查询使用 D1 prepared statements。
- `fast-xml-parser@5.11.0`：解析 RSS/Atom；纯 JavaScript，兼容 Worker 运行时。
- DeepSeek V4 Flash 为普通分析模型；风险、冲突、低置信度或主模型失败时复用 V4 Pro 升级策略。

## 四、环境与配置

- 沿用 Stage 02 的 `AI_*` 配置。
- `REVIEW_AUTH_MODE=local | chatgpt`：`local` 只在非生产环境有效；生产环境即使误填 local 也不会绕过登录。
- `REVIEW_ADMIN_EMAILS`：托管环境的审核员邮箱白名单，逗号分隔；空白名单拒绝所有登录用户。
- D1 逻辑绑定：`.openai/hosting.json` 中为 `DB`；真实资源由 Sites 托管层注入。
- 本地首次运行：先构建生成 Wrangler 配置，再执行 `npm run db:migrate:local`。

## 五、项目结构

- `db/schema.ts`、`drizzle/0000_red_martin_li.sql`：5 张表与首个迁移。
- `lib/ingestion/sources.ts`：受控来源登记表；不接受请求方传入 URL。
- `lib/ingestion/feed.ts`：安全下载、RSS/Atom 解析、URL 规范化和短摘录。
- `lib/ingestion/service.ts`：采集、分析、候选和审核状态机。
- `lib/repository/ingestion*.ts`：持久化合同与 D1 prepared statements。
- `lib/auth/review*.ts`：本地/托管审核身份与邮箱授权。
- `app/api/v1/admin/*`：内部采集、分析、审核 API。
- `app/review`、`components/review-dashboard.tsx`：审核工作台。

## 六、数据、资产与状态

### 数据表

- `sources`：来源 URL、类型、频率、授权说明、robots 说明、最后成功时间和连续失败次数。
- `ingestion_runs`：每次采集的开始/结束、发现/新增/重复数量和受控错误码。
- `source_documents`：标题、规范 URL、作者、时间、最多 4,000 字符的必要摘录、内容哈希和分析状态；不保存完整正文。
- `event_candidates`：结构化候选、证据级别、置信度、Prompt/模型版本、升级状态、耗时/Token 用量和审核状态。
- `review_actions`：批准、驳回、重新打开的操作者、时间与备注；不删除历史。

### 状态机

```text
source_document:
pending_analysis → analyzing → candidate_created
                            ↘ irrelevant
                            ↘ analysis_failed → analyzing（重试）
analyzing 超过 10 分钟 → 可重新领取

event_candidate:
pending → approved | rejected
approved | rejected → pending（reopen，保留审计）
```

批准表示“可进入下一阶段”，不创建公开事件，不修改公开信息流。

## 七、API / 工具设计

- `GET /api/v1/admin/dashboard`：返回来源健康、待分析文档、候选和最近运行；无缓存。
- `POST /api/v1/admin/ingestion/runs`：请求 `{sourceId}`；只允许登记且授权为 approved 的来源；返回发现/新增/重复数量。
- `POST /api/v1/admin/documents/:id/analyze`：原子领取一条待分析文档；返回候选或无关结果并持久化。
- `POST /api/v1/admin/candidates/:id/review`：`approve | reject | reopen`；驳回必须填写备注；冲突返回 409。
- API 身份始终在服务端检查。匿名返回 401，未在白名单返回 403，错误不含堆栈和上游正文。

## 八、Prompt 设计

- 不新增 Prompt；复用 `G-01.v0.2+P-01.v0.3+P-02.v0.2`。
- RSS 摘录始终作为不可信数据输入，不允许正文指令改变系统流程。
- 模型结果继续经过 JSON Schema、Zod、引用 source_id 和证据原文子串门禁。
- 候选保存实际 `promptVersion` 与 `modelId`，供后续回归和发布追溯。

## 九、验收界面或纵向切片

- `/review` 是内部最小审核工作台，不是公开读者页。
- 页面展示 4 个状态指标、来源健康、待分析内容和按状态筛选的候选。
- 采集、单条分析、批准、驳回和重开都可直接操作；页面明确提示“不会自动发布”。
- 本地环境提供非生产审核身份；托管环境使用平台登录和审核邮箱白名单。

## 十、测试要求

- mock 自动化：RSS 与 Atom 解析、URL 规范化、恶意重定向拒绝、采集去重、运行计数、文档状态、mock AI 候选、审核转换、审计和生产白名单。
- D1：生成并检查迁移；本地应用成功；索引存在；候选与待分析查询的 `EXPLAIN QUERY PLAN` 使用目标组合索引。
- 真实来源：至少一个官方 RSS 完成下载、解析、短摘录和持久化。
- 真实模型：真实来源的一条文档经 DeepSeek 完成“输入 → 模型 → D1 候选 → 审核页/API 可见 → 审核保存”。
- 全量回归：`npm test`、`npm run lint`、`npm run build`、构建后 HTML/API 测试和生产依赖审计。

## 十一、验收清单

- [ ] 打开 `/review`，能看到 3 个来源和“批准不会自动发布”的说明。
- [ ] 点击一个来源的“立即采集”，成功后待分析数量增加；再次采集相同条目显示为重复，不新增副本。
- [ ] 点击一条内容的“生成候选”，完成后它从待分析区移入待审核队列。
- [ ] 打开原文，候选标题与变化说明能从来源核验；不能核验的内容应驳回并写原因。
- [ ] 点击“批准进入下一阶段”，候选进入已批准；公开首页仍保持演示数据。
- [ ] 点击“重新打开”，候选回到待审核且先前审核记录仍保留。
- [ ] 驳回时不填写原因会被阻止。

## 十二、风险与待确认项

- 当前只有 3 个官方 RSS，PRD 的 12–20 个来源和连续 7 天 98% 成功率尚未验收。
- 来源条目摘要有时很短，可能让模型得到的信息不足；本阶段保留失败文档，不抓取完整文章，避免扩大授权范围。
- 页面批准不是发布；Stage 04 需要设计正式事件生成、质量门禁与发布事务。
- 生产审核邮箱白名单必须在托管 Secret/环境配置中填写；空白名单是安全拒绝。
- 必须由产品经理决定的问题：无。

## 十三、交接给下一阶段

- Stage 04 可复用来源健康、采集运行、文档去重、候选和审计数据。
- 下一阶段建议先实现定时采集与“批准候选 → 正式事件草稿 → 发布门禁”，再接公开实时信息流；订阅邮件仍应晚于可靠发布。

## 十四、阶段验证记录

- 离线自动化：20/20 通过，覆盖 RSS/Atom、URL 清洗、重定向白名单、去重、运行计数、候选状态机、审核审计和生产邮箱授权。
- D1 迁移：`0000_red_martin_li.sql` 创建 5 表和 11 个业务索引，`0001_same_gravity.sql` 增加模型执行指标；在全新临时 D1 上按顺序应用成功。
- 查询计划：待审核候选使用 `idx_event_candidates_review_created`；待分析文档使用 `idx_source_documents_status_discovered`；首个迁移以 `PRAGMA optimize` 收尾。
- 真实来源：OpenAI 官方 RSS 首次发现并新增 50 条；第二次发现相同 50 条时新增 0、重复 50，URL 去重生效；文档只保留短摘录。
- 真实模型端到端：官方来源文档 `Accelerating scientific discovery with ChatGPT for Academic Researchers` 经 Flash → Pro 路由生成 `pricing` 候选；2 次调用、22.981 秒；输入 3,500、输出 1,399、推理 794、合计 4,899 Token；候选标记高风险并保持待审核。
- 人工确认：另一条真实候选从待审核批准为“进入下一阶段”，审核员与备注成功保存；Dashboard 显示已批准 1 条，响应 `published=false`，公开页未改变。
- 构建后审核页：匿名访问被导向平台登录；白名单用户可看到后台标题和“不自动发布”说明。
- 代码检查、生产构建、构建后页面/API 回归和生产依赖审计：全部通过；`npm audit --omit=dev` 为 0 个已知漏洞。
