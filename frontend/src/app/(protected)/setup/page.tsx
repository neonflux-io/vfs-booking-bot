'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMonitorStore } from '@/store/monitorStore';

export default function SetupPage() {
  const qc = useQueryClient();
  const { setMonitors } = useMonitorStore();

  const [destination, setDestination] = useState('brazil');
  const [visaType, setVisaType] = useState('tourist');
  const [intervalMs, setIntervalMs] = useState(10000);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);

  const { data: profilesData } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.get('/profiles').then((r) => r.data),
  });
  const profiles: { id: string; fullName: string; priority: string }[] = profilesData?.items ?? [];

  const { data: monitorStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['monitor-status'],
    queryFn: () => api.get('/monitor/status').then((r) => { setMonitors(r.data); return r.data; }),
    refetchInterval: 5000,
  });

  const startMutation = useMutation({
    mutationFn: () => api.post('/monitor/start', { destination, visaType, intervalMs, profileIds: selectedProfileIds, mode }),
    onSuccess: () => { setSelectedProfileIds([]); refetchStatus(); qc.invalidateQueries({ queryKey: ['monitor-status'] }); },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/monitor/stop/${id}`),
    onSuccess: () => refetchStatus(),
  });

  const activeMonitors = (monitorStatus ?? []).filter((m: { isRunning: boolean }) => m.isRunning);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Appointment Setup</h1>

      {/* Active monitors */}
      {activeMonitors.length > 0 && (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold">Active Monitors</h2>
          {activeMonitors.map((m: { id: string; destination: string; visaType: string; slotDetectedCount: number }) => (
            <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <span className="badge badge-green mr-2">Running</span>
                <span className="text-sm font-medium capitalize">{m.destination}</span>
                <span className="text-xs text-gray-500 ml-2">— {m.visaType}</span>
                <span className="text-xs text-gray-400 ml-2">{m.slotDetectedCount} slots</span>
              </div>
              <button
                className="btn-danger text-xs px-3 py-1"
                onClick={() => stopMutation.mutate(m.id)}
                disabled={stopMutation.isPending}
              >
                Stop
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Configuration form */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold">New Monitor</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Destination</label>
            <select className="input" value={destination} onChange={(e) => setDestination(e.target.value)}>
              <optgroup label="Europe">
                <option value="portugal">Portugal</option>
                <option value="france">France</option>
                <option value="germany">Germany</option>
                <option value="spain">Spain</option>
                <option value="italy">Italy</option>
                <option value="netherlands">Netherlands</option>
                <option value="belgium">Belgium</option>
                <option value="switzerland">Switzerland</option>
                <option value="sweden">Sweden</option>
                <option value="norway">Norway</option>
                <option value="denmark">Denmark</option>
                <option value="finland">Finland</option>
                <option value="austria">Austria</option>
                <option value="czechrepublic">Czech Republic</option>
                <option value="poland">Poland</option>
              </optgroup>
              <optgroup label="Americas">
                <option value="brazil">Brazil</option>
                <option value="usa">United States</option>
                <option value="canada">Canada</option>
              </optgroup>
              <optgroup label="Asia-Pacific">
                <option value="australia">Australia</option>
                <option value="china">China</option>
                <option value="japan">Japan</option>
                <option value="india">India</option>
              </optgroup>
              <optgroup label="Africa">
                <option value="southafrica">South Africa</option>
              </optgroup>
            </select>
          </div>

          <div>
            <label className="label">Visa Type</label>
            <select className="input" value={visaType} onChange={(e) => setVisaType(e.target.value)}>
              <option value="tourist">Tourist</option>
              <option value="business">Business</option>
              <option value="student">Student</option>
              <option value="family">Family Reunion</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Refresh Interval: {intervalMs / 1000}s</label>
          <input
            type="range"
            min={5000}
            max={60000}
            step={1000}
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            className="w-full accent-brand-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>5s</span><span>60s</span>
          </div>
        </div>

        <div>
          <label className="label">Mode</label>
          <div className="flex gap-4">
            {(['auto', 'manual'] as const).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                <span className="capitalize">{m}</span>
                <span className="text-xs text-gray-400">
                  {m === 'auto' ? '(books immediately)' : '(alerts only)'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Profiles to book for</label>
          <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
            {profiles.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedProfileIds.includes(p.id)}
                  onChange={(e) =>
                    setSelectedProfileIds((prev) =>
                      e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                    )
                  }
                />
                {p.fullName}
                <span className={`badge ${p.priority === 'HIGH' ? 'badge-yellow' : 'badge-gray'}`}>
                  {p.priority}
                </span>
              </label>
            ))}
            {!profiles.length && <p className="text-xs text-gray-400 p-2">No profiles — add profiles first</p>}
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending || selectedProfileIds.length === 0}
        >
          {startMutation.isPending ? 'Starting…' : 'Start Monitor'}
        </button>

        {startMutation.isError && (
          <p className="text-sm text-red-600">Failed to start monitor. Check console.</p>
        )}
      </div>
    </div>
  );
}
