import Link from "@/components/site-link";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <main>
      <SiteHeader />
      <section className="not-found">
        <span>404 / SIGNAL LOST</span>
        <h1>没有找到这条变化。</h1>
        <p>它可能已经被合并、撤回，或者这个链接并不存在。</p>
        <Link href="/#events">返回情报列表</Link>
      </section>
    </main>
  );
}
