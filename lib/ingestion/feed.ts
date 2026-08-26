import { XMLParser } from "fast-xml-parser";
import { normalizedFeedItemSchema, type NormalizedFeedItem, type SourceDefinition } from "./types";

const MAX_FEED_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const MAX_ITEMS = 50;
const MAX_HTML_ITEMS = 10;
const TRACKING_PARAMETERS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"]);

export class FeedIngestionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FeedIngestionError";
  }
}

export async function fetchAndParseFeed(
  source: SourceDefinition,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<NormalizedFeedItem[]> {
  const response = await fetchWithAllowlist(source, options.fetchImpl ?? fetch, options.timeoutMs ?? 12_000);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const isHtmlSource = source.fetchMethod === "html";
  if (isHtmlSource ? !contentType.includes("text/html") : !/(xml|rss|atom|text\/plain)/.test(contentType)) {
    throw new FeedIngestionError("FEED_CONTENT_TYPE_UNSUPPORTED", "Source returned an unsupported content type");
  }
  const body = await readLimitedBody(response);
  if (!isHtmlSource) return parseFeedXml(body, source);
  return parseControlledHtmlSource(body, source, async (url) => {
    const articleResponse = await fetchWithAllowlist(
      source,
      options.fetchImpl ?? fetch,
      options.timeoutMs ?? 12_000,
      url,
    );
    const articleContentType = articleResponse.headers.get("content-type")?.toLowerCase() ?? "";
    const isGovernmentPolicyJson = source.id === "src-china-government-policy"
      && new URL(url).pathname.endsWith("/ZUIXINZHENGCE.json")
      && articleContentType.includes("application/json");
    if (!articleContentType.includes("text/html") && !isGovernmentPolicyJson) {
      throw new FeedIngestionError("FEED_CONTENT_TYPE_UNSUPPORTED", "Source detail returned an unsupported content type");
    }
    return readLimitedBody(articleResponse);
  });
}

export async function fetchWithAllowlist(
  source: SourceDefinition,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  initialUrl: string | URL = source.feedUrl,
): Promise<Response> {
  let currentUrl = new URL(initialUrl, source.feedUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    assertAllowedUrl(currentUrl, source.allowedHosts);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        headers: {
          accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
          "user-agent": "MokuangFeedReader/0.1 (+https://mokuang.local/about)",
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new FeedIngestionError("FEED_TIMEOUT", "Source request timed out");
      }
      throw new FeedIngestionError("FEED_NETWORK_ERROR", "Source request failed");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new FeedIngestionError("FEED_REDIRECT_REJECTED", "Source redirect could not be followed safely");
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new FeedIngestionError("FEED_HTTP_ERROR", `Source returned HTTP ${response.status}`);
    }
    return response;
  }

  throw new FeedIngestionError("FEED_REDIRECT_REJECTED", "Source exceeded redirect limit");
}

async function readLimitedBody(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_FEED_BYTES) {
    throw new FeedIngestionError("FEED_TOO_LARGE", "Source exceeds the configured size limit");
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_FEED_BYTES) {
    throw new FeedIngestionError("FEED_TOO_LARGE", "Source exceeds the configured size limit");
  }
  return new TextDecoder().decode(bytes);
}

export async function parseFeedXml(xml: string, source: SourceDefinition): Promise<NormalizedFeedItem[]> {
  let parsed: Record<string, unknown>;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      trimValues: true,
      processEntities: true,
    }).parse(xml) as Record<string, unknown>;
  } catch {
    throw new FeedIngestionError("FEED_XML_INVALID", "Feed XML could not be parsed");
  }

  const rawItems = extractItems(parsed).slice(0, MAX_ITEMS);
  const normalized: Array<Omit<NormalizedFeedItem, "contentHash">> = [];
  for (const item of rawItems) {
    const title = cleanText(readText(item.title)).slice(0, 500);
    const guidOrId = readText(item.guid) || readText(item.id);
    const rawLink = readLink(item.link) || (isHttpUrl(guidOrId) ? guidOrId : "");
    const publishedAt = normalizeDate(
      readText(item.pubDate) || readText(item.published) || readText(item.updated) || readText(item.date),
    );
    const rawContent = readText(item["content:encoded"])
      || readText(item.content)
      || readText(item.summary)
      || readText(item.description);
    const contentExcerpt = cleanText(`${title}. ${rawContent}`).slice(0, 4_000);
    if (!title || !rawLink || !publishedAt || contentExcerpt.length < 20) continue;

    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeItemUrl(rawLink, source);
    } catch {
      continue;
    }

    const externalId = cleanText(guidOrId || canonicalUrl).slice(0, 1_000);
    const author = cleanText(
      readText(item.author) || readText(item["dc:creator"]),
    ).slice(0, 300) || null;
    normalized.push({
      externalId,
      canonicalUrl,
      title,
      author,
      publishedAt,
      contentExcerpt,
    });
  }

  return Promise.all(normalized.map(async (item) => normalizedFeedItemSchema.parse({
    ...item,
    contentHash: await sha256Hex(`${item.title}\n${item.contentExcerpt}`),
  })));
}

