const siteUrl = requiredUrl("MOKUANG_SITE_URL");
const reviewToken = requiredSecret("REVIEW_AUTOMATION_TOKEN");
const sitesBypassToken = requiredSecret("SITES_BYPASS_TOKEN");
const refreshPayload = await callInternalEndpoint("/api/v1/admin/refresh", "MOKUANG_REFRESH_FAILED");
const autoPublishPayload = await callInternalEndpoint("/api/v1/admin/auto-publish", "MOKUANG_AUTO_PUBLISH_FAILED");

const summary = {
  ok: true,
  scheduledAt: refreshPayload?.data?.refresh?.scheduledAt ?? null,
  sourcesAttempted: refreshPayload?.data?.refresh?.sourcesAttempted ?? 0,
  sourcesSucceeded: refreshPayload?.data?.refresh?.sourcesSucceeded ?? 0,
  sourcesFailed: refreshPayload?.data?.refresh?.sourcesFailed ?? 0,
  insertedCount: refreshPayload?.data?.refresh?.insertedCount ?? 0,
  expiredCount: refreshPayload?.data?.refresh?.expiredCount ?? 0,
  analysesAttempted: refreshPayload?.data?.refresh?.analysesAttempted ?? 0,
  candidatesCreated: refreshPayload?.data?.refresh?.candidatesCreated ?? 0,
  autoPublishAttempted: autoPublishPayload?.data?.autoPublish?.attempted ?? 0,
  published: autoPublishPayload?.data?.autoPublish?.published ?? 0,
  autoPublishDeferred: autoPublishPayload?.data?.autoPublish?.deferred ?? 0,
  autoPublishFailed: autoPublishPayload?.data?.autoPublish?.failed ?? 0,
  refreshDurationMs: refreshPayload?.meta?.durationMs ?? null,
  autoPublishDurationMs: autoPublishPayload?.meta?.durationMs ?? null,
};
console.log(JSON.stringify(summary));

if (summary.autoPublishFailed > 0) {
  throw new Error("MOKUANG_AUTO_PUBLISH_PARTIAL_FAILURE");
}

async function callInternalEndpoint(pathname, failureCode) {
  const response = await fetch(new URL(pathname, siteUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${reviewToken}`,
      "oai-sites-authorization": `Bearer ${sitesBypassToken}`,
      "user-agent": "mokuang-external-scheduler/1.0",
    },
    signal: AbortSignal.timeout(240_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.error?.code ?? `HTTP_${response.status}`;
    throw new Error(`${failureCode}:${code}`);
  }
  return payload;
}

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
