import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function ReviewForbiddenPage() {
  return (
    <main>
      <SiteHeader />
      <section className="not-found">
        <span>403 · REVIEW ACCESS</span>
        <h1>这个账号没有审核权限。</h1>
        <p>请让站点管理员把你的邮箱加入 REVIEW_ADMIN_EMAILS 白名单。</p>
        <Link href="/">返回首页</Link>
      </section>
    </main>
  );
}
