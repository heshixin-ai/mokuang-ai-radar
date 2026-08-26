export const INVITE_COOKIE_NAME = "mokuang_access";
export const INVITE_SESSION_SECONDS = 7 * 24 * 60 * 60;

export type InviteRole = "reader" | "admin";
export type InviteSession = {
  version: 1;
  inviteId: string;
  role: InviteRole;
  expiresAt: number;
};

export type InviteAccessConfig = {
  enabled: boolean;
  secret: string | null;
};

export function readInviteAccessConfig(environment: Record<string, string | undefined>): InviteAccessConfig {
  const enabled = environment.INVITE_ACCESS_MODE === "enforced";
  const secret = environment.INVITE_SESSION_SECRET?.trim() || null;
  return { enabled, secret };
}

export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export async function hashInviteCode(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeInviteCode(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function redeemInviteCode(
  database: D1Database,
  rawCode: string,
  now = new Date(),
): Promise<{ inviteId: string; role: InviteRole } | null> {
  const code = normalizeInviteCode(rawCode);
  if (!/^MK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return null;

  const row = await database.prepare(`
    UPDATE invite_codes
    SET use_count = use_count + 1, last_used_at = ?
    WHERE code_hash = ?
      AND status = 'active'
      AND use_count < max_uses
      AND (expires_at IS NULL OR expires_at > ?)
    RETURNING id, role
  `).bind(now.toISOString(), await hashInviteCode(code), now.toISOString()).first<Record<string, unknown>>();
  if (!row) return null;

  const inviteId = String(row.id);
  const role = row.role === "admin" ? "admin" : "reader";
  await database.prepare(`
    INSERT INTO invite_redemptions (id, invite_code_id, redeemed_at) VALUES (?, ?, ?)
  `).bind(`ir_${crypto.randomUUID()}`, inviteId, now.toISOString()).run();
  return { inviteId, role };
}

export async function createInviteSession(
  input: { inviteId: string; role: InviteRole },
  secret: string,
  now = new Date(),
): Promise<string> {
  assertSessionSecret(secret);
  const payload: InviteSession = {
    version: 1,
    inviteId: input.inviteId,
    role: input.role,
    expiresAt: Math.floor(now.getTime() / 1000) + INVITE_SESSION_SECONDS,
  };
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyInviteSession(
  token: string,
  secret: string,
  now = new Date(),
): Promise<InviteSession | null> {
  if (!secret || !token) return null;
  const [encodedPayload, receivedSignature, extra] = token.split(".");
  if (!encodedPayload || !receivedSignature || extra) return null;
  const expectedSignature = await sign(encodedPayload, secret);
  if (!constantTimeEqual(receivedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as Partial<InviteSession>;
    if (payload.version !== 1 || typeof payload.inviteId !== "string") return null;
    if (payload.role !== "reader" && payload.role !== "admin") return null;
    if (typeof payload.expiresAt !== "number" || payload.expiresAt <= Math.floor(now.getTime() / 1000)) return null;
    return payload as InviteSession;
  } catch {
    return null;
  }
}

export function readInviteCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === INVITE_COOKIE_NAME) return decodeURIComponent(value.join("="));
  }
  return "";
}

export function inviteSessionCookie(token: string): string {
  return `${INVITE_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${INVITE_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function expiredInviteSessionCookie(): string {
  return `${INVITE_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function safeInviteReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://mokuang.local");
    if (url.origin !== "https://mokuang.local" || url.pathname.startsWith("/invite")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function assertSessionSecret(secret: string): void {
  if (new TextEncoder().encode(secret).length < 32) throw new Error("INVITE_SESSION_SECRET_TOO_SHORT");
}

async function sign(payload: string, secret: string): Promise<string> {
  assertSessionSecret(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
