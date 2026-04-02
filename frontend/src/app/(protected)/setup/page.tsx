'use client';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMonitorStore } from '@/store/monitorStore';
import { cn } from '@/lib/utils';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { 
  Plus, 
  Play, 
  StopCircle, 
  Settings2, 
  Globe, 
  Zap, 
  ShieldCheck, 
  AlertTriangle,
  Clock,
  LayoutGrid,
  ChevronRight,
  UserCheck,
  MapPin,
  Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Cooldown Countdown Component ──────────────────────────────────────────
function CooldownCountdown({ until }: { until: string | null }) {
  const [timeLeft, setTimeLeft] = useState<string>('00:00');

  useEffect(() => {
    if (!until) return;

    const updateTimer = () => {
      const diff = new Date(until).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };

    updateTimer(); // Initial call
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [until]);

  return <span className="font-mono text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]">{timeLeft}</span>;
}

// ─── Types for VFS Config API ────────────────────────────────────────────────
interface VfsCountry { code: string; label: string; }
interface VfsCentre { id: string; label: string; address?: string; }
interface VfsVisaType { code: string; label: string; category: string; }

export default function SetupPage() {
  const qc = useQueryClient();
  const { setMonitors } = useMonitorStore();

  // ─── Form State ──────────────────────────────────────────────────────────
  const [sourceCountry, setSourceCountry] = useState('gbr');
  const [destination, setDestination] = useState('prt');
  const [centre, setCentre] = useState('');
  const [visaType, setVisaType] = useState('');
  const [intervalMs, setIntervalMs] = useState(30000);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [proxy, setProxy] = useState<{ 
    host: string; 
    port: number; 
    username?: string; 
    password?: string 
  } | null>(null);

  // ─── Fetch VFS Config (countries, centres, visa types) ───────────────────
  const { data: vfsConfig } = useQuery({
    queryKey: ['vfs-config'],
    queryFn: () => api.get('/vfs-config').then((r) => r.data),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour — this data rarely changes
  });

  // Fetch centres when source country changes
  const { data: centres } = useQuery({
    queryKey: ['vfs-centres', sourceCountry],
    queryFn: () => api.get(`/vfs-config/centres/${sourceCountry}`).then((r) => r.data),
    enabled: !!sourceCountry,
  });

  // Fetch visa types when destination changes
  const { data: visaTypes } = useQuery({
    queryKey: ['vfs-visa-types', destination],
    queryFn: () => api.get(`/vfs-config/visa-types/${destination}`).then((r) => r.data),
    enabled: !!destination,
  });

  // ─── Derived Options ─────────────────────────────────────────────────────
  const sourceOptions = useMemo(() => 
    (vfsConfig?.sourceCountries ?? []).map((c: VfsCountry) => ({ value: c.code, label: c.label })),
    [vfsConfig]
  );

  const destOptions = useMemo(() => 
    (vfsConfig?.destinationCountries ?? []).map((c: VfsCountry) => ({ value: c.code, label: c.label })),
    [vfsConfig]
  );

  const centreOptions = useMemo(() => 
    (centres ?? []).map((c: VfsCentre) => ({ value: c.id, label: c.label })),
    [centres]
  );

  const visaTypeOptions = useMemo(() => {
    const types = visaTypes ?? [];
    // Group by category for visual separation
    const shortStay = types.filter((t: VfsVisaType) => t.category === 'short-stay');
    const longStay = types.filter((t: VfsVisaType) => t.category === 'long-stay');
    const national = types.filter((t: VfsVisaType) => t.category === 'national');
    const other = types.filter((t: VfsVisaType) => t.category === 'other');
    return [
      ...shortStay.map((t: VfsVisaType) => ({ value: t.code, label: `${t.label}` })),
      ...longStay.map((t: VfsVisaType) => ({ value: t.code, label: `${t.label}` })),
      ...national.map((t: VfsVisaType) => ({ value: t.code, label: `${t.label}` })),
      ...other.map((t: VfsVisaType) => ({ value: t.code, label: t.label })),
    ];
  }, [visaTypes]);

  // ─── Reset cascading selections when parent changes ──────────────────────
  useEffect(() => {
    setCentre('');
  }, [sourceCountry]);

  useEffect(() => {
    setVisaType('');
  }, [destination]);

  // Auto-select first centre and visa type when options load
  useEffect(() => {
    if (centreOptions.length > 0 && !centre) {
      setCentre(centreOptions[0].value);
    }
  }, [centreOptions, centre]);

  useEffect(() => {
    if (visaTypeOptions.length > 0 && !visaType) {
      setVisaType(visaTypeOptions[0].value);
    }
  }, [visaTypeOptions, visaType]);

  // Find selected centre's address
  const selectedCentreAddress = useMemo(() => {
    if (!centre || !centres) return null;
    return (centres as VfsCentre[]).find((c) => c.id === centre)?.address ?? null;
  }, [centre, centres]);

  // ─── Profiles & Monitor Status ───────────────────────────────────────────
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
    mutationFn: () => api.post('/monitor/start', { 
      sourceCountry,
      destination,
      centre,
      visaType, 
      intervalMs, 
      profileIds: selectedProfileIds, 
      mode,
      proxy: proxy?.host ? proxy : undefined
    }),
    onSuccess: () => { 
      setSelectedProfileIds([]); 
      setProxy(null);
      refetchStatus(); 
      qc.invalidateQueries({ queryKey: ['monitor-status'] }); 
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/monitor/stop/${id}`),
    onSuccess: () => refetchStatus(),
  });

  const activeMonitors = (monitorStatus ?? []).filter((m: { isRunning: boolean }) => m.isRunning);

  return (
    <DashboardShell 
      title="Monitoring Engine Control" 
      description="Deploy and calibrate advanced visa appointment detection units with real-time acquisition logic."
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Left Column: Configuration Form (7 slots) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Monitor Control */}
          <div className="card p-8 bg-card/40 backdrop-blur-md border-primary/20 shadow-2xl shadow-primary/5 relative z-[20]">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary/30" />
            <div className="flex items-center gap-4 mb-8">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Settings2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-tight">Engine Configuration</h3>
                <p className="text-xs text-muted-foreground">Setup target parameters for slot acquisition.</p>
              </div>
            </div>

            <div className="space-y-10">
              {/* Route Configuration — Source & Destination */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <CustomSelect
                  label="Applying From"
                  value={sourceCountry}
                  onChange={(val: any) => setSourceCountry(val)}
                  options={sourceOptions}
                />
                <CustomSelect
                  label="Target Destination"
                  value={destination}
                  onChange={setDestination}
                  options={destOptions}
                />
              </div>

              {/* Application Centre (City) — NEW */}
              {centreOptions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
                      Application Centre (City)
                    </label>
                  </div>
                  <CustomSelect
                    label=""
                    value={centre}
                    onChange={setCentre}
                    options={centreOptions}
                  />
                  {selectedCentreAddress && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 pl-1"
                    >
                      <Building2 className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground italic">{selectedCentreAddress}</span>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Visa Category */}
              <CustomSelect
                label="Visa Category"
                value={visaType}
                onChange={setVisaType}
                options={visaTypeOptions}
              />

              {/* Execution Mode Toggle */}
              <div className="space-y-4">
                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground pl-1">Execution Strategy</label>
                <div className="grid grid-cols-2 gap-4">
                  {(['auto', 'manual'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={cn(
                        "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all duration-300",
                        mode === m 
                          ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]" 
                          : "bg-accent/20 border-transparent hover:border-muted text-muted-foreground"
                      )}
                    >
                      {m === 'auto' ? <Zap className="w-5 h-5 text-primary" /> : <AlertTriangle className="w-5 h-5" />}
                      <span className="text-sm font-bold uppercase tracking-wide">{m} Mode</span>
                      <span className="text-[10px] opacity-70">
                        {m === 'auto' ? 'Automated Booking' : 'Alert Only (Dry Run)'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Polling Velocity Slider */}
              <div className="space-y-4 bg-accent/10 p-6 rounded-2xl border border-dashed">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground pl-1 flex items-center gap-2">
                    <Clock className="w-3 h-3" /> Polling Intensity
                  </label>
                  <span className="text-xs font-mono font-bold bg-primary/20 text-primary px-2 py-0.5 rounded leading-none">
                    {intervalMs / 1000}s Interval
                  </span>
                </div>
                <input
                  type="range"
                  min={1000}
                  max={60000}
                  step={1000}
                  value={intervalMs}
                  onChange={(e) => setIntervalMs(Number(e.target.value))}
                  className="w-full h-2 bg-accent rounded-full appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">
                  <span className="text-primary font-black">Turbo (1s)</span>
                  <span>Conservative (60s)</span>
                </div>
              </div>

              {/* Profile Target Matrix */}
              <div className="space-y-4">
                 <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground pl-1 flex items-center gap-2">
                    <UserCheck className="w-3 h-3" /> Target Profiles
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {profiles.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProfileIds(prev => 
                          prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                        )}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border text-left transition-all",
                          selectedProfileIds.includes(p.id)
                            ? "bg-primary/5 border-primary shadow-sm"
                            : "bg-accent/20 border-transparent hover:border-muted text-muted-foreground opacity-60 hover:opacity-100"
                        )}
                      >
                        <span className="text-xs font-bold truncate pr-2">{p.fullName}</span>
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded font-black",
                          p.priority === 'HIGH' ? "bg-amber-500/20 text-amber-500" : "bg-zinc-500/20 text-zinc-500"
                        )}>
                          {p.priority}
                        </span>
                      </button>
                    ))}
                    {!profiles.length && <p className="col-span-full text-xs text-muted-foreground italic py-4">No active profiles — go to Applicants first.</p>}
                  </div>
              </div>

              {/* Trigger Button */}
              <button
                disabled={startMutation.isPending || selectedProfileIds.length === 0}
                onClick={() => startMutation.mutate()}
                className="w-full btn-primary h-14 rounded-2xl gap-3 text-lg font-bold shadow-xl shadow-primary/20 disabled:grayscale hover:scale-[1.01] active:scale-[0.98] transition-all"
              >
                {startMutation.isPending ? (
                  <div className="w-6 h-6 border-2 border-primary-foreground border-t-transparent animate-spin rounded-full" />
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    Engage Monitoring
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Proxy Configuration */}
          <div className="card p-8 bg-card/40 backdrop-blur-md border-primary/10 shadow-xl mt-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-tight">Secure Tunneling (Proxy)</h3>
                <p className="text-xs text-muted-foreground">Bypass IP blocks with residential proxies.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-muted-foreground pl-1">Proxy Host</label>
                <input 
                  type="text" 
                  placeholder="e.g. proxy.myservice.com"
                  className="w-full bg-accent/20 border-transparent focus:border-primary/50 rounded-xl p-3 text-sm transition-all"
                  value={proxy?.host || ''}
                  onChange={(e) => setProxy(prev => ({ ...prev!, host: e.target.value, port: prev?.port || 8080 }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-muted-foreground pl-1">Port</label>
                <input 
                  type="number" 
                  placeholder="8080"
                  className="w-full bg-accent/20 border-transparent focus:border-primary/50 rounded-xl p-3 text-sm transition-all"
                  value={proxy?.port || ''}
                  onChange={(e) => setProxy(prev => ({ ...prev!, port: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-muted-foreground pl-1">Username (Opt)</label>
                <input 
                  type="text" 
                  className="w-full bg-accent/20 border-transparent focus:border-primary/50 rounded-xl p-3 text-sm transition-all"
                  value={proxy?.username || ''}
                  onChange={(e) => setProxy(prev => ({ ...prev!, username: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-muted-foreground pl-1">Password (Opt)</label>
                <input 
                  type="password" 
                  className="w-full bg-accent/20 border-transparent focus:border-primary/50 rounded-xl p-3 text-sm transition-all"
                  value={proxy?.password || ''}
                  onChange={(e) => setProxy(prev => ({ ...prev!, password: e.target.value }))}
                />
              </div>
            </div>
            <p className="mt-4 text-[10px] text-muted-foreground italic">Note: HTTP/HTTPS proxies ONLY. SOCKS proxies require additional setup.</p>
          </div>
        </div>

        {/* Right Column: Active Streams (5 slots) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex items-center justify-between px-2">
             <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Active Streams</h3>
             <span className="text-[10px] font-mono text-muted-foreground bg-accent px-2 py-0.5 rounded">{activeMonitors.length} Units</span>
          </div>

          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {activeMonitors.map((m: any) => (
                <motion.div
                  layout
                  key={m.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    "card p-5 bg-card/60 transition-all group overflow-hidden border-l-4",
                    m.isCoolingDown ? "border-l-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : "border-l-green-500"
                  )}
                >
                  {m.isCoolingDown && (
                    <div className="absolute top-0 right-0 px-3 py-1 bg-blue-500 text-[9px] font-black uppercase text-white tracking-widest animate-in slide-in-from-right duration-300">
                      ❄️ ICE State Active
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center relative",
                        m.isCoolingDown ? "bg-blue-500/20 text-blue-500" : "bg-green-500/10 text-green-500"
                      )}>
                        <Zap className={cn("w-5 h-5 fill-current transition-colors", m.isCoolingDown && "animate-pulse")} />
                        <span className={cn(
                          "absolute -top-1 -right-1 w-3 h-3 rounded-full animate-ping opacity-50",
                          m.isCoolingDown ? "bg-blue-500" : "bg-green-500"
                        )} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold uppercase tracking-tight">
                          {m.sourceLabel || m.sourceCountry?.toUpperCase() || 'N/A'} → {m.destinationLabel || m.destination?.toUpperCase()}
                        </h4>
                        <div className="flex items-center gap-1.5">
                          {m.centreLabel && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />
                              {m.centreLabel}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">• {m.visaType}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => stopMutation.mutate(m.id)}
                      className="p-2 rounded-lg bg-destructive/5 text-destructive/40 hover:bg-destructive hover:text-white transition-all shadow-sm"
                    >
                      <StopCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-dashed relative z-10">
                     <div className="space-y-1">
                        <p className="text-[9px] uppercase font-black text-muted-foreground tracking-widest">Slots Captured</p>
                        <p className={cn("text-sm font-black italic", m.isCoolingDown ? "text-blue-400" : "text-green-500")}>
                          {m.slotDetectedCount}
                        </p>
                     </div>
                     <div className="space-y-1">
                        <p className="text-[9px] uppercase font-black text-muted-foreground tracking-widest leading-none">
                          {m.isCoolingDown ? 'Next Check In' : 'Current Rate'}
                        </p>
                        <p className={cn("text-sm font-mono font-bold pt-1", m.isCoolingDown ? "text-blue-400" : "text-zinc-100")}>
                          {m.isCoolingDown ? <CooldownCountdown until={m.cooldownUntil} /> : `${(m.interval / 1000 || 0).toFixed(1)}s`}
                        </p>
                     </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-accent rounded-full overflow-hidden">
                       <motion.div 
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ 
                          duration: m.isCoolingDown ? 5.0 : (m.interval / 1000 || 5), 
                          repeat: Infinity, 
                          ease: "linear" 
                        }}
                        className={cn("h-full", m.isCoolingDown ? "bg-blue-500/50" : "bg-green-500/50")}
                       />
                    </div>
                    <span className={cn(
                      "text-[9px] uppercase font-black tracking-tighter italic",
                      m.isCoolingDown ? "text-blue-500 animate-pulse" : "text-muted-foreground"
                    )}>
                      {m.isCoolingDown ? 'Frozen (Cooling)...' : 'Syncing...'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {activeMonitors.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-center opacity-30 grayscale border-2 border-dashed rounded-3xl">
                <ShieldCheck className="w-12 h-12 mb-4" />
                <h3 className="text-sm font-bold uppercase tracking-widest">No Active Engine</h3>
                <p className="text-xs">Configure and start a monitor unit to see activity here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
