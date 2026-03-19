'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SettingsData {
  'notifications.telegram.enabled'?: boolean;
  'notifications.telegram.botToken'?: string;
  'notifications.telegram.chatId'?: string;
  'notifications.email.enabled'?: boolean;
  'notifications.email.recipient'?: string;
  'notifications.sms.enabled'?: boolean;
  'notifications.sms.twilioAccountSid'?: string;
  'notifications.sms.twilioAuthToken'?: string;
  'notifications.sms.twilioFrom'?: string;
  'notifications.sms.to'?: string;
  'captcha.solver'?: 'twocaptcha' | 'manual';
  'captcha.twoCaptchaApiKey'?: string;
  'monitor.defaultIntervalMs'?: number;
  'booking.concurrency'?: number;
  'booking.maxRetries'?: number;
  [key: string]: unknown;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: settings, refetch, isLoading } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => api.put('/settings', updates),
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Loading settings…
      </div>
    );
  }

  const save = (updates: Record<string, unknown>) => saveMutation.mutate(updates);
  const saving = saveMutation.isPending;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Settings</h1>

      <TelegramSection settings={settings} onSave={save} saving={saving} />
      <EmailSection settings={settings} onSave={save} saving={saving} />
      <SmsSection settings={settings} onSave={save} saving={saving} />
      <CaptchaSection settings={settings} onSave={save} saving={saving} />
      <AutomationSection settings={settings} onSave={save} saving={saving} />
    </div>
  );
}

// ── Section components ─────────────────────────────────────────────────────────

