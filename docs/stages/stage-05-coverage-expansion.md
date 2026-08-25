# 第 5 阶段技术开发文档｜20 源覆盖扩展

> 配套文档：`mokuang-prd.html`、《AI 产品 Vibe Coding 通用技术栈手册》与《技术适配声明》。本文档只覆盖第 5 阶段。

## 一、阶段结论

- 来源从 12 个扩展到 PRD 上限 20 个，优先补齐国内厂商、价格/API、政策和融资背景，而不是继续堆叠同质化开源 Release。
- 新增 6 个一手来源和 2 个可信媒体来源；20/20 均由生产解析器真实下载并解析出至少一条内容。
- DeepSeek 与 Kimi 没有可用 Feed，采用来源 ID 固定、主机固定、解析规则固定的 HTML 适配器；系统仍不接受请求方提交任意网址。
- 自动采集只生成待分析文档和待审核候选，不改变公开信息流。

## 二、新增来源

| 来源 | 类型 | 入口 | 主要补缺 |
| --- | --- | --- | --- |
| DeepSeek API Changelog | 官方 HTML | `https://api-docs.deepseek.com/updates` | 国内模型、API、模型 ID、价格与弃用 |
| Kimi Open Platform | 官方 HTML | `https://platform.kimi.com/blog` | 国内模型、API、价格 |
| Mistral News | 官方 RSS | `https://mistral.ai/news/rss` | 欧洲模型、产品与研究 |
| Microsoft Azure Blog | 官方 RSS | `https://azure.microsoft.com/en-us/blog/feed/` | Azure AI、云 API 与基础设施 |
| Anthropic Claude Code Releases | 官方 Atom | `https://github.com/anthropics/claude-code/releases.atom` | AI Coding 产品变化 |
| NIST News | 官方 RSS | `https://www.nist.gov/news-events/news/rss.xml` | AI 标准、政策与研究线索 |
| TechCrunch AI | 媒体 RSS | `https://techcrunch.com/category/artificial-intelligence/feed/` | 融资、公司与产品背景 |
| VentureBeat AI | 媒体 RSS | `https://venturebeat.com/category/ai/feed/` | 企业 AI、融资与产品背景 |

原有 12 个来源继续保留：OpenAI News、Google Blog、Google DeepMind、GitHub Changelog、Hugging Face Blog、AWS AI Blog、NVIDIA Deep Learning、Cloudflare AI、Ollama Releases、LangChain Releases、vLLM Releases、LlamaIndex Releases。

## 三、筛选证据与排除项

- 已验证可用：Mistral 页面声明的真实 RSS 为 `/news/rss`，不是常见的 `/rss.xml`；Azure 使用 Blog Feed，旧 Updates Feed 会返回 HTML 页面。
- 未接入 Anthropic News、Meta AI Blog：当前未发现可用 RSS/Atom，常见猜测地址真实返回 404。
- 未接入 Qwen GitHub Release：Atom 端点可访问但没有条目，不能算有效新闻来源。
- DeepSeek 与 Kimi 的公开页有真实更新内容且路径稳定，因此采用可逆的专用 HTML 适配器；如果页面结构变化，解析失败会进入来源健康状态，不会静默生成空新闻。
- 媒体来源只作为 `media` 证据；重大金额、政策解释和单一媒体主张继续强制人工审核。

## 四、受控 HTML 边界

- `fetchMethod=html` 只允许 `src-deepseek-api-changelog` 与 `src-kimi-platform-blog` 两个登记 ID。
- 每个请求仍经过 HTTPS、主机白名单、最多 3 次安全重定向、12 秒超时与 1.5 MB 大小限制。
- DeepSeek 从 changelog 日期和三级标题生成独立条目，保留页面锚点作为规范 URL。
- Kimi 从公开索引读取标题、文章链接和日期，再以最多 3 并发读取最新 10 篇公开文章；失败文章退化为标题级材料，不影响其他条目。
- 只保存最多 4,000 字符必要摘录，不保存完整网页，不执行页面脚本，也不访问登录、付费或 API 路径。

## 五、调度调整

- `INGESTION_SOURCE_BATCH_SIZE` 默认从 12 调整为 20，确保同一时刻全部来源到期时不会因为固定优先级导致后 8 个来源长期饥饿。
- 到期查询同时改为“从未运行优先、最久未运行优先、再按业务优先级”，即使运维把批次调低也会轮转而不是饿死低优先级来源。
- 来源抓取并发保持 3，每源最多 10 条，AI 分析批次保持 3。
- 20 源初次运行最多产生 200 条文档；后续通过 URL/外部 ID 唯一约束去重。

## 六、覆盖判断

| PRD 类型 | Stage 05 覆盖 | 说明 |
| --- | --- | --- |
| `model_release` | 强 | 国际厂商、国内厂商和开源项目均有一手来源 |
| `api_change` | 强 | DeepSeek、Kimi、Azure、GitHub 与框架 Release |
| `pricing` | 中 | Kimi/DeepSeek 官方更新与媒体线索；尚未做价格页差异监控 |
| `policy` | 中 | NIST 一手来源加媒体背景；不是法律合规产品 |
| `funding` | 中 | 两个媒体来源提供线索，金额必须人工复核 |
| `research` | 强 | DeepMind、Hugging Face、NVIDIA、Mistral、NIST 等 |

## 七、测试与验收

- 离线测试新增：两个 HTML 解析器、DeepSeek 多锚点 URL、Kimi 文章正文补全、20 源唯一性、2 个媒体来源和 2 个 HTML 来源边界。
- 真实来源测试：20/20 下载成功且解析结果非空，总耗时约 21 秒。
- 本地 D1 真实采集：新增 8 源均成功且连续失败数为 0，共发现并新增 151 条文档：DeepSeek 10、Kimi 10、Mistral 44、Azure 10、Claude Code 10、NIST 40、TechCrunch 20、VentureBeat 7。
- 去重复验：DeepSeek 再次采集为新增 0/重复 10，TechCrunch 为新增 0/重复 20。
- Dashboard 实测返回 20 个来源；本次扩源不调用模型，新增文档保持 `pending_analysis`，没有触发公开发布。
- 全量回归要求：`npm test`、`npm run lint`、`npm run build`、构建后页面/API 测试和生产依赖审计。

## 八、剩余风险

- 价格覆盖仍依赖公告，没有对模型定价页做字段级差异检测。
- NIST Feed 是综合新闻 Feed，会产生非 AI 文档；相关性模型应判为 `irrelevant`，但会占用有限分析预算。
- TechCrunch 与 VentureBeat 的内容只能作为媒体报道，不能把单一报道升级为官方事实。
- Qwen、Meta AI、Anthropic News 等无 Feed 来源需要后续单独评估 HTML/API 适配，不应通过第三方 RSS 生成器绕过来源边界。
- 连续 7 天 98% 成功率只有在部署后才能验收。
