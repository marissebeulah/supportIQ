import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: Tone };

type ToastValue = {
  toast: (message: string, tone?: Tone) => void;
};

const ToastContext = createContext<ToastValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: Tone = "success") => {
      const id = nextId++;
      setItems((current) => [...current.slice(-3), { id, message, tone }]);
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 5200);
    },
    [],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => {
          const Icon = item.tone === "error" ? CircleAlert : item.tone === "info" ? Info : CircleCheck;
          return (
            <div key={item.id} className={`toast toast-${item.tone}`}>
              <Icon size={16} className="toast-icon" />
              <span>{item.message}</span>
              <button type="button" className="toast-close" onClick={() => remove(item.id)} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
