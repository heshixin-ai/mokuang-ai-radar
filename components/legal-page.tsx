import { SiteHeader, type SiteNavKey } from "@/components/site-header";

export function LegalPage({ eyebrow, title, intro, children, activeNav }: { eyebrow: string; title: string; intro: string; children: React.ReactNode; activeNav?: SiteNavKey }) {
  return <main><SiteHeader active={activeNav} /><article className="legal-shell"><span className="section-label">{eyebrow}</span><h1>{title}</h1><p className="legal-intro">{intro}</p><div className="legal-content">{children}</div><small>最后更新：2026 年 8 月 25 日</small></article></main>;
}
