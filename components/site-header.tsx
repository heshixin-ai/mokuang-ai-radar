import Link from "@/components/site-link";

export type SiteNavKey = "intel" | "topics" | "entities" | "about";

export function SiteHeader({ active }: { active?: SiteNavKey } = {}) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="模况首页">
        <span className="brand-mark">模</span>
        <span>
          <strong>模况</strong>
          <small>MOKUANG</small>
        </span>
      </Link>
      <nav className="main-nav" aria-label="主导航">
        <Link className={active === "intel" ? "active" : undefined} href="/#events">情报</Link>
        <Link className={active === "topics" ? "active" : undefined} href="/topics">主题</Link>
        <Link className={active === "entities" ? "active" : undefined} href="/entities">实体</Link>
        <Link href="/#workflow">处理流程</Link>
        <Link className={active === "about" ? "active" : undefined} href="/about">关于</Link>
      </nav>
      <Link className="subscribe-button" href="/subscribe">订阅日报</Link>
    </header>
  );
}
