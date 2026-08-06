'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function AdminUsagePage() {
  const [accountId, setAccountId] = useState('');
  const [recent, setRecent] = useState<
    Array<{
      id: string;
      account_id: string;
      event_type: string;
      quantity: number;
      created_at: string;
    }>
  >([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRecent = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/usage');
      const data = await res.json();
      setRecent(data.recent ?? []);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const loadAccount = async () => {
    if (!accountId.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/usage?account_id=${encodeURIComponent(accountId.trim())}`,
      );
      const data = await res.json();
      setSummary(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecent();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Usage</h2>
        <p className="text-sm text-muted-foreground">
          Software metering ledger (messages, automations, AI calls).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Account UUID"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="max-w-md font-mono text-xs"
        />
        <Button onClick={() => void loadAccount()}>Load account</Button>
        <Button variant="ghost" onClick={() => void loadRecent()}>
          Recent (all)
        </Button>
      </div>

      {loading && (
        <div className="flex items-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {summary && (
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
          {JSON.stringify(summary, null, 2)}
        </pre>
      )}

      {!summary && !loading && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Qty</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {r.account_id.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2">{r.event_type}</td>
                  <td className="px-3 py-2">{r.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
