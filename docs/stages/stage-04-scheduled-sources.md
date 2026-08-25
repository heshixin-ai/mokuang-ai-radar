# 第 4 阶段技术开发文档｜定时扩源与有限自动分析

> 配套文档：`mokuang-prd.html`、《AI 产品 Vibe Coding 通用技术栈手册》与《技术适配声明》。本文档只覆盖第 4 阶段。

## 一、阶段目标

- 交付范围：把 Stage 03 的 3 个手动来源扩展为 12 个受控官方来源，并用 Cloudflare Cron 自动运行“到期采集 → 有限 AI 分析 → 待人工审核”。
- 验收标准：12 个 Feed 均能被同一安全解析器读取；每 30 分钟检查一次；并发、来源数、每源条数和分析量都有上限；重复或并发触发不会创建同源重叠运行；失败可追溯且不自动发布。
- 明确不做：候选自动批准、公开事件发布、跨来源事件聚类、订阅邮件、7 天连续成功率结论和生产部署。

## 二、来源清单

| 优先级 | 来源 | 类型 | Feed |
| --- | --- | --- | --- |
| 10 | OpenAI News | RSS | `https://openai.com/news/rss.xml` |
| 20 | Google Blog | RSS | `https://blog.google/rss/` |
| 25 | Google DeepMind | RSS | `https://deepmind.google/blog/rss.xml` |
| 30 | GitHub Changelog | RSS | `https://github.blog/changelog/feed/` |
| 40 | Hugging Face Blog | RSS | `https://huggingface.co/blog/feed.xml` |
| 50 | AWS AI Blog | RSS | `https://aws.amazon.com/blogs/machine-learning/feed/` |
| 60 | NVIDIA Deep Learning | RSS | `https://blogs.nvidia.com/blog/category/deep-learning/feed/` |
| 70 | Cloudflare AI | RSS | `https://blog.cloudflare.com/tag/ai/rss/` |
| 80 | Ollama Releases | Atom | `https://github.com/ollama/ollama/releases.atom` |
| 90 | LangChain Releases | Atom | `https://github.com/langchain-ai/langchain/releases.atom` |
| 100 | vLLM Releases | Atom | `https://github.com/vllm-project/vllm/releases.atom` |
| 110 | LlamaIndex Releases | Atom | `https://github.com/run-llama/llama_index/releases.atom` |

微软 AI Blog 的旧 Feed 在本阶段验证时返回 HTTP 410，因此未登记。Hugging Face 的 RSS 条目可能没有 `link`，解析器仅在 `guid` 本身是 HTTP(S) URL 时将其作为规范链接后备值。

## 三、调度与容量边界

- Wrangler/Cron：`*/30 * * * *`，即每 30 分钟由 Worker 的 `scheduled()` 处理器触发；Cron 使用 UTC，但本表达式不依赖时区。
- 单次最多检查 12 个到期来源，来源抓取并发默认 3，每源最多处理最新 10 条。
- 单次最多自动分析 3 条最新待分析文档；按顺序执行，控制模型费用和失败影响面。
- `INGESTION_ANALYSIS_MODE=auto` 仅在 `AI_PROVIDER=deepseek` 时启用自动分析；mock 环境只采集，不向真实审核队列写入伪候选。
- 来源未到 `frequencyMinutes`、存在 15 分钟内运行中的任务或并发实例抢先创建运行时，本次安全跳过。
- 自动任务只处理 `pending_analysis`；`analysis_failed` 保留给人工检查或显式重试，避免每 30 分钟重复消耗模型。

## 四、可恢复状态与一致性

- 每个来源仍创建独立 `ingestion_runs`，新增使用现有 `trigger_kind=scheduled`，无需新增迁移。
- 创建运行通过一条条件 `INSERT ... SELECT` 原子检查到期时间与活动运行，随后更新 `last_attempt_at`。
- 每个来源的网络或解析失败相互隔离；成功、失败、发现、新增和重复数量分别落库。
- AI 结果继续经过 JSON Schema、Zod、来源 ID 和证据原文子串门禁。失败文档转为 `analysis_failed`，不创建候选。
- 定时任务不调用审核和发布操作；候选始终停留在 `pending`。

