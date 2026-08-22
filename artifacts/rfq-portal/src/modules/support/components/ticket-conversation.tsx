import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type TicketDetail } from "@/lib/support-api";
import { StatusBadge, PriorityBadge, categoryLabel, fmtDateTime } from "./ticket-badges";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Shared ticket conversation: header + message thread + reply box.
 * Used by both the company /support page and the platform /admin/tickets page.
 */
export function TicketConversation({
  ticketId,
  queryKey,
  fetchTicket,
  onReply,
  onChanged,
  headerExtra,
  replyPlaceholder = "اكتب ردك…",
}: {
  ticketId: number;
  queryKey: unknown[];
  fetchTicket: () => Promise<TicketDetail>;
  onReply: (body: string) => Promise<unknown>;
  onChanged?: () => void;
  headerExtra?: React.ReactNode;
  replyPlaceholder?: string;
}) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const { data: ticket, isLoading } = useQuery({ queryKey, queryFn: fetchTicket, enabled: !!ticketId });

  const replyMut = useMutation({
    mutationFn: () => onReply(reply),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey });
      onChanged?.();
    },
    onError: (e: Error) => toast.error(e.message || "تعذر إرسال الرد"),
  });

  if (isLoading || !ticket) {
    return <p className="text-muted-foreground text-sm p-4">جارٍ التحميل…</p>;
  }

  const closed = ticket.status === "closed";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold">{ticket.subject}</h3>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            <span dir="ltr">{ticket.ticketNo}</span> · {categoryLabel(ticket.category)} · أنشأها{" "}
            {ticket.createdByName ?? "—"} · {fmtDateTime(ticket.createdAt)}
            {ticket.assignedToName ? ` · المسؤول: ${ticket.assignedToName}` : ""}
          </p>
        </div>
        {headerExtra}
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto pl-1">
        {ticket.messages.map((m) => {
          const fromSupport = m.senderKind === "support";
          return (
            <div key={m.id} className={cn("flex", fromSupport ? "justify-start" : "justify-end")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  fromSupport
                    ? "bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900"
                    : "bg-muted border",
                )}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span className="font-medium">{fromSupport ? "فريق الدعم" : (m.senderName ?? "أنت")}</span>
                  <span>{fmtDateTime(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      {!closed && (
        <div className="flex items-start gap-2 border-t pt-3">
          <Textarea
            rows={2}
            className="flex-1"
            placeholder={replyPlaceholder}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <Button disabled={!reply.trim() || replyMut.isPending} onClick={() => replyMut.mutate()}>
            {replyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
