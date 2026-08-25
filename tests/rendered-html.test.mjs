import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

function request(path, init) {
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("首页呈现模况产品信息而非 starter", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /模况 Mokuang｜AI 产品与模型变更雷达/);
  assert.match(html, /跟上 AI 的变化/);
  assert.match(html, /演示数据/);
  assert.match(html, /值得你处理的变化/);
  assert.match(html, /property="og:image"[^>]*content="http:\/\/localhost(?::3000)?\/og\.png"|content="http:\/\/localhost(?::3000)?\/og\.png"[^>]*property="og:image"/i);
  assert.match(html, /name="twitter:card"[^>]*content="summary_large_image"|content="summary_large_image"[^>]*name="twitter:card"/i);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("事件详情使用事件自己的标题与说明", async () => {
  const response = await request("/events/evt-orbit-3-release");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Orbit AI 发布 Orbit 3/);
  assert.match(html, /发生了什么/);
  assert.match(html, /证据与来源/);
  assert.match(html, /严格 JSON Schema 输出/);
  assert.match(html, /<title>[^<]*Orbit AI 发布 Orbit 3[^<]*模况[^<]*<\/title>/);
  assert.match(html, /property="og:title"[^>]*Orbit AI 发布 Orbit 3|Orbit AI 发布 Orbit 3[^>]*property="og:title"/i);
  assert.doesNotMatch(html, /og\.png/);
});

test("事件 API 返回受控 JSON，缺失事件返回统一错误", async () => {
  const listResponse = await request("/api/v1/events?type=api_change", { headers: { accept: "application/json" } });
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.meta.demo, true);
  assert.equal(list.meta.count, 1);
  assert.equal(list.data[0].id, "evt-vector-api-sunset");

  const missingResponse = await request("/api/v1/events/evt-missing", { headers: { accept: "application/json" } });
  assert.equal(missingResponse.status, 404);
  const missing = await missingResponse.json();
  assert.equal(missing.error.code, "EVENT_NOT_FOUND");
  assert.ok(missing.error.requestId);
});
