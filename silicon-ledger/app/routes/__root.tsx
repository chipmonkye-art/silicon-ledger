import { Outlet, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-dvh bg-[#f5f5f7] dark:bg-zinc-900">
      <Outlet />
    </div>
  ),
});