export async function parseControlledHtmlSource(
  html: string,
  source: SourceDefinition,
  loadPage?: (url: string) => Promise<string>,
): Promise<NormalizedFeedItem[]> {
  if (source.id === "src-deepseek-api-changelog") return parseDeepSeekChangelog(html, source);
  if (source.id === "src-alibaba-model-studio-releases") return parseAlibabaModelReleases(html, source);
  if (source.id === "src-kimi-platform-blog") return parseKimiBlog(html, source, loadPage);
  if (source.id === "src-china-government-policy") return parseChinaGovernmentPolicy(html, source, loadPage);
  throw new FeedIngestionError("HTML_SOURCE_UNSUPPORTED", "HTML source does not have a controlled parser");
}

async function parseChinaGovernmentPolicy(
  html: string,
  source: SourceDefinition,
  loadPage?: (url: string) => Promise<string>,
): Promise<NormalizedFeedItem[]> {
  if (!loadPage || !html.includes("ZUIXINZHENGCE.json")) {
    throw new FeedIngestionError("GOV_POLICY_INDEX_INVALID", "Government policy index did not expose its public data file");
  }

  let records: unknown;
  try {
    records = JSON.parse(await loadPage(new URL("./ZUIXINZHENGCE.json", source.feedUrl).toString()));
  } catch {
    throw new FeedIngestionError("GOV_POLICY_JSON_INVALID", "Government policy data could not be parsed");
  }
  if (!Array.isArray(records)) {
    throw new FeedIngestionError("GOV_POLICY_JSON_INVALID", "Government policy data did not contain a list");
  }

  const items = records.map((record) => {
    if (!record || typeof record !== "object") return null;
    const value = record as Record<string, unknown>;
    const title = cleanText(String(value.TITLE ?? "")).slice(0, 500);
    const rawUrl = String(value.URL ?? "");
    const publishedDate = String(value.DOCRELPUBTIME ?? "");
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(publishedDate)) return null;
    try {
      return {
        title,
        canonicalUrl: canonicalizeItemUrl(rawUrl, source),
        publishedAt: new Date(`${publishedDate}T00:00:00+08:00`).toISOString(),
      };
    } catch {
      return null;
    }
  }).filter((item): item is { title: string; canonicalUrl: string; publishedAt: string } => Boolean(item))
    .slice(0, MAX_HTML_ITEMS);

  const enriched = await mapInBatches(items, 3, async (item) => {
    let articleText = "";
    try {
      articleText = cleanText(extractGovernmentPolicyArticleHtml(await loadPage(item.canonicalUrl)));
    } catch {
      articleText = "";
    }
    return {
      externalId: item.canonicalUrl,
      canonicalUrl: item.canonicalUrl,
      title: item.title,
      author: source.name,
      publishedAt: item.publishedAt,
      contentExcerpt: cleanText(`${item.title}。${articleText || item.title}`).slice(0, 4_000),
    };
  });
  return addContentHashes(enriched.filter((item) => item.contentExcerpt.length >= 20));
}

function extractGovernmentPolicyArticleHtml(html: string): string {
  const content = html.match(/<div\b[^>]*(?:id="UCAP-CONTENT"|class="[^"]*pages_content[^"]*")[^>]*>([\s\S]*?)<\/div>/i);
  return content?.[1] ?? extractArticleHtml(html);
}

async function parseDeepSeekChangelog(html: string, source: SourceDefinition): Promise<NormalizedFeedItem[]> {
  const article = extractArticleHtml(html);
  const rawItems: Array<Omit<NormalizedFeedItem, "contentHash">> = [];
  const datePattern = /<h2\b[^>]*id="date-(\d{4}-\d{2}-\d{2})"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?=<h2\b|<\/article>|$)/gi;
  for (const dateMatch of article.matchAll(datePattern)) {
    const [, date, section] = dateMatch;
    const headings = [...section.matchAll(/<h3\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h3>/gi)];
    for (let index = 0; index < headings.length; index += 1) {
      const heading = headings[index];
      const nextHeading = headings[index + 1];
      const title = cleanText(heading[2]).slice(0, 500);
      const bodyStart = (heading.index ?? 0) + heading[0].length;
      const bodyEnd = nextHeading?.index ?? section.length;
      const contentExcerpt = cleanText(`${title}. ${section.slice(bodyStart, bodyEnd)}`).slice(0, 4_000);
      if (!title || contentExcerpt.length < 20) continue;
      const canonicalUrl = canonicalizeItemUrl(`${source.feedUrl}#${heading[1]}`, source, true);
      rawItems.push({
        externalId: `${date}#${heading[1]}`,
        canonicalUrl,
        title,
        author: source.name,
        publishedAt: new Date(`${date}T00:00:00.000Z`).toISOString(),
        contentExcerpt,
      });
    }
  }
  return addContentHashes(rawItems.slice(0, MAX_HTML_ITEMS));
}

