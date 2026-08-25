import { XMLParser } from "fast-xml-parser";
import { normalizedFeedItemSchema, type NormalizedFeedItem, type SourceDefinition } from "./types";

const MAX_FEED_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const MAX_ITEMS = 50;
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
  if (!/(xml|rss|atom|text\/plain)/.test(contentType)) {
    throw new FeedIngestionError("FEED_CONTENT_TYPE_UNSUPPORTED", "Source did not return an XML feed");
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_FEED_BYTES) {
    throw new FeedIngestionError("FEED_TOO_LARGE", "Feed exceeds the configured size limit");
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_FEED_BYTES) {
    throw new FeedIngestionError("FEED_TOO_LARGE", "Feed exceeds the configured size limit");
  }

  return parseFeedXml(new TextDecoder().decode(bytes), source);
}

export async function fetchWithAllowlist(
  source: SourceDefinition,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  let currentUrl = new URL(source.feedUrl);
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
    const rawLink = readLink(item.link);
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

    const externalId = cleanText(readText(item.guid) || readText(item.id) || canonicalUrl).slice(0, 1_000);
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

function canonicalizeItemUrl(value: string, source: SourceDefinition): string {
  const url = new URL(value, source.homepageUrl);
  assertAllowedUrl(url, source.allowedHosts);
  url.hash = "";
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
