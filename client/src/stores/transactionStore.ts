import { create } from "zustand";

interface TransactionSheetState {
  open: boolean;
  defaultTab: "expense" | "income" | "transfer";
  openSheet: (tab?: "expense" | "income" | "transfer") => void;
  closeSheet: () => void;
}

export const useTransactionSheet = create<TransactionSheetState>((set) => ({
  open: false,
  defaultTab: "expense",
  openSheet: (tab) => set({ open: true, defaultTab: tab ?? "expense" }),
  closeSheet: () => set({ open: false }),
}));
