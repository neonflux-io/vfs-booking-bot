'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const { data: settings, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => api.put('/settings', updates),
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Settings</h1>

      <SettingsSection
        title="Telegram Notifications"
        description="Get instant alerts via Telegram Bot"
        settings={settings}
        keys={['notifications.telegram.enabled']}
        onSave={(v) => saveMutation.mutate(v)}
        pending={saveMutation.isPending}
      />

      <SettingsSection
        title="Email Notifications"
        description="Receive booking updates by email"
        settings={settings}
        keys={['notifications.email.enabled', 'notifications.email.recipient']}
        onSave={(v) => saveMutation.mutate(v)}
        pending={saveMutation.isPending}
      />

      <SettingsSection
        title="Captcha Settings"
        description="Configure captcha solving method"
        settings={settings}
        keys={['captcha.solver']}
        onSave={(v) => saveMutation.mutate(v)}
        pending={saveMutation.isPending}
      />

      <SettingsSection
        title="Automation"
        description="Booking and monitoring defaults"
        settings={settings}
        keys={['monitor.defaultIntervalMs', 'booking.concurrency', 'booking.maxRetries']}
        onSave={(v) => saveMutation.mutate(v)}
        pending={saveMutation.isPending}
      />
    </div>
  );
}

function SettingsSection({
  title, description, settings, keys, onSave, pending
}: {
  title: string;
  description: string;
  settings: Record<string, unknown> | undefined;
  keys: string[];
  onSave: (v: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [local, setLocal] = useState<Record<string, unknown>>({});

  const merged = { ...settings, ...local };

  function handleChange(key: string, value: unknown) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-gray-400">{description}</p>
      </div>

      {keys.map((key) => {
        const value = merged[key];
        const isBoolean = typeof value === 'boolean' || value === undefined && key.includes('enabled');

        return (
          <div key={key} className="flex items-center justify-between">
            <label className="text-sm text-gray-700 font-mono text-xs">{key}</label>
            {isBoolean ? (
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => handleChange(key, e.target.checked)}
                className="h-4 w-4 accent-brand-500"
              />
            ) : (
              <input
                type="text"
                className="input w-64 text-sm"
                value={String(value ?? '')}
                onChange={(e) => handleChange(key, isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}
              />
            )}
          </div>
        );
      })}

      <button
        className="btn-primary text-xs"
        onClick={() => onSave(local)}
        disabled={pending || Object.keys(local).length === 0}
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
