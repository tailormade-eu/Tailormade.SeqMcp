export function respond(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