async function parseAlibabaModelReleases(
  html: string,
  source: SourceDefinition,
): Promise<NormalizedFeedItem[]> {
  const byExternalId = new Map<string, Omit<NormalizedFeedItem, "contentHash">>();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => cleanText(cell[1]));
    const dateIndex = cells.findIndex((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell));
    if (dateIndex < 1 || cells.length - dateIndex < 3) continue;

    const publishedDate = cells[dateIndex];
    const modelId = cells.at(-2)?.slice(0, 300) ?? "";
    const description = cells.at(-1)?.slice(0, 3_500) ?? "";
    const modelType = cells[0]?.slice(0, 100) ?? "模型";
    if (!modelId || description.length < 20) continue;

    const externalId = `${publishedDate}#${modelId}`;
    if (byExternalId.has(externalId)) continue;
    const fragment = `${publishedDate}-${modelId}`
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 180);
    const canonicalUrl = canonicalizeItemUrl(`${source.feedUrl}#${fragment}`, source, true);
    const title = `${modelId} 上线（${modelType}）`.slice(0, 500);
    byExternalId.set(externalId, {
      externalId,
      canonicalUrl,
      title,
      author: source.name,
      publishedAt: new Date(`${publishedDate}T00:00:00+08:00`).toISOString(),
      contentExcerpt: cleanText(`${title}。${description}`).slice(0, 4_000),
    });
  }

  const items = [...byExternalId.values()]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .slice(0, MAX_HTML_ITEMS);
  return addContentHashes(items);
}

async function parseKimiBlog(
  html: string,
  source: SourceDefinition,
  loadPage?: (url: string) => Promise<string>,
): Promise<NormalizedFeedItem[]> {
  const rawItems = [...html.matchAll(/<div\b[^>]*class="[^"]*post-item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
    .map((match) => {
      const link = match[1].match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const date = match[1].match(/<time\b[^>]*datetime="([^"]+)"/i);
      if (!link || !date) return null;
      const title = cleanText(link[2]).slice(0, 500);
      const canonicalUrl = canonicalizeItemUrl(link[1], source);
      const publishedAt = normalizeDate(date[1]);
      return title && publishedAt ? { title, canonicalUrl, publishedAt } : null;
    })
    .filter((item): item is { title: string; canonicalUrl: string; publishedAt: string } => Boolean(item))
    .slice(0, MAX_HTML_ITEMS);

  const enriched = await mapInBatches(rawItems, 3, async (item) => {
    let articleText = "";
    if (loadPage) {
      try {
        articleText = cleanText(extractArticleHtml(await loadPage(item.canonicalUrl)));
      } catch {
        articleText = "";
      }
    }
    return {
      externalId: item.canonicalUrl,
      canonicalUrl: item.canonicalUrl,
      title: item.title,
      author: source.name,
      publishedAt: item.publishedAt,
      contentExcerpt: cleanText(`${item.title}. ${articleText || item.title}`).slice(0, 4_000),
    };
  });
  return addContentHashes(enriched.filter((item) => item.contentExcerpt.length >= 20));
}

function extractArticleHtml(html: string): string {
  return html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? html;
}

async function addContentHashes(
  items: Array<Omit<NormalizedFeedItem, "contentHash">>,
): Promise<NormalizedFeedItem[]> {
  return Promise.all(items.map(async (item) => normalizedFeedItemSchema.parse({
    ...item,
    contentHash: await sha256Hex(`${item.title}\n${item.contentExcerpt}`),
  })));
}

async function mapInBatches<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < values.length; index += concurrency) {
    results.push(...await Promise.all(values.slice(index, index + concurrency).map(operation)));
  }
  return results;
}

function extractItems(parsed: Record<string, unknown>): Array<Record<string, unknown>> {
  const rss = asRecord(parsed.rss);
  const channel = asRecord(rss?.channel);
  const feed = asRecord(parsed.feed);
  const items = channel?.item ?? feed?.entry ?? [];
  return asArray(items).map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function readLink(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const alternate = value.map(asRecord).find((item) => item?.["@_rel"] === "alternate") ?? asRecord(value[0]);
    return readText(alternate?.["@_href"] ?? value[0]);
  }
  const record = asRecord(value);
  return readText(record?.["@_href"] ?? record?.["#text"]);
}

function readText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(readText).find(Boolean) ?? "";
  const record = asRecord(value);
  if (!record) return "";
  return readText(record["#text"] ?? record.name ?? record.value);
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizeDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function canonicalizeItemUrl(value: string, source: SourceDefinition, preserveHash = false): string {
  const url = new URL(value, source.homepageUrl);
  assertAllowedUrl(url, source.allowedHosts);
  if (!preserveHash) url.hash = "";
  for (const name of [...url.searchParams.keys()]) {
    if (name.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(name.toLowerCase())) {
      url.searchParams.delete(name);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

function assertAllowedUrl(url: URL, allowedHosts: string[]): void {
  const allowed = allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  if (url.protocol !== "https:" || !allowed || url.username || url.password) {
    throw new FeedIngestionError("FEED_URL_NOT_ALLOWED", "Source URL is outside the configured allowlist");
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function stableDocumentId(sourceId: string, externalId: string): Promise<string> {
  return `doc_${(await sha256Hex(`${sourceId}\n${externalId}`)).slice(0, 24)}`;
}
