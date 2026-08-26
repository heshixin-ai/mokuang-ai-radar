import { expiredInviteSessionCookie } from "@/lib/auth/invite-access";

export async function POST(request: Request) {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL("/invite", request.url).toString(),
      "set-cookie": expiredInviteSessionCookie(),
      "cache-control": "no-store",
    },
  });
}
