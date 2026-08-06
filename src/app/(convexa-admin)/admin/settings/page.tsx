'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
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
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Platform settings</h2>
        <p className="text-sm text-muted-foreground">
          Key/value JSON for flags and ops notes (not tenant entitlements).
        </p>
      </div>

      {loading ? (
        <div className="flex items-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
          {JSON.stringify(settings, null, 2)}
        </pre>
      )}

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
  );
}
