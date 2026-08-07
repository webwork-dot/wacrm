'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ux/page-header';
import { EmptyGuide } from '@/components/ux/empty-guide';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { computeClientHealth } from '@/lib/platform/client-health';
import { cn } from '@/lib/utils';

interface ClientRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  owner_email?: string | null;
  _meta?: {
    whatsapp: boolean;
    ai: boolean;
    knowledge: boolean;
    automation: boolean;
  };
}

interface CreatedCredentials {
  email: string;
  password: string;
  passwordGenerated: boolean;
  companyName: string;
}

export default function ConsoleClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<CreatedCredentials | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/clients');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Could not load clients');
        return;
      }
      setClients(data.clients ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.owner_email ?? '').toLowerCase().includes(needle),
    );
  }, [clients, q]);

  const resetForm = () => {
    setCompanyName('');
    setOwnerName('');
    setOwnerEmail('');
    setPassword('');
    setCreated(null);
  };

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
    } finally {
      setBusyId(null);
    }
  };

  const viewAs = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/platform/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Could not open client view');
        return;
      }
      window.location.href = data.redirect ?? '/dashboard';
    } finally {
      setBusyId(null);
    }
  };

  const createClient = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          ownerName: ownerName || undefined,
          ownerEmail,
          password: password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Could not create client');
        return;
      }
      setCreated({
        email: data.credentials.email,
        password: data.credentials.password,
        passwordGenerated: data.credentials.passwordGenerated,
        companyName: data.client.name,
      });
      toast.success('Client created');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Create workspaces for businesses you onboard. Open their portal when they need help."
        nextStep={
          clients.length === 0
            ? 'Add your first client'
            : 'Find a client and click View as client when they need help'
        }
        action={
          <Button onClick={() => { resetForm(); setAddOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add client
          </Button>
        }
      />

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="Search company or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {loading ? (
        <div className="flex items-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        q.trim() ? (
          <EmptyGuide
            title="No clients match"
            description="Try a different search, or clear the box to see everyone."
            steps={[{ label: 'Clear search and try again' }]}
          />
        ) : (
          <div className="space-y-4">
            <EmptyGuide
              title="No clients yet"
              description="Add a business to give them a Convexa workspace. They connect WhatsApp with their own Meta account — you sell the software and service."
              steps={[
                { label: 'Click Add client' },
                { label: 'Share their login details' },
                { label: 'Use View as client for support' },
              ]}
            />
            <div className="flex justify-center">
              <Button
                onClick={() => {
                  resetForm();
                  setAddOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add client
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2 min-w-[140px]">Setup</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const health = computeClientHealth({
                  whatsappConnected: c._meta?.whatsapp ?? false,
                  aiConfigured: c._meta?.ai ?? false,
                  knowledgeHasDocs: c._meta?.knowledge ?? false,
                  automationActive: c._meta?.automation ?? false,
                  status: c.status === 'suspended' ? 'suspended' : 'active',
                });
                const pct = health.score;
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.owner_email ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div
                        className="w-[120px]"
                        title={
                          health.reasons.length > 0
                            ? health.reasons.join(' · ')
                            : 'Setup complete'
                        }
                      >
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Complete</span>
                          <span className="font-medium tabular-nums text-foreground">
                            {pct}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              pct >= 70
                                ? 'bg-emerald-500'
                                : pct >= 40
                                  ? 'bg-amber-500'
                                  : 'bg-primary',
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 capitalize">{c.status ?? 'active'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          disabled={busyId === c.id}
                          onClick={() => void viewAs(c.id)}
                        >
                          View as client
                        </Button>
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
                            variant="secondary"
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>Client ready</DialogTitle>
                <DialogDescription>
                  Share these login details with{' '}
                  <strong>{created.companyName}</strong>. The password is shown
                  only once.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium">{created.email}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void copyText(created.email, 'Email')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Password</p>
                      <p className="font-mono font-medium">{created.password}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void copyText(created.password, 'Password')
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  They sign in at this site → Client Portal. You can open their
                  workspace anytime with View as client.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setAddOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add client</DialogTitle>
                <DialogDescription>
                  Creates a workspace and an owner login. Leave password blank
                  to auto-generate one.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="company">Company name</Label>
                  <Input
                    id="company"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Traders"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ownerName">Owner name (optional)</Label>
                  <Input
                    id="ownerName"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Priya Sharma"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ownerEmail">Owner email</Label>
                  <Input
                    id="ownerEmail"
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="owner@acme.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Temp password (optional)</Label>
                  <Input
                    id="password"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Auto-generate if empty"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  disabled={creating || !companyName.trim() || !ownerEmail.trim()}
                  onClick={() => void createClient()}
                >
                  {creating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create client
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
