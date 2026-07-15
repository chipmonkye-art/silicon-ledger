import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCategories, createCategory, deleteCategory } from "~/lib/api";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import type { Category } from "~/lib/types";

interface CategoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

function buildTree(categories: Category[]): (Category & { children: Category[] })[] {
  const map = new Map<string, Category & { children: Category[] }>();
  const roots: (Category & { children: Category[] })[] = [];

  for (const c of categories) {
    map.set(c.id, { ...c, children: [] });
  }
  for (const c of map.values()) {
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

function CategoryNode({
  node,
  depth,
  onEdit,
  onDelete,
}: {
  node: Category & { children: Category[] };
  depth: number;
  onEdit: (c: Category) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-1 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 group"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {node.children.length > 0 && (
          <button onClick={() => setExpanded(!expanded)} className="p-0.5">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        {node.children.length === 0 && <div className="w-5" />}
        <span className={`text-sm flex-1 ${node.kind === "income" ? "text-income dark:text-white" : ""}`}>
          {node.name}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border border-hairline ${
          node.kind === "income" ? "text-green-600" : "text-expense"
        }`}>
          {node.kind}
        </span>
        <button
          onClick={() => onEdit(node)}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={() => onDelete(node.id)}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900 rounded text-expense"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {expanded && node.children.map((child) => (
        <CategoryNode key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}

export function CategoryManager({ isOpen, onClose }: CategoryManagerProps) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [parentId, setParentId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const tree = buildTree(categories);

  async function handleAdd() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSubmitting(true);
    setError("");
    try {
      await createCategory({
        name: name.trim(),
        kind,
        parent_id: parentId || null,
      });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setName("");
      setParentId("");
      setShowAdd(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create category");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCategory(id);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Categories">
      <div className="space-y-4">
        {!showAdd ? (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} className="mr-1" />
            Add Category
          </Button>
        ) : (
          <div className="space-y-3 p-3 rounded-lg border border-hairline">
            <Input
              label="Name"
              placeholder="Category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="flex gap-2">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border border-hairline transition-colors capitalize ${
                    kind === k
                      ? "bg-expense text-white border-expense"
                      : "bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Parent (optional)</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-hairline bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-expense"
              >
                <option value="">None (top-level)</option>
                {categories.filter((c) => !c.parent_id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {error && <p className="text-xs text-expense">{error}</p>}

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setShowAdd(false); setError(""); }}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" onClick={handleAdd} disabled={submitting}>
                {submitting ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
        )}

        <div className="border border-hairline rounded-lg divide-y divide-hairline">
          {tree.map((node) => (
            <CategoryNode
              key={node.id}
              node={node}
              depth={0}
              onEdit={() => {}}
              onDelete={handleDelete}
            />
          ))}
          {tree.length === 0 && (
            <p className="text-sm text-zinc-400 py-6 text-center">
              No categories yet
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
