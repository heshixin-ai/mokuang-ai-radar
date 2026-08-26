# 阶段 28：QStash 外部调度迁移

## 目标

用 Upstash QStash 替代 GitHub Actions 的定时触发，同时保持现有 Sites、D1、AI 分析和自动发布流程不变。

## 实现

- 新增 `POST /api/v1/admin/run`，依次执行来源刷新、AI 分析、日报处理和安全自动发布。
- 任一刷新步骤失败时立即返回非 2xx，不继续自动发布，便于 QStash 自动重试。
- 新增幂等 QStash 配置脚本，默认每 10 分钟执行一次，转发 Sites 访问令牌和审核自动化令牌。
- 支持通过 `QSTASH_URL` 显式选择 QStash 区域；美国区使用 `https://qstash-us-east-1.upstash.io`，欧洲区默认使用 `https://qstash.upstash.io`。
- QStash 日志隐藏请求头，失败最多重试 3 次，单次调用超时 8 分钟。
- 线上实测单次全链路约 5 分钟，因此正式频率采用 10 分钟，避免相邻任务重叠。

## 切换规则

1. 先发布并验证统一入口。
2. 创建 QStash Schedule，并观察至少一次真实成功运行。
3. 只有 QStash 成功后，才移除 GitHub workflow 的 `schedule` 触发；保留 `workflow_dispatch` 作为人工故障兜底。

## 切换结果

- 美国区 QStash Schedule 已创建，任务 ID 为 `mokuang-production-automation`。
- 正式频率为每 10 分钟一次，首次真实定时运行状态为 `SUCCESS`。
- GitHub Actions 的自动 `schedule` 已移除，只保留 `workflow_dispatch` 人工兜底。

## 所需外部凭据

- `QSTASH_TOKEN`：只用于创建和管理 QStash Schedule，不写入站点运行环境。
- `QSTASH_URL`：必须与令牌所属区域一致；美国区令牌不能调用欧洲区入口。
- `SITES_BYPASS_TOKEN`：用于通过私有 Sites 访问层。
- `REVIEW_AUTOMATION_TOKEN`：用于调用受保护的自动化接口。
