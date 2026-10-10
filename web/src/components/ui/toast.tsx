"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type ToastContextType = {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => string;
  removeToast: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextType | null>(null);

// Standalone event bus for imperatively calling toast()
type ToastListener = (toast: Omit<ToastItem, "id">) => void;
const listeners = new Set<ToastListener>();

export function toast(options: Omit<ToastItem, "id">) {
  listeners.forEach((listener) => listener(options));
}

toast.success = (description: string, title = "Success") =>
  toast({ title, description, variant: "success" });
toast.error = (description: string, title = "Error") =>
  toast({ title, description, variant: "error" });
toast.info = (description: string, title = "Information") =>
  toast({ title, description, variant: "info" });
toast.warning = (description: string, title = "Warning") =>
  toast({ title, description, variant: "warning" });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = React.useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { ...item, id };
      setToasts((prev) => [...prev, newToast]);

      const duration = item.duration ?? 4500;
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
      return id;
    },
    [removeToast]
  );

  React.useEffect(() => {
    const handleAdd: ToastListener = (item) => {
      addToast(item);
    };
    listeners.add(handleAdd);
    return () => {
      listeners.delete(handleAdd);
    };
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    return {
      toast,
      toasts: [],
      removeToast: () => {},
    };
  }
  return {
    toast: (opts: Omit<ToastItem, "id">) => ctx.addToast(opts),
    toasts: ctx.toasts,
    removeToast: ctx.removeToast,
  };
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <aside
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed right-0 bottom-0 z-50 flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-[420px] sm:flex-col"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </aside>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const icons: Record<ToastVariant, React.ReactNode> = {
    default: <Info className="text-foreground size-5" />,
    info: <Info className="size-5 text-blue-500" />,
    success: <CheckCircle2 className="size-5 text-emerald-500" />,
    error: <AlertCircle className="text-destructive size-5" />,
    warning: <TriangleAlert className="size-5 text-amber-500" />,
  };

  const borderVariants: Record<ToastVariant, string> = {
    default: "border-border bg-card text-card-foreground",
    info: "border-blue-500/20 bg-card text-card-foreground",
    success: "border-emerald-500/20 bg-card text-card-foreground",
    error: "border-destructive/30 bg-card text-card-foreground",
    warning: "border-amber-500/30 bg-card text-card-foreground",
  };

  const variant = item.variant || "default";

  return (
    <div
      role="alert"
      className={cn(
        "animate-in slide-in-from-bottom-5 sm:slide-in-from-right-5 pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border p-4 shadow-lg transition-all",
        borderVariants[variant]
      )}
    >
      <div className="shrink-0 pt-0.5">{icons[variant]}</div>
      <div className="grid flex-1 gap-1">
        {item.title && <div className="text-sm font-semibold">{item.title}</div>}
        {item.description && (
          <div className="text-muted-foreground text-xs">{item.description}</div>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-muted-foreground focus:ring-ring rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:outline-none"
        aria-label="Dismiss notification"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
