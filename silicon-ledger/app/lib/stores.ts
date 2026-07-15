import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthStore {
  token: string | null;
  userId: string | null;
  setSession: (token: string, userId: string) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      setSession: (token, userId) => set({ token, userId }),
      clearSession: () => set({ token: null, userId: null }),
    }),
    { name: "silicon-auth" },
  ),
);

interface SheetStore {
  isOpen: boolean;
  defaultDate: string;
  open: (date?: string) => void;
  close: () => void;
}

export const useSheetStore = create<SheetStore>((set) => ({
  isOpen: false,
  defaultDate: new Date().toISOString().slice(0, 10),
  open: (date) => set({ isOpen: true, defaultDate: date ?? new Date().toISOString().slice(0, 10) }),
  close: () => set({ isOpen: false }),
}));

interface SettingsStore {
  theme: "system" | "light" | "dark";
  firstDayOfWeek: number;
  setTheme: (theme: "system" | "light" | "dark") => void;
  setFirstDayOfWeek: (day: number) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: "system",
      firstDayOfWeek: 0,
      setTheme: (theme) => set({ theme }),
      setFirstDayOfWeek: (day) => set({ firstDayOfWeek: day }),
    }),
    { name: "silicon-settings" },
  ),
);

export interface WorkspaceInfo {
  id: string;
  name: string;
  role: "owner" | "manager" | "staff" | "auditor";
  created_at: string;
}

interface WorkspaceStore {
  workspaceId: string | null;
  workspaces: WorkspaceInfo[];
  setWorkspace: (id: string) => void;
  setWorkspaces: (workspaces: WorkspaceInfo[]) => void;
  currentWorkspace: () => WorkspaceInfo | undefined;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaceId: null,
      workspaces: [],
      setWorkspace: (id) => set({ workspaceId: id }),
      setWorkspaces: (workspaces) => {
        const state = get();
        const currentId = state.workspaceId;
        const stillExists = currentId && workspaces.some((w) => w.id === currentId);
        set({
          workspaces,
          workspaceId: stillExists ? currentId : workspaces[0]?.id ?? null,
        });
      },
      currentWorkspace: () => {
        const { workspaceId, workspaces } = get();
        return workspaces.find((w) => w.id === workspaceId);
      },
    }),
    { name: "silicon-workspace" },
  ),
);

interface I18nStore {
  locale: string;
  setLocale: (locale: string) => void;
}

export const useI18nStore = create<I18nStore>()(
  persist(
    (set) => ({
      locale: "en",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "silicon-i18n" },
  ),
);

export function t(key: string, locale?: string): string {
  const l = locale ?? useI18nStore.getState().locale;
  return (i18nDict[l]?.[key] ?? i18nDict["en"]?.[key] ?? key);
}

export const i18nDict: Record<string, Record<string, string>> = {
  en: {
    "app.name": "Silicon Accounting",
    "nav.dashboard": "Dashboard",
    "nav.transactions": "Transactions",
    "nav.calendar": "Calendar",
    "nav.reports": "Reports",
    "nav.accounts": "Accounts",
    "nav.settings": "Settings",
    "nav.audit": "Audit Trail",
    "common.add": "Add",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.search": "Search",
    "common.export": "Export",
    "common.import": "Import",
    "common.approve": "Approve",
    "common.reject": "Reject",
    "common.resubmit": "Resubmit",
    "transaction.income": "Income",
    "transaction.expense": "Expense",
    "transaction.transfer": "Transfer",
    "transaction.staged": "Staged",
    "transaction.rejected": "Needs Correction",
    "transaction.cleared": "Cleared",
    "aging.current": "Current",
    "aging.1_30": "1-30 Days",
    "aging.31_60": "31-60 Days",
    "aging.61_90": "61-90 Days",
    "aging.90_plus": "90+ Days",
    "audit.title": "Audit Trail",
    "audit.read_only": "Read-only view",
    "report.aging": "Aging Analysis",
    "report.payment_performance": "Payment Performance",
    "report.branded_invoice": "Branded Invoice",
    "role.owner": "Owner",
    "role.manager": "Manager",
    "role.staff": "Staff",
    "role.auditor": "Auditor",
    "import.excel": "Import from Excel",
    "import.mapping": "Map Columns",
    "i18n.bangla": "বাংলা",
    "i18n.english": "English",
  },
  bn: {
    "app.name": "সিলিকন অ্যাকাউন্টিং",
    "nav.dashboard": "ড্যাশবোর্ড",
    "nav.transactions": "লেনদেন",
    "nav.calendar": "ক্যালেন্ডার",
    "nav.reports": "রিপোর্ট",
    "nav.accounts": "অ্যাকাউন্ট",
    "nav.settings": "সেটিংস",
    "nav.audit": "অডিট ট্রেইল",
    "common.add": "যোগ করুন",
    "common.save": "সংরক্ষণ",
    "common.cancel": "বাতিল",
    "common.delete": "মুছুন",
    "common.search": "অনুসন্ধান",
    "common.export": "এক্সপোর্ট",
    "common.import": "ইম্পোর্ট",
    "common.approve": "অনুমোদন",
    "common.reject": "ফেরত",
    "common.resubmit": "পুনরায় জমা দিন",
    "transaction.income": "আয়",
    "transaction.expense": "ব্যয়",
    "transaction.transfer": "স্থানান্তর",
    "transaction.staged": "অনুমোদন pending",
    "transaction.rejected": "সংশোধন প্রয়োজন",
    "transaction.cleared": "নিষ্পত্তি",
    "aging.current": "বর্তমান",
    "aging.1_30": "১-৩০ দিন",
    "aging.31_60": "৩১-৬০ দিন",
    "aging.61_90": "৬১-৯০ দিন",
    "aging.90_plus": "৯০+ দিন",
    "audit.title": "অডিট ট্রেইল",
    "audit.read_only": "শুধুমাত্র দেখার অনুমতি",
    "report.aging": "বয়স বিশ্লেষণ",
    "report.payment_performance": "পেমেন্ট পারফরমেন্স",
    "report.branded_invoice": "ব্র্যান্ডেড চালান",
    "role.owner": "মালিক",
    "role.manager": "ম্যানেজার",
    "role.staff": "স্টাফ",
    "role.auditor": "অডিটর",
    "import.excel": "এক্সেল থেকে ইম্পোর্ট",
    "import.mapping": "কলাম ম্যাপিং",
    "i18n.bangla": "বাংলা",
    "i18n.english": "ইংরেজি",
  },
};
