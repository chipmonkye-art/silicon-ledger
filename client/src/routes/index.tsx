import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, redirect } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import DashboardPage from "@/routes/dashboard";
import ProjectsPage from "@/routes/projects";
import TransactionsPage from "@/routes/transactions";
import SearchPage from "@/routes/search";
import ProjectDetailPage from "@/routes/projectDetail";
import ExpensesPage from "@/routes/expenses";
import AccountsPage from "@/routes/accounts";
import CalendarPage from "@/routes/calendar";
import InvoicesPage from "@/routes/invoices";
import VendorsPage from "@/routes/vendors";
import ReportsPage from "@/routes/reports";
import RecurringPage from "@/routes/recurring";
import ReviewPage from "@/routes/review";
import BackupPage from "@/routes/backup";
import LoginPage from "@/routes/login";

const queryClient = new QueryClient();

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: () => { throw redirect({ to: "/login" }); },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const authLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "auth",
  component: Layout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/dashboard",
  component: DashboardPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/projects",
  component: ProjectsPage,
});

const projectDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/projects/$id",
  component: ProjectDetailPage,
});

const transactionsRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/transactions",
  component: TransactionsPage,
});

const searchRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/search",
  component: SearchPage,
});

const expensesRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/expenses",
  component: ExpensesPage,
});

const accountsRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/accounts",
  component: AccountsPage,
});

const calendarRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/calendar",
  component: CalendarPage,
});

const invoicesRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/invoices",
  component: InvoicesPage,
});

const vendorsRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/vendors",
  component: VendorsPage,
});

const reportsRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/reports",
  component: ReportsPage,
});

const recurringRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/recurring",
  component: RecurringPage,
});

const reviewRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/review",
  component: ReviewPage,
});

const backupRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/backup",
  component: BackupPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  authLayout.addChildren([dashboardRoute, projectsRoute, projectDetailRoute, transactionsRoute, searchRoute, expensesRoute, accountsRoute, calendarRoute, invoicesRoute, vendorsRoute, reportsRoute, recurringRoute, reviewRoute, backupRoute]),
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
