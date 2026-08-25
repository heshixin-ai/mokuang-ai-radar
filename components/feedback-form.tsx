"use client";

import { useState } from "react";

export function FeedbackForm({ kind }: { kind: "correction" | "privacy" }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, email: form.get("email"), eventId: form.get("eventId") || null, message: form.get("message"), website: form.get("website") }) });
    const payload = await response.json() as { data?: { requestId: string }; error?: { message: string } };
    setBusy(false); setNotice(response.ok ? `已收到，编号 ${payload.data?.requestId}` : payload.error?.message ?? "提交失败，请稍后重试。"); if (response.ok) setMessage("");
  }
  return <form className="feedback-form" onSubmit={submit}><label>联系邮箱<input name="email" type="email" required /></label>{kind === "correction" && <label>事件 ID 或链接（可选）<input name="eventId" maxLength={200} /></label>}<label>{kind === "correction" ? "需要纠正的事实与依据" : "隐私请求内容"}<textarea name="message" required minLength={20} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} /></label><label className="feedback-honeypot" aria-hidden="true">网站<input name="website" tabIndex={-1} autoComplete="off" /></label><button type="submit" disabled={busy}>{busy ? "提交中…" : "提交请求"}</button>{notice && <p role="status">{notice}</p>}</form>;
}
