import { InviteForm } from "@/components/invite-form";
import { safeInviteReturnPath } from "@/lib/auth/invite-access";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const returnTo = safeInviteReturnPath(Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo);
  return (
    <main className="invite-page">
      <section className="invite-card" aria-labelledby="invite-title">
        <div className="invite-brand"><span>模</span><div><strong>模况</strong><small>MOKUANG</small></div></div>
        <div className="invite-eyebrow"><span /> INVITE-ONLY AI RADAR</div>
        <h1 id="invite-title">只看 AI 真正<br />发生的变化。</h1>
        <p>模况目前采用邀请访问。输入邀请码后，这台设备将在 7 天内保持访问，无需邮箱或注册账号。</p>
        <InviteForm returnTo={returnTo} />
        <small className="invite-note">邀请码仅用于小范围测试，请勿公开转发。</small>
      </section>
    </main>
  );
}
