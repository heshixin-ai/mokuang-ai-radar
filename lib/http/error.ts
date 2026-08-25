export function errorResponse(status: number, code: string, message: string): Response {
  const requestId = crypto.randomUUID();
  return Response.json({ error: { code, message, requestId } }, { status });
}
