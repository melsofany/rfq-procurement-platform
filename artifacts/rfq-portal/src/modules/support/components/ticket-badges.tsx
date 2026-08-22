import { cn } from "@/lib/utils";
import { TICKET_CATEGORIES, type Ticket } from "@/lib/support-api";

const STATUS_STYLE: Record<Ticket["status"], { label: string; cls: string }> = {
  open: { label: "مفتوحة", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  in_progress: { label: "قيد المعالجة", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  resolved: { label: "تم الحل", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  closed: { label: "مغلقة", cls: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

const PRIORITY_STYLE: Record<Ticket["priority"], { label: string; cls: string }> = {
  low: { label: "منخفضة", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  normal: { label: "عادية", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  high: { label: "عالية", cls: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  urgent: { label: "عاجلة", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

export function StatusBadge({ status }: { status: Ticket["status"] }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.open;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", s.cls)}>
      {s.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Ticket["priority"] }) {
  const s = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.normal;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", s.cls)}>
      {s.label}
    </span>
  );
}

export function categoryLabel(category: string | null): string {
  return TICKET_CATEGORIES.find((c) => c.value === category)?.ar ?? "عام";
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
