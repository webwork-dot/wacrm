'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Plan {
  id: string;
  slug: string;
  name: string;
}

interface ClientRow {
  id: string;
  name: string;
  status: string;
  plan_id: string | null;
  plan_notes: string | null;
  created_at: string;
  software_plans?: { slug: string; name: string } | { slug: string; name: string }[] | null;
}

function planLabel(c: ClientRow): string {
  const p = Array.isArray(c.software_plans) ? c.software_plans[0] : c.software_plans;
  return p?.name ?? '—';
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (query = q) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/clients${query ? `?q=${encodeURIComponent(query)}` : ''}`,
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to load clients');
        return;
      }
      setClients(data.clients ?? []);
      setPlans(data.plans ?? []);
    } catch {
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Update failed');
        return;
      }
      toast.success('Updated');
      await load();
    } catch {
      toast.error('Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Clients</h2>
        <p className="text-sm text-muted-foreground">
          Suspend/activate and assign software plans manually.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="secondary" onClick={() => void load(q)}>
          Search
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">{c.id}</p>
                  </td>
                  <td className="px-3 py-2 capitalize">{c.status ?? 'active'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <span>{planLabel(c)}</span>
                      <Select
                        disabled={busyId === c.id}
                        onValueChange={(planId) =>
                          void patch(c.id, { plan_id: planId })
                        }
                      >
                        <SelectTrigger className="h-8 w-[160px]">
                          <SelectValue placeholder="Assign plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {plans.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {c.status !== 'suspended' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === c.id}
                          onClick={() =>
                            void patch(c.id, { status: 'suspended' })
                          }
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busyId === c.id}
                          onClick={() =>
                            void patch(c.id, { status: 'active' })
                          }
                        >
                          Activate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No clients.</p>
          )}
        </div>
      )}
    </div>
  );
}
