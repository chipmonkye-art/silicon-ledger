import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Building2, Phone, Mail } from "lucide-react";
import { vendorsApi } from "@/lib/api";
import type { Vendor } from "@/types";

export default function VendorsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: vendorsApi.list,
  });

  const vendors = data?.vendors ?? [];

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vendors</h1>
        <Button size="sm" className="rounded-full">
          <Plus className="mr-1 h-4 w-4" />New
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-400 text-center py-8">Loading vendors…</p>
      ) : vendors.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-8">No vendors yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {vendors.map((v: Vendor) => (
            <Card key={v.id} className="border-neutral-100">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-neutral-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{v.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {v.email && (
                        <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" />{v.email}
                        </span>
                      )}
                      {v.phone && (
                        <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" />{v.phone}
                        </span>
                      )}
                    </div>
                    {v.payment_terms && (
                      <p className="text-[10px] text-neutral-400 mt-0.5">{v.payment_terms}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
