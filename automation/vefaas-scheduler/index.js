exports.handler = async function handler() {
  const siteUrl = requiredUrl("MOKUANG_SITE_URL");
  const reviewToken = requiredSecret("REVIEW_AUTOMATION_TOKEN");
  const sitesBypassToken = requiredSecret("SITES_BYPASS_TOKEN");
  const endpoint = new URL("/api/v1/admin/refresh", siteUrl);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${reviewToken}`,
      "oai-sites-authorization": `Bearer ${sitesBypassToken}`,
      "user-agent": "mokuang-vefaas-scheduler/1.0",
    },
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.error?.code ?? `HTTP_${response.status}`;
    throw new Error(`MOKUANG_REFRESH_FAILED:${code}`);
  }

  const summary = {
    ok: true,
    scheduledAt: payload?.data?.refresh?.scheduledAt ?? null,
    sourcesAttempted: payload?.data?.refresh?.sourcesAttempted ?? 0,
    sourcesSucceeded: payload?.data?.refresh?.sourcesSucceeded ?? 0,
    sourcesFailed: payload?.data?.refresh?.sourcesFailed ?? 0,
    insertedCount: payload?.data?.refresh?.insertedCount ?? 0,
    analysesAttempted: payload?.data?.refresh?.analysesAttempted ?? 0,
    candidatesCreated: payload?.data?.refresh?.candidatesCreated ?? 0,
    durationMs: payload?.meta?.durationMs ?? null,
  };
  console.log("mokuang_external_refresh", JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};

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
