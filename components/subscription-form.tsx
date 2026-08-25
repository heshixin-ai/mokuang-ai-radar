"use client";

import { useState } from "react";
import { topicLabels, topicSlugs } from "@/lib/subscriptions/types";

export function SubscriptionForm() {
  const [email, setEmail] = useState("");
  const [topics, setTopics] = useState<string[]>([...topicSlugs]);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ busy: boolean; message: string; previewUrl?: string }>({ busy: false, message: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setState({ busy: true, message: "" });
    try {
      const response = await fetch("/api/v1/subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, topics, consent }) });
      const payload = await response.json() as { data?: { previewUrl?: string }; error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "订阅请求失败。");
      setState({ busy: false, message: "确认邮件已进入发送队列，请到邮箱完成确认。", previewUrl: payload.data?.previewUrl });
    } catch (error) {
      setState({ busy: false, message: error instanceof Error ? error.message : "订阅请求失败。" });
    }
  }

  return <form className="subscription-form" onSubmit={submit}>
    <label>邮箱<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
    <fieldset><legend>关注主题</legend><div>{topicSlugs.map((topic) => <label key={topic}><input type="checkbox" checked={topics.includes(topic)} onChange={(event) => setTopics((current) => event.target.checked ? [...current, topic] : current.filter((item) => item !== topic))} />{topicLabels[topic]}</label>)}</div></fieldset>
    <label className="consent"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />我同意接收模况日报，并可随时通过邮件底部链接退订。</label>
    <button type="submit" disabled={state.busy || topics.length === 0}>{state.busy ? "提交中…" : "发送确认邮件"}</button>
    {state.message && <p role="status">{state.message}</p>}
    {state.previewUrl && <p className="local-preview">本地 outbox：<a href={state.previewUrl}>打开确认链接</a></p>}
  </form>;
}
