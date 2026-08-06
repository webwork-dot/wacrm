'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  EMPTY_STUDIO_PROFILE,
  normalizeStudioProfile,
  type AiStudioProfile,
} from '@/lib/ai/studio/profile';

const STEPS = [
  { key: 'business', title: 'Business' },
  { key: 'products', title: 'Products' },
  { key: 'tone', title: 'Tone & languages' },
  { key: 'guardrails', title: 'Hours & guardrails' },
  { key: 'review', title: 'Review prompt' },
] as const;

interface Props {
  canEdit: boolean;
  initialProfile?: unknown;
  /** Called with generated prompt + profile so Setup can apply them. */
  onApply: (args: {
    studio_profile: AiStudioProfile;
    system_prompt: string;
  }) => void;
}

export function AiStudioWizard({ canEdit, initialProfile, onApply }: Props) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<AiStudioProfile>(() =>
    normalizeStudioProfile(initialProfile ?? EMPTY_STUDIO_PROFILE),
  );
  const [preview, setPreview] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setProfile(normalizeStudioProfile(initialProfile ?? EMPTY_STUDIO_PROFILE));
  }, [initialProfile]);

  const setField = (key: keyof AiStudioProfile, value: string) => {
    setProfile((p) => ({ ...p, [key]: value }));
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/studio/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studio_profile: profile }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Could not generate prompt');
        return;
      }
      setPreview(data.system_prompt ?? '');
      setStep(STEPS.length - 1);
    } catch {
      toast.error('Could not generate prompt');
    } finally {
      setGenerating(false);
    }
  };

  const apply = () => {
    if (!preview.trim()) {
      toast.error('Generate a prompt first');
      return;
    }
    onApply({ studio_profile: profile, system_prompt: preview });
    toast.success('Prompt applied — save Setup to persist');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Studio wizard
        </CardTitle>
        <CardDescription>
          Answer a few questions — we generate your system prompt. Advanced
          mode still lets you edit the raw prompt below in Setup.
        </CardDescription>
        <div className="flex flex-wrap gap-1 pt-2">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              disabled={!canEdit}
              onClick={() => setStep(i)}
              className={`rounded-md px-2 py-1 text-xs ${
                i === step
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}. {s.title}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Business name</Label>
              <Input
                disabled={!canEdit}
                value={profile.business_name ?? ''}
                onChange={(e) => setField('business_name', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>What does the business do?</Label>
              <Textarea
                disabled={!canEdit}
                rows={4}
                value={profile.business_description ?? ''}
                onChange={(e) =>
                  setField('business_description', e.target.value)
                }
              />
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-1.5">
            <Label>Products &amp; services</Label>
            <Textarea
              disabled={!canEdit}
              rows={5}
              placeholder="List offerings customers ask about…"
              value={profile.products_services ?? ''}
              onChange={(e) => setField('products_services', e.target.value)}
            />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <Input
                disabled={!canEdit}
                value={profile.tone ?? ''}
                onChange={(e) => setField('tone', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Languages</Label>
              <Input
                disabled={!canEdit}
                placeholder="e.g. English, Hindi"
                value={profile.languages ?? ''}
                onChange={(e) => setField('languages', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Restrictions (do not…)</Label>
              <Textarea
                disabled={!canEdit}
                rows={3}
                value={profile.restrictions ?? ''}
                onChange={(e) => setField('restrictions', e.target.value)}
              />
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Support hours</Label>
              <Input
                disabled={!canEdit}
                placeholder="Mon–Fri 9:00–18:00"
                value={profile.support_hours ?? ''}
                onChange={(e) => setField('support_hours', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Guardrails &amp; compliance</Label>
              <Textarea
                disabled={!canEdit}
                rows={4}
                value={profile.guardrails ?? ''}
                onChange={(e) => setField('guardrails', e.target.value)}
              />
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-2">
            <Label>Generated system prompt</Label>
            <Textarea
              disabled={!canEdit}
              rows={10}
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              placeholder="Click Generate to build a prompt from your answers."
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={step === 0 || !canEdit}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="flex gap-2">
            {step < STEPS.length - 1 && step !== 3 && (
              <Button
                type="button"
                size="sm"
                disabled={!canEdit}
                onClick={() => setStep((s) => s + 1)}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
            {step === 3 && (
              <Button
                type="button"
                size="sm"
                disabled={!canEdit || generating}
                onClick={() => void generate()}
              >
                {generating ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                Generate prompt
              </Button>
            )}
            {step === 4 && (
              <Button
                type="button"
                size="sm"
                disabled={!canEdit || !preview.trim()}
                onClick={apply}
              >
                Apply to Setup
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
