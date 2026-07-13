import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { projectsApi } from "@/lib/api";
import { formatCents } from "@/lib/utils";

const statusColor: Record<string, "warning" | "success" | "secondary" | "default" | "destructive"> = {
  planning: "warning",
  active: "success",
  on_hold: "secondary",
  completed: "default",
  cancelled: "destructive",
};

export default function ProjectsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  });

  const projects = data?.projects ?? [];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button size="sm" className="rounded-full">
          <Plus className="mr-1 h-4 w-4" />New Project
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400 text-center py-8">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-8">No projects yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => {
            const spentPct = project.budget > 0 ? Math.round((project.spent / project.budget) * 100) : 0;
            return (
              <Link key={project.id} to="/projects/$id" params={{ id: project.id }}>
                <Card className="border-neutral-100 hover:border-neutral-200 transition-colors cursor-pointer">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{project.name}</CardTitle>
                        <p className="text-sm text-neutral-500 mt-0.5">{project.location}</p>
                      </div>
                      <Badge variant={statusColor[project.status] || "default"} className="capitalize">
                        {project.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-500">Budget</span>
                        <span className="font-mono font-medium">{formatCents(project.budget)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            spentPct > 90 ? "bg-expense" : spentPct > 70 ? "bg-amber-400" : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(spentPct, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-neutral-400">
                        <span>{spentPct}% spent</span>
                        <span>{formatCents(project.budget - project.spent)} remaining</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
