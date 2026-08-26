import Link from "@/components/site-link";

export function SiteHeader() {
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
        <Link className="active" href="/#events">情报</Link>
        <Link href="/topics">主题</Link>
        <Link href="/entities">实体</Link>
        <Link href="/#workflow">处理流程</Link>
        <Link href="/about">关于</Link>
      </nav>
      <Link className="subscribe-button" href="/subscribe">订阅日报</Link>
    </header>
  );
}
