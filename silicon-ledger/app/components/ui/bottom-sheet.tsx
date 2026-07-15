import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function BottomSheet({ isOpen, onClose, children, title }: BottomSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    function handleFocus(e: FocusEvent) {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        setTimeout(() => target.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
      }
    }

    container.addEventListener("focusin", handleFocus);
    return () => container.removeEventListener("focusin", handleFocus);
  }, [isOpen]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/40 z-40 transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />
      <div
        ref={containerRef}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 rounded-t-2xl",
          "border-t border-hairline transition-transform duration-300 ease-out",
          "max-h-[85vh] overflow-y-auto",
          isOpen ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-hairline px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold">{title ?? ""}</h2>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </>
  );
}
