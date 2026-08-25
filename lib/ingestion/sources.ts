import { sourceDefinitionSchema, type SourceDefinition } from "./types";

const officialRssNote = "官方页面明确提供 RSS 入口；仅保存标题、链接、时间与不超过 4,000 字符的必要摘录。";
const rssRobotsNote = "只访问公开 RSS 端点，不抓取登录页、付费墙或受访问控制页面。";

export const curatedSources: SourceDefinition[] = [
  {
    id: "src-openai-news",
    name: "OpenAI News",
    homepageUrl: "https://openai.com/news/",
    feedUrl: "https://openai.com/news/rss.xml",
    sourceType: "official",
    fetchMethod: "rss",
    status: "active",
    priority: 10,
    frequencyMinutes: 30,
    allowedHosts: ["openai.com"],
    authorizationStatus: "approved",
    termsNote: officialRssNote,
    robotsNote: rssRobotsNote,
  },
  {
    id: "src-google-blog",
    name: "Google Blog",
    homepageUrl: "https://blog.google/feed/",
    feedUrl: "https://blog.google/rss/",
    sourceType: "official",
    fetchMethod: "rss",
    status: "active",
    priority: 20,
    frequencyMinutes: 30,
    allowedHosts: ["blog.google"],
    authorizationStatus: "approved",
    termsNote: officialRssNote,
    robotsNote: rssRobotsNote,
  },
  {
    id: "src-github-changelog",
    name: "GitHub Changelog",
    homepageUrl: "https://github.blog/changelog/",
    feedUrl: "https://github.blog/changelog/feed/",
    sourceType: "official",
    fetchMethod: "rss",
    status: "active",
    priority: 30,
    frequencyMinutes: 30,
    allowedHosts: ["github.blog"],
    authorizationStatus: "approved",
    termsNote: officialRssNote,
    robotsNote: rssRobotsNote,
  },
].map((source) => sourceDefinitionSchema.parse(source));

export function getCuratedSource(sourceId: string): SourceDefinition | null {
  return curatedSources.find((source) => source.id === sourceId) ?? null;
}
