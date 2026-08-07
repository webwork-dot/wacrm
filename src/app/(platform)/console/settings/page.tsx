'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ux/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function ConsoleSettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [flags, setFlags] = useState<Array<Record<string, unknown>>>([]);
  const [key, setKey] = useState('support_banner');
  const [valueJson, setValueJson] = useState('{"enabled": false, "text": ""}');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to load');
        return;
      }
      setSettings(data.settings ?? {});
      setFlags(data.feature_flags ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      let value: unknown;
      try {
        value = JSON.parse(valueJson);
      } catch {
        toast.error('Value must be valid JSON');
        return;
      }
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), value }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Save failed');
        return;
      }
      toast.success('Saved');
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="System settings"
        description="Platform flags and ops notes. Client entitlements live on plans — not here."
        nextStep="Use feature flags to turn modules on or off without shipping code"
      />

      {loading ? (
        <div className="flex items-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-6">
          {flags.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-foreground">
                Feature flags
              </h2>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Key</th>
                      <th className="px-3 py-2">Enabled</th>
                      <th className="px-3 py-2">Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flags.map((f) => (
                      <tr
                        key={String(f.id ?? f.key)}
                        className="border-b last:border-0"
                      >
                        <td className="px-3 py-2 font-mono text-xs">
                          {String(f.key)}
                        </td>
                        <td className="px-3 py-2">
                          {f.enabled ? 'On' : 'Off'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {f.account_id ? 'Account override' : 'Global'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-sm font-medium text-foreground">
              Platform settings JSON
            </h2>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
              {JSON.stringify(settings, null, 2)}
            </pre>
          </div>

          <div className="max-w-lg space-y-3 rounded-lg border border-border p-4">
            <div className="space-y-1.5">
              <Label>Key</Label>
              <Input value={key} onChange={(e) => setKey(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Value (JSON)</Label>
              <Textarea
                rows={6}
                value={valueJson}
                onChange={(e) => setValueJson(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <Button disabled={saving} onClick={() => void save()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