function TelegramSection({
  settings, onSave, saving,
}: { settings: SettingsData | undefined; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [local, setLocal] = useState<Partial<SettingsData>>({});
  const v = (k: keyof SettingsData) => (local[k] !== undefined ? local[k] : settings?.[k]);
  const set = (k: keyof SettingsData, val: unknown) => setLocal((p) => ({ ...p, [k]: val }));

  return (
    <Card
      title="Telegram Notifications"
      description="Receive instant slot and booking alerts via Telegram Bot"
      onSave={() => onSave(local)}
      saving={saving}
      dirty={Object.keys(local).length > 0}
    >
      <Toggle
        label="Enable Telegram alerts"
        checked={Boolean(v('notifications.telegram.enabled'))}
        onChange={(val) => set('notifications.telegram.enabled', val)}
      />
      <SecretField
        label="Bot Token"
        placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v..."
        value={String(v('notifications.telegram.botToken') ?? '')}
        onChange={(val) => set('notifications.telegram.botToken', val)}
      />
      <TextField
        label="Chat ID"
        placeholder="-100123456789"
        value={String(v('notifications.telegram.chatId') ?? '')}
        onChange={(val) => set('notifications.telegram.chatId', val)}
      />
    </Card>
  );
}

function EmailSection({
  settings, onSave, saving,
}: { settings: SettingsData | undefined; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [local, setLocal] = useState<Partial<SettingsData>>({});
  const v = (k: keyof SettingsData) => (local[k] !== undefined ? local[k] : settings?.[k]);
  const set = (k: keyof SettingsData, val: unknown) => setLocal((p) => ({ ...p, [k]: val }));

  return (
    <Card
      title="Email Notifications"
      description="Receive booking updates by email (SMTP configured in .env)"
      onSave={() => onSave(local)}
      saving={saving}
      dirty={Object.keys(local).length > 0}
    >
      <Toggle
        label="Enable email alerts"
        checked={Boolean(v('notifications.email.enabled'))}
        onChange={(val) => set('notifications.email.enabled', val)}
      />
      <TextField
        label="Recipient email"
        placeholder="you@example.com"
        value={String(v('notifications.email.recipient') ?? '')}
        onChange={(val) => set('notifications.email.recipient', val)}
      />
    </Card>
  );
}

function SmsSection({
  settings, onSave, saving,
}: { settings: SettingsData | undefined; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [local, setLocal] = useState<Partial<SettingsData>>({});
  const v = (k: keyof SettingsData) => (local[k] !== undefined ? local[k] : settings?.[k]);
  const set = (k: keyof SettingsData, val: unknown) => setLocal((p) => ({ ...p, [k]: val }));

  return (
    <Card
      title="SMS Notifications (Twilio)"
      description="Get SMS alerts for slot detection and booking outcomes"
      onSave={() => onSave(local)}
      saving={saving}
      dirty={Object.keys(local).length > 0}
    >
      <Toggle
        label="Enable SMS alerts"
        checked={Boolean(v('notifications.sms.enabled'))}
        onChange={(val) => set('notifications.sms.enabled', val)}
      />
      <TextField
        label="Twilio Account SID"
        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        value={String(v('notifications.sms.twilioAccountSid') ?? '')}
        onChange={(val) => set('notifications.sms.twilioAccountSid', val)}
      />
      <SecretField
        label="Twilio Auth Token"
        placeholder="your_auth_token"
        value={String(v('notifications.sms.twilioAuthToken') ?? '')}
        onChange={(val) => set('notifications.sms.twilioAuthToken', val)}
      />
      <TextField
        label="From number"
        placeholder="+15551234567"
        value={String(v('notifications.sms.twilioFrom') ?? '')}
        onChange={(val) => set('notifications.sms.twilioFrom', val)}
      />
      <TextField
        label="Send alerts to"
        placeholder="+15559876543"
        value={String(v('notifications.sms.to') ?? '')}
        onChange={(val) => set('notifications.sms.to', val)}
      />
    </Card>
  );
}

function CaptchaSection({
  settings, onSave, saving,
}: { settings: SettingsData | undefined; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [local, setLocal] = useState<Partial<SettingsData>>({});
  const v = (k: keyof SettingsData) => (local[k] !== undefined ? local[k] : settings?.[k]);
  const set = (k: keyof SettingsData, val: unknown) => setLocal((p) => ({ ...p, [k]: val }));

  const solver = String(v('captcha.solver') ?? 'manual');

  return (
    <Card
      title="Captcha Settings"
      description="Choose how captchas are handled during booking sessions"
      onSave={() => onSave(local)}
      saving={saving}
      dirty={Object.keys(local).length > 0}
    >
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-700">Solver method</label>
        <select
          className="input w-48 text-sm"
          value={solver}
          onChange={(e) => set('captcha.solver', e.target.value)}
        >
          <option value="manual">Manual (human in the loop)</option>
          <option value="twocaptcha">2Captcha API (auto)</option>
        </select>
      </div>
      {solver === 'twocaptcha' && (
        <SecretField
          label="2Captcha API Key"
          placeholder="your_2captcha_api_key"
          value={String(v('captcha.twoCaptchaApiKey') ?? '')}
          onChange={(val) => set('captcha.twoCaptchaApiKey', val)}
        />
      )}
      {solver === 'manual' && (
        <p className="text-xs text-gray-400">
          When a captcha is detected, booking will pause and a popup will appear in the dashboard for manual solving.
        </p>
      )}
    </Card>
  );
}

function AutomationSection({
  settings, onSave, saving,
}: { settings: SettingsData | undefined; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [local, setLocal] = useState<Partial<SettingsData>>({});
  const v = (k: keyof SettingsData) => (local[k] !== undefined ? local[k] : settings?.[k]);
  const set = (k: keyof SettingsData, val: unknown) => setLocal((p) => ({ ...p, [k]: val }));

  return (
    <Card
      title="Automation Defaults"
      description="Default values used when starting new monitoring sessions"
      onSave={() => onSave(local)}
      saving={saving}
      dirty={Object.keys(local).length > 0}
    >
      <NumberField
        label="Default poll interval (ms)"
        hint="How often to check for slots. Min 3000ms."
        value={Number(v('monitor.defaultIntervalMs') ?? 10000)}
        min={3000}
        onChange={(val) => set('monitor.defaultIntervalMs', val)}
      />
      <NumberField
        label="Booking concurrency"
        hint="Simultaneous Playwright booking sessions. Each uses ~200MB RAM."
        value={Number(v('booking.concurrency') ?? 3)}
        min={1}
        max={10}
        onChange={(val) => set('booking.concurrency', val)}
      />
      <NumberField
        label="Max booking retries"
        hint="Retry attempts per job on failure before marking as failed."
        value={Number(v('booking.maxRetries') ?? 3)}
        min={1}
        max={10}
        onChange={(val) => set('booking.maxRetries', val)}
      />
    </Card>
  );
}

// ── Shared UI primitives ───────────────────────────────────────────────────────

function Card({
  title, description, children, onSave, saving, dirty,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
      <button
        className="btn-primary text-xs"
        onClick={onSave}
        disabled={saving || !dirty}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-700">{label}</label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
          checked ? 'bg-brand-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function TextField({
  label, placeholder, value, onChange,
}: { label: string; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-gray-700 shrink-0">{label}</label>
      <input
        type="text"
        className="input w-64 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SecretField({
  label, placeholder, value, onChange,
}: { label: string; placeholder?: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-gray-700 shrink-0">{label}</label>
      <div className="relative w-64">
        <input
          type={show ? 'text' : 'password'}
          className="input w-full text-sm pr-16"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label, hint, value, min, max, onChange,
}: { label: string; hint?: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="shrink-0">
        <p className="text-sm text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
      <input
        type="number"
        className="input w-32 text-sm"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
