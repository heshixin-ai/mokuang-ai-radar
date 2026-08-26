"use client";

import { useState } from "react";

export function InviteForm({ returnTo }: { returnTo: string }) {
  const [code, setCode] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ busy: true, message: "" });
    try {
      const response = await fetch("/api/v1/invite/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, returnTo }),
      });
      const payload = await response.json() as { data?: { returnTo?: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "邀请码验证失败。");
      window.location.assign(payload.data?.returnTo ?? "/");
    } catch (error) {
      setState({ busy: false, message: error instanceof Error ? error.message : "邀请码验证失败。" });
    }
  }

  return (
    <form className="invite-form" onSubmit={submit}>
      <label htmlFor="invite-code">邀请码</label>
      <div>
        <input
          id="invite-code"
          name="invite-code"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck={false}
          placeholder="MK-XXXX-XXXX-XXXX"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          required
          maxLength={24}
        />
        <button type="submit" disabled={state.busy || code.trim().length === 0}>
          {state.busy ? "验证中…" : "进入模况"}
        </button>
      </div>
      {state.message && <p role="alert">{state.message}</p>}
    </form>
  );
}
