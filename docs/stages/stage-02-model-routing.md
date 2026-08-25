# 第 2 阶段技术开发文档｜真实模型接入与分级路由

> 配套文档：`mokuang-prd.html`、《AI 产品 Vibe Coding 通用技术栈手册》与《技术适配声明》。本文档只覆盖第 2 阶段。

## 一、阶段目标

- 交付范围：把 Stage 01 的确定性 mock 扩展为可配置的真实模型适配层，并保留 mock 供离线回归。
- 阶段产物：DeepSeek Responses API 适配器、Flash 主模型、Pro 升级模型、严格结构化输出、有限重试、超时、用量元数据和真实模型冒烟记录。
- 验收标准：普通事件由 Flash 返回合法结构；高风险或低置信度事件触发 Pro；来源引用只允许指向输入 source_id；密钥不进入响应、日志、Git 或构建产物。
- 明确不做：真实网络抓取、持久化任务队列、人工审核后台、自动发布、订阅邮件和正式前端扩展。
- 主链路：受控来源 JSON → P-01 抽取 → 必要时 P-02 合并 → 确定性质量门禁 → Flash / Pro 路由 → 结构化预览响应。

## 二、技术适配摘要

- 延续全栈 TypeScript 纵向切片和现有 `/api/v1` 契约，不引入第二套后端。
- 使用运行时 `fetch` 调用官方兼容接口，避免为单一 HTTP 调用增加 SDK 依赖，并保持 Cloudflare Worker 兼容。
- 模型调用集中在 `lib/ai`，Prompt 与路由、API 分离。
- 本阶段的预览接口是有输入上限、无持久化、无发布副作用的诊断入口；生产抓取任务的可恢复状态留给 Stage 03。

## 三、技术栈与模型

- 现有 Vinext/Next.js 兼容 App Router、React、TypeScript、Zod、Vitest。
- 主模型：`deepseek-v4-flash`。
- 升级模型：`deepseek-v4-pro`。
- 接口：DeepSeek Responses API，使用 JSON Schema 输出。
- P-01 默认关闭思考；P-02 使用 `low`；Pro 升级使用 `high`。合并阶段的低档思考可降低结构化结果被推理 Token 挤占的概率，冲突或低置信度时再升级 Pro。

## 四、环境与配置

- `AI_PROVIDER=mock | deepseek`
- `AI_BASE_URL=https://api.deepseek.com`
- `AI_MODEL_PRIMARY=deepseek-v4-flash`
- `AI_MODEL_ESCALATION=deepseek-v4-pro`
- `AI_API_KEY`：仅服务端秘密文件或托管平台 Secret。
- `AI_TIMEOUT_MS`：单次调用超时，默认 30000。
- `AI_MAX_RETRIES`：同模型结构/网络失败重试次数，默认 1，最大 2。
- `AI_ESCALATION_CONFIDENCE`：升级阈值，临时默认 0.80。
- `AI_MAX_OUTPUT_TOKENS`：单次输出预算，默认 8192。

## 五、项目结构

- `lib/ai/config.ts`：环境变量校验与安全配置。
- `lib/ai/contracts.ts`：P-01/P-02 Zod 契约和 JSON Schema。
- `lib/ai/deepseek.ts`：Responses API 调用、超时、响应解析和错误映射。
- `lib/ai/pipeline.ts`：固定流程、重试、Flash→Pro 升级和确定性门禁。
- `lib/ai/errors.ts`：不泄露上游细节的受控错误。
- `tests/ai-pipeline.test.ts`：离线模型模拟与路由回归。

## 六、数据、资产与状态

- 不新增持久化表；输入正文只存在于当前请求内，不写日志和数据库。
- 每次响应只返回模型 ID、是否升级、尝试次数、耗时和 Token 用量。
- 不返回模型思维过程，不保存密钥或完整来源正文。
- 高风险类型为 `pricing`、`policy`、`funding`；无论 Pro 结果如何均保持 `needs_review=true`。

## 七、API / 工具设计

