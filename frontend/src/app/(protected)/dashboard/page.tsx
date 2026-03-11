'use client';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { api } from '@/lib/api';
import { useMonitorStore } from '@/store/monitorStore';
import clsx from 'clsx';

function StatusCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { liveLogFeed, monitors } = useMonitorStore();
  const logContainerRef = useRef<HTMLDivElement>(null);

  const { data: bookingData } = useQuery({
    queryKey: ['booking-history'],
    queryFn: () => api.get('/booking/history?limit=1').then((r) => r.data),
    refetchInterval: 10_000,
  });

  const rowVirtualizer = useVirtualizer({
    count: liveLogFeed.length,
    getScrollElement: () => logContainerRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const activeMonitors = monitors.filter((m) => m.isRunning).length;
  const lastBooking = bookingData?.items?.[0];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatusCard label="Active Monitors" value={activeMonitors} />
        <StatusCard
          label="Last Slot Detected"
          value={monitors[0]?.slotDetectedCount ?? 0}
          sub="total slots this session"
        />
        <StatusCard
          label="Last Booking"
          value={lastBooking?.status ?? 'None'}
          sub={lastBooking?.confirmationNo ?? ''}
        />
      </div>

      {/* Live logs panel */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Live Log Feed</h2>
          <span className="badge badge-gray">{liveLogFeed.length} entries</span>
        </div>

        <div
          ref={logContainerRef}
          className="h-80 overflow-auto font-mono text-xs bg-gray-950 text-gray-200 rounded p-2"
        >
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((row) => {
              const entry = liveLogFeed[row.index];
              if (!entry) return null;
              return (
                <div
                  key={row.index}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}
                  className={clsx(
                    'px-2 py-1 rounded',
                    entry.level === 'ERROR' && 'text-red-400',
                    entry.level === 'WARN' && 'text-yellow-400',
                    entry.eventType === 'SLOT_DETECTED' && 'text-green-400',
                  )}
                >
                  <span className="text-gray-500">{new Date(entry.timestamp).toLocaleTimeString()} </span>
                  <span className="text-gray-400">[{entry.eventType}] </span>
                  {entry.message}
                </div>
              );
            })}
          </div>
          {liveLogFeed.length === 0 && (
            <p className="text-gray-500 text-center mt-8">Waiting for events…</p>
          )}
        </div>
      </div>
    </div>
  );
}
