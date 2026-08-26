const qstashToken = requiredSecret("QSTASH_TOKEN");
const reviewToken = requiredSecret("REVIEW_AUTOMATION_TOKEN");
const sitesBypassToken = requiredSecret("SITES_BYPASS_TOKEN");
const siteUrl = requiredUrl("MOKUANG_SITE_URL");
const qstashUrl = optionalUrl("QSTASH_URL", "https://qstash.upstash.io");
const destination = new URL("/api/v1/admin/run", siteUrl).toString();
const scheduleId = process.env.QSTASH_SCHEDULE_ID?.trim() || "mokuang-production-automation";
const cron = process.env.QSTASH_CRON?.trim() || "*/10 * * * *";
const scheduleUrl = `${qstashUrl}/v2/schedules/${destination}`;

const response = await fetch(scheduleUrl, {
  method: "POST",
  headers: {
    authorization: `Bearer ${qstashToken}`,
    "content-type": "application/json",
    "upstash-cron": cron,
    "upstash-method": "POST",
    "upstash-retries": "3",
    "upstash-timeout": "8m",
    "upstash-schedule-id": scheduleId,
    "upstash-redact-fields": "header[Authorization], header[OAI-Sites-Authorization]",
    "upstash-forward-authorization": `Bearer ${reviewToken}`,
    "upstash-forward-oai-sites-authorization": `Bearer ${sitesBypassToken}`,
    "upstash-forward-user-agent": "mokuang-qstash-scheduler/1.0",
  },
  body: "{}",
  signal: AbortSignal.timeout(30_000),
});
const payload = await response.json().catch(() => null);
if (!response.ok) {
  const detail = payload?.error ?? payload?.message ?? `HTTP_${response.status}`;
  throw new Error(`QSTASH_SCHEDULE_CREATE_FAILED:${detail}`);
}

console.log(JSON.stringify({
  ok: true,
  scheduleId: payload?.scheduleId ?? scheduleId,
  cron,
  destination,
  qstashUrl,
}));

function requiredSecret(name) {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32) throw new Error(`${name}_REQUIRED`);
  return value;
}

function requiredUrl(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name}_MUST_USE_HTTPS`);
  return url;
}

function optionalUrl(name, fallback) {
  const rawValue = process.env[name]?.trim() || fallback;
  const url = new URL(rawValue);
  if (url.protocol !== "https:") throw new Error(`${name}_MUST_USE_HTTPS`);
  return url.origin;
}