- 保留 `POST /api/v1/pipeline/preview` 请求契约。
- `AI_PROVIDER=mock` 时保持 Stage 01 行为，`meta.demo=true`。
- `AI_PROVIDER=deepseek` 时返回真实模型结果，`meta.demo=false`、`meta.persisted=false`，并附安全的运行元数据。
- 错误覆盖：配置缺失、认证失败、限流、超时、上游失败、空响应、JSON/Schema 不合规。
- 本接口不持久化且不触发发布；失败不会损坏已有事件。

## 八、Prompt 设计

- 复用 `G-01.v0.1`、`P-01.v0.1`、`P-02.v0.1`。
- User input 只发送已校验 JSON；来源正文视为不可信数据。
- 每阶段只执行一个职责，P-01 不做跨来源结论，P-02 不改写来源事实。
- DeepSeek JSON Schema 与 Zod 双重校验；模型格式通过但业务引用越界时仍判失败。

## 九、验收界面或纵向切片

- 不新增页面。现有预览 API 足以验证当前结构化核心链路；正式审核界面留给 Stage 03。

## 十、测试要求

- mock 自动化：配置校验、合法响应解析、非法 JSON、Schema 失败、超时/限流映射、一次重试、Flash 正常路径、低置信度升级、风险事件升级且保持人工审核、未知 source_id 拦截。
- 真实冒烟：普通 API 更新走 Flash；价格变化触发 Pro；记录模型、尝试次数、升级状态、耗时、输入/输出 Token 与最终结构。
- 全量回归：`npm test`、`npm run lint`、`npm run build`、构建后 API 测试。

## 十一、验收清单

- [ ] 普通官方 API 更新返回结构化变化，并显示使用 Flash。
- [ ] 价格或政策材料显示已升级 Pro，同时仍标记“需要审核”。
- [ ] 无关文章不会被编造成新闻事件。
- [ ] 来源中的“忽略系统要求”只产生安全标记，不会改变模型角色。
- [ ] 删除本地 Key 后，接口显示受控错误，不出现密钥或程序堆栈。
- [ ] Stage 01 首页、详情和演示 API 仍可用。

## 十二、风险与待确认项

- 0.80 升级阈值是可配置临时值，需要在真实评测集扩充后冻结。
- 真实模型质量不能由单次冒烟证明；120 条黄金集仍属于后续质量放量门禁。
- 本阶段使用同步诊断接口；正式批量采集必须在 Stage 03 采用可恢复任务状态。
- 必须由产品经理决定的问题：无。

## 十三、交接给下一阶段

- Stage 03 可直接复用模型适配层、Prompt、结构化契约、路由元数据和错误边界。
- 下一阶段新增来源采集、候选持久化、任务状态和人工审核队列，不在本阶段提前实现。

## 十四、阶段验证记录

- Prompt Bundle：`G-01.v0.2+P-01.v0.3+P-02.v0.2`。
- 离线自动化：14/14 通过，覆盖配置、Flash 普通路径、Pro 升级、结构重试、P-02 合并、认证失败和伪造来源拦截；Stage 01 领域回归同时通过。
- 真实 Flash / P-01：官方 API 变化正确识别为 `api_change`，1 次调用，2.157 秒；输入 1698、输出 380、总计 2078 Token；无需审核。
- 真实 Flash → Pro / P-01：价格变化触发 Pro，2 次调用，20.655 秒；输入 3224（缓存命中 2688）、输出 1703（推理 960）、总计 4927 Token；最终模型为 `deepseek-v4-pro`，且保留人工审核。
- 真实 Flash / P-01+P-02：两个来源完成抽取与合并，2 次调用，18.911 秒；输入 3452、输出 2803（推理 1847）、总计 6255 Token；证据等级为 `corroborated`，来源 ID 均可追溯。
- 真实调试发现并修复：来源只有日期粒度时模型会返回 ISO 日期 `YYYY-MM-DD`；契约现同时接受 ISO 日期和带时区时间，避免无价值重试。P-02 的 Flash 思考档位调整为 `low`，防止推理 Token 挤占结构化结果。
- 代码检查与生产构建：通过；构建后页面/API 回归 3/3 通过。
- 依赖安全检查：`npm audit --omit=dev` 为 0 个已知漏洞。
- 密钥安全：`.env.local` 被忽略且未跟踪；真实 Key 未出现在 `dist`、`.next` 或 `.vinext` 构建产物。
- 产品经理验收：待按第十一节操作确认。
