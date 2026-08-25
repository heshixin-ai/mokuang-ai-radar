import { describe, expect, it } from "vitest";
import { readAiConfig } from "@/lib/ai/config";
import { getReviewActorFromHeaders } from "@/lib/auth/review-access";
import { fetchWithAllowlist, parseFeedXml } from "@/lib/ingestion/feed";
import { runScheduledRefresh } from "@/lib/ingestion/scheduler";
import {
  analyzeSourceDocument,
  runSourceIngestion,
  reviewEventCandidate,
} from "@/lib/ingestion/service";
import { curatedSources, getCuratedSource } from "@/lib/ingestion/sources";
import type {
  CandidateView,
  DashboardData,
  DocumentView,
  NormalizedFeedItem,
  SourceDefinition,
} from "@/lib/ingestion/types";
import type {
  IngestionRepository,
  ReviewAction,
  ReviewActor,
} from "@/lib/repository/ingestion-contract";
import type { PipelinePreviewOutput } from "@/lib/domain/event";

const openAiSource = getCuratedSource("src-openai-news")!;
const actor: ReviewActor = { id: "reviewer-1", email: "reviewer@example.com", displayName: "审核员" };

describe("feed ingestion", () => {
  it("parses RSS into normalized, short and traceable items", async () => {
    const items = await parseFeedXml(`
      <rss version="2.0"><channel><title>OpenAI News</title><item>
        <guid>release-1</guid><title>API model update</title>
        <link>https://openai.com/index/update/?utm_source=rss#top</link>
        <pubDate>Tue, 25 Aug 2026 06:00:00 GMT</pubDate>
        <description><![CDATA[<p>The API model was released with a new identifier and compatibility notes.</p>]]></description>
      </item></channel></rss>
    `, openAiSource);

    expect(items).toHaveLength(1);
    expect(items[0].canonicalUrl).toBe("https://openai.com/index/update/");
    expect(items[0].contentExcerpt).toContain("new identifier");
    expect(items[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("parses Atom links and rejects redirect hosts outside the source allowlist", async () => {
    const atomItems = await parseFeedXml(`
      <feed xmlns="http://www.w3.org/2005/Atom"><entry>
        <id>tag:openai.com,2026:update</id><title>Model release</title>
        <link rel="alternate" href="https://openai.com/index/model-release/" />
        <updated>2026-08-25T06:00:00Z</updated>
        <summary>A model release with documented API behavior and availability.</summary>
      </entry></feed>
    `, openAiSource);
    expect(atomItems[0].externalId).toContain("update");

    const redirectingFetch = async () => new Response(null, {
      status: 302,
      headers: { location: "https://127.0.0.1/private.xml" },
    });
    await expect(fetchWithAllowlist(openAiSource, redirectingFetch as typeof fetch, 1_000))
      .rejects.toMatchObject({ code: "FEED_URL_NOT_ALLOWED" });
  });

  it("uses a URL guid when an official RSS item omits its link", async () => {
    const huggingFaceSource = getCuratedSource("src-huggingface-blog")!;
    const items = await parseFeedXml(`
      <rss version="2.0"><channel><item>
        <guid>https://huggingface.co/blog/model-release</guid>
        <title>Model release on Hugging Face</title>
        <pubDate>Tue, 25 Aug 2026 06:00:00 GMT</pubDate>
        <description>A documented model release with availability and usage details.</description>
      </item></channel></rss>
    `, huggingFaceSource);
    expect(items[0].canonicalUrl).toBe("https://huggingface.co/blog/model-release");
  });

  it("keeps exactly twelve approved, unique and controlled sources", () => {
    expect(curatedSources).toHaveLength(12);
    expect(new Set(curatedSources.map((source) => source.id)).size).toBe(12);
    expect(new Set(curatedSources.map((source) => source.feedUrl)).size).toBe(12);
    expect(curatedSources.every((source) => source.authorizationStatus === "approved")).toBe(true);
  });
});

describe("persisted ingestion and review workflow", () => {
  it("persists a run, deduplicates URLs and retains recoverable counts", async () => {
    const repository = new MemoryIngestionRepository();
    const item = makeItem();
    const clock = steppedClock();
    const first = await runSourceIngestion(openAiSource.id, actor, {
      repository,
      fetchFeed: async () => [item],
      clock,
      idFactory: () => "run-one",
    });
    const second = await runSourceIngestion(openAiSource.id, actor, {
      repository,
      fetchFeed: async () => [item],
      clock,
      idFactory: () => "run-two",
    });

    expect(first).toMatchObject({ insertedCount: 1, duplicateCount: 0 });
    expect(second).toMatchObject({ insertedCount: 0, duplicateCount: 1 });
    expect(repository.documents).toHaveLength(1);
    expect(repository.runs.get("run_run-two")?.status).toBe("succeeded");
  });

  it("moves one document through mock AI into a pending candidate", async () => {
    const repository = new MemoryIngestionRepository();
    await runSourceIngestion(openAiSource.id, actor, {
      repository,
      fetchFeed: async () => [makeItem()],
      clock: steppedClock(),
      idFactory: () => "analysis-run",
    });
    const documentId = repository.documents[0].id;
    const result = await analyzeSourceDocument(documentId, {
      repository,
      config: readAiConfig({ AI_PROVIDER: "mock" }),
      clock: steppedClock(),
    });

    expect(result.status).toBe("candidate_created");
    expect(result.output.eventType).toBe("api_change");
    expect(repository.documents[0].status).toBe("candidate_created");
    expect(repository.candidates[0]).toMatchObject({ reviewStatus: "pending", documentId });
  });

  it("requires a valid review transition and keeps an audit trail", async () => {
    const repository = new MemoryIngestionRepository();
    await runSourceIngestion(openAiSource.id, actor, {
      repository,
      fetchFeed: async () => [makeItem()],
      clock: steppedClock(),
      idFactory: () => "review-run",
    });
    await analyzeSourceDocument(repository.documents[0].id, {
      repository,
      config: readAiConfig({ AI_PROVIDER: "mock" }),
      clock: steppedClock(),
    });
    const candidateId = repository.candidates[0].id;

    const approved = await reviewEventCandidate(candidateId, "approve", "证据可核验", actor, {
      repository,
      clock: steppedClock(),
      idFactory: () => "approve",
    });
    expect(approved.reviewStatus).toBe("approved");
    expect(repository.audit).toEqual(["approve"]);
    await expect(reviewEventCandidate(candidateId, "approve", null, actor, { repository }))
      .rejects.toMatchObject({ code: "REVIEW_STATE_CONFLICT" });

    const reopened = await reviewEventCandidate(candidateId, "reopen", "重新核对", actor, {
      repository,
      clock: steppedClock(),
      idFactory: () => "reopen",
    });
    expect(reopened.reviewStatus).toBe("pending");
    expect(repository.audit).toEqual(["approve", "reopen"]);
  });

  it("runs a bounded scheduled refresh and analyzes only the configured batch", async () => {
    const repository = new MemoryIngestionRepository();
    let id = 0;
    const summary = await runScheduledRefresh({
      repository,
      aiConfig: readAiConfig({ AI_PROVIDER: "mock" }),
      schedulerConfig: {
        INGESTION_SOURCE_BATCH_SIZE: 2,
        INGESTION_SOURCE_CONCURRENCY: 2,
        INGESTION_MAX_ITEMS_PER_SOURCE: 1,
        INGESTION_ANALYSIS_BATCH_SIZE: 1,
        INGESTION_ANALYSIS_MODE: "auto",
      },
      analysisEnabled: true,
      clock: () => new Date("2026-08-25T06:00:00.000Z"),
      idFactory: () => `scheduled-${id++}`,
      fetchFeed: async (source) => [makeSourceItem(source)],
    });

    expect(summary).toMatchObject({
      sourcesEligible: 2,
      sourcesSucceeded: 2,
      insertedCount: 2,
      analysesAttempted: 1,
      candidatesCreated: 1,
    });
    expect([...repository.runs.values()].every((run) => run.triggerKind === "scheduled")).toBe(true);
    expect(repository.documents.filter((document) => document.status === "pending_analysis")).toHaveLength(1);
  });
});

describe("review authorization", () => {
  it("allows local review only outside production and enforces production email allowlist", () => {
    expect(getReviewActorFromHeaders(new Headers(), { NODE_ENV: "development", REVIEW_AUTH_MODE: "local" }).ok).toBe(true);
    expect(getReviewActorFromHeaders(new Headers(), { NODE_ENV: "production" })).toEqual({ ok: false, reason: "unauthenticated" });

    const headers = new Headers({
      "oai-authenticated-user-id": "user-1",
      "oai-authenticated-user-email": "Reviewer@Example.com",
    });
    expect(getReviewActorFromHeaders(headers, {
      NODE_ENV: "production",
      REVIEW_ADMIN_EMAILS: "reviewer@example.com",
    }).ok).toBe(true);
    expect(getReviewActorFromHeaders(headers, {
      NODE_ENV: "production",
      REVIEW_ADMIN_EMAILS: "someone@example.com",
    })).toEqual({ ok: false, reason: "forbidden" });
  });
});

function makeItem(): NormalizedFeedItem {
  return {
    externalId: "api-update-2026",
    canonicalUrl: "https://openai.com/index/api-update-2026/",
    title: "OpenAI API model update",
    author: "OpenAI",
    publishedAt: "2026-08-25T06:00:00.000Z",
    contentExcerpt: "OpenAI released an API model update with a new model identifier and documented compatibility behavior.",
    contentHash: "a".repeat(64),
  };
}

function makeSourceItem(source: SourceDefinition): NormalizedFeedItem {
  const origin = new URL(source.homepageUrl).origin;
  return {
    ...makeItem(),
    externalId: `update-${source.id}`,
    canonicalUrl: `${origin}/mokuang-test/${source.id}`,
  };
}

function steppedClock() {
  let step = 0;
  return () => new Date(Date.UTC(2026, 7, 25, 6, 0, step++));
}

class MemoryIngestionRepository implements IngestionRepository {
  documents: DocumentView[] = [];
  candidates: CandidateView[] = [];
  audit: string[] = [];
  runs = new Map<string, { status: string; triggerKind: "manual" | "scheduled" }>();
  private sources: SourceDefinition[] = [];

  async syncSources(sources: SourceDefinition[]) { this.sources = sources; }
  async createRun(input: { id: string; triggerKind: "manual" | "scheduled" }) {
    this.runs.set(input.id, { status: "running", triggerKind: input.triggerKind });
    return true;
  }
  async finishRun(input: { id: string }) {
    const run = this.runs.get(input.id)!;
    this.runs.set(input.id, { ...run, status: "succeeded" });
  }
  async failRun(input: { id: string }) {
    const run = this.runs.get(input.id)!;
    this.runs.set(input.id, { ...run, status: "failed" });
  }

  async listDueSources(_now: string, limit: number) {
    return this.sources.slice(0, limit).map((source) => ({ id: source.id, lastSuccessAt: null }));
  }

  async listPendingDocumentIds(limit: number) {
    return this.documents
      .filter((document) => document.status === "pending_analysis")
      .slice(0, limit)
      .map((document) => document.id);
  }

  async insertDocument(input: { id: string; sourceId: string; item: NormalizedFeedItem; discoveredAt: string }) {
    if (this.documents.some((document) => document.canonicalUrl === input.item.canonicalUrl)) return false;
    const source = this.sources.find((candidate) => candidate.id === input.sourceId)!;
    this.documents.push({
      id: input.id,
      sourceId: input.sourceId,
      sourceName: source.name,
      canonicalUrl: input.item.canonicalUrl,
      title: input.item.title,
      author: input.item.author,
      publishedAt: input.item.publishedAt,
      discoveredAt: input.discoveredAt,
      contentExcerpt: input.item.contentExcerpt,
      status: "pending_analysis",
      analysisErrorCode: null,
    });
    return true;
  }

  async claimDocument(documentId: string) {
    const document = this.documents.find((candidate) => candidate.id === documentId);
    if (!document || !["pending_analysis", "analysis_failed"].includes(document.status)) return null;
    document.status = "analyzing";
    return { ...document };
  }

  async completeIrrelevant(documentId: string) {
    this.documents.find((document) => document.id === documentId)!.status = "irrelevant";
  }

  async completeCandidate(input: { documentId: string; candidateId: string; output: PipelinePreviewOutput; analysisMeta: import("@/lib/repository/ingestion-contract").AnalysisExecutionMeta; analyzedAt: string }) {
    const document = this.documents.find((candidate) => candidate.id === input.documentId)!;
    document.status = "candidate_created";
    this.candidates.push({
      id: input.candidateId,
      documentId: input.documentId,
      sourceName: document.sourceName,
      canonicalUrl: document.canonicalUrl,
      sourceTitle: document.title,
      publishedAt: document.publishedAt,
      reviewStatus: "pending",
      eventType: input.output.eventType!,
      titleZh: input.output.titleZh!,
      whatChanged: input.output.whatChanged!,
      evidenceLevel: input.output.evidenceLevel!,
      confidence: input.output.confidence,
      needsReview: input.output.needsReview,
      reviewReasons: input.output.reviewReasons,
      sourceIds: input.output.sourceIds,
      promptVersion: input.output.promptVersion,
      modelId: input.output.modelId,
      provider: input.analysisMeta.provider,
      escalated: input.analysisMeta.escalated,
      attempts: input.analysisMeta.attempts,
      latencyMs: input.analysisMeta.latencyMs,
      usage: input.analysisMeta.usage,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
      createdAt: input.analyzedAt,
    });
  }

  async failAnalysis(documentId: string, _failedAt: string, errorCode: string) {
    const document = this.documents.find((candidate) => candidate.id === documentId)!;
    document.status = "analysis_failed";
    document.analysisErrorCode = errorCode;
  }

  async reviewCandidate(input: {
    candidateId: string;
    action: ReviewAction;
    note: string | null;
    actor: ReviewActor;
    reviewedAt: string;
  }) {
    const candidate = this.candidates.find((item) => item.id === input.candidateId);
    if (!candidate) return null;
    if (input.action === "reopen") {
      if (candidate.reviewStatus === "pending") return null;
      candidate.reviewStatus = "pending";
      candidate.reviewedAt = null;
      candidate.reviewedBy = null;
      candidate.reviewNote = null;
    } else {
      if (candidate.reviewStatus !== "pending") return null;
      candidate.reviewStatus = input.action === "approve" ? "approved" : "rejected";
      candidate.reviewedAt = input.reviewedAt;
      candidate.reviewedBy = input.actor.email;
      candidate.reviewNote = input.note;
    }
    this.audit.push(input.action);
    return { ...candidate };
  }

  async getDashboard(): Promise<DashboardData> {
    throw new Error("not needed in this test");
  }
}
