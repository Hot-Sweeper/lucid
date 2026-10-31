/** Only explicit sender metadata changes a conversation's audience. MCP alone is not an agent sender. */
export function messageAudience(message: { senderThreadId?: string | null; createdBy?: string | null }) {
  return message.senderThreadId || message.createdBy === "agent" ? "agent" : "user";
}
/** Tool calls that actually send a message to another agent. A Slack send_message is a different app. */
export function peerToolMessage(name: string, input: Record<string, any>) {
  const t3 = /(?:^|__|\.)t3_thread_send$/.test(name);
  const native = !name.startsWith("mcp__") && /(?:^|\.)(?:send_message|followup_task|SendMessage)$/.test(name);
  if (!t3 && !native) return null;
  const text = input.message ?? input.text ?? input.content ?? input.task;
  const target = input.threadId ?? input.target ?? input.recipient;
  if (typeof text !== "string" || typeof target !== "string" || !text.trim()) return null;
  return { target, text };
}
export function peerDelivery(item: { status?: string; data?: any }): "sending" | "sent" | "failed" {
  if (["running", "pending", "waiting", "queued"].includes(item.status || "")) return "sending";
  const out = item.data?.output;
  return item.status === "completed" && !out?.isError && out?.ok !== false && out?.structuredContent?.ok !== false ? "sent" : "failed";
}