## 五、环境配置

```dotenv
INGESTION_SOURCE_BATCH_SIZE=12
INGESTION_SOURCE_CONCURRENCY=3
INGESTION_MAX_ITEMS_PER_SOURCE=10
INGESTION_ANALYSIS_BATCH_SIZE=3
INGESTION_ANALYSIS_MODE=auto
```

AI 配置、审核身份和 D1 绑定沿用 Stage 02/03。真实部署需要在托管环境注入 `AI_API_KEY`；本阶段未执行部署，因此生产 Cron 尚未开始持续运行。

## 六、代码结构

- `lib/ingestion/sources.ts`：12 个受控来源、主机白名单与授权记录。
- `lib/ingestion/scheduler-config.ts`：调度容量参数校验和安全默认值。
- `lib/ingestion/scheduler.ts`：到期来源编排、分批并发抓取、有限串行分析和计数摘要。
- `lib/repository/ingestion*.ts`：到期查询、原子运行领取、待分析文档领取与 trigger kind 映射。
- `worker/index.ts`：Cloudflare `scheduled()` 入口，只记录不含标题/正文/密钥的计数日志。
- `components/review-dashboard.tsx`：展示 12 个来源与最近手动/定时运行。
- `tests/live-sources.test.ts`：显式开启时对 12 个真实 Feed 运行同一生产解析器。

## 七、测试与验收记录

- 离线自动化：23/23 通过；新增覆盖 12 源唯一性、Hugging Face GUID 后备、定时批量边界、scheduled 运行类型和分析批次上限。
- 真实来源：12/12 Feed 下载和解析成功，测试耗时 9.55 秒。
- 真实 Cron 首次到期运行：9 个到期来源全部成功，每源处理 10 条，共新增 90 条；其余 3 个来源此前刚手动采集，正确未重复触发。
- Worker 兼容修复：真实调度发现类成员直接持有全局 `fetch` 会触发 `Illegal invocation`，改为闭包调用后回归通过。
- 修复后真实模型：3 条待分析文档中 2 条生成待审核候选，1 条因模型响应/证据门禁失败进入 `analysis_failed`；没有生成错误候选。
- 成功候选分别来自 vLLM Releases（1 次 Flash，2.848 秒，2,165 Token）和 OpenAI News（含重试/复核 4 次，64.819 秒，4,075 Token）。
- 审核 API 实测：返回 12 个来源、9 条 scheduled 运行、3 条待审核候选和 1 条既有已批准候选。
- Cron 配置：生产构建生成的 `dist/server/wrangler.json` 包含 `triggers.crons=["*/30 * * * *"]`。

## 八、风险与下一阶段

- 当前只完成一次真实调度冒烟，不能替代 PRD 的连续 7 天、成功率不低于 98% 验收。
- 初次扩源会形成待分析积压；当前上限可通过环境变量调整，但应先观察费用、失败率和人工审核吞吐。
- RSS 摘录可能不足，模型失败应保持失败而不是放宽证据门禁；后续可针对合法公开页面设计受控正文补全策略。
- 下一阶段建议实现“审核通过候选 → 正式事件草稿 → 发布事务与回滚”，再把真实事件接入公开信息流。

## 九、阶段验收清单

- [ ] `/review` 显示 12 个来源及最近运行的“定时/手动”标记。
- [ ] 本地访问 `/cdn-cgi/handler/scheduled?format=json` 返回成功，来源运行和候选计数可在后台核对。
- [ ] 30 分钟内重复触发不重复采集来源，但仍可在分析积压存在时处理有限批次。
- [ ] 关闭 `INGESTION_ANALYSIS_MODE` 后只采集，不调用模型。
- [ ] mock 环境自动触发时不生成候选。
- [ ] 失败模型输出进入 `analysis_failed`，公开首页不变化。
