import Link from "@/components/site-link";

export type SiteNavKey = "intel" | "topics";

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
      </nav>
      <form className="site-logout" action="/api/v1/invite/logout" method="post">
        <button className="subscribe-button" type="submit">退出访问</button>
      </form>
    </header>
  );
}
