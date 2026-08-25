# Stage 09：双重确认订阅与每日情报邮件

## 目标

让读者按主题订阅已发布事件的每日摘要，同时保证同意、确认、退订、去重和发送失败均可追溯。

## 已实现

- `/subscribe` 邮箱与主题偏好表单，必须显式勾选同意。
- 双重确认：原始确认 token 只出现在邮件链接，数据库仅保存 SHA-256 摘要。
- 一键退订：订阅者状态立即改为 `unsubscribed`，后续日报自动排除。
- 每日 08:00（Asia/Shanghai）后由现有 Cron 首次触发；同一天只允许一个 digest run。
- 只选取当天已人工发布、且匹配用户主题的事件；无匹配内容不发空邮件。
- 每位订阅者、每天独立去重，Resend 请求同时携带 Idempotency-Key。
- 本地 `outbox` 模式不向外发信；生产 `resend` 模式调用 HTTPS API。
- 邮件、运行和失败代码写入 D1，不记录 API Key。

## 生产配置

`EMAIL_PROVIDER=resend`、`RESEND_API_KEY`、已验证域名的 `EMAIL_FROM`、公开 HTTPS `PUBLIC_SITE_URL`。缺少 Resend Key 时，系统不会假装已经发送，仍可在 outbox 模式完整验证流程。

## 接口依据

实现遵循 Resend 官方 `POST https://api.resend.com/emails`、Bearer 鉴权、`User-Agent` 和 `Idempotency-Key` 要求。
