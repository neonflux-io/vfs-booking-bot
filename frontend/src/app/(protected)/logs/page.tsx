'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Download } from 'lucide-react';
import clsx from 'clsx';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  eventType: string;
  message: string;
  destination?: string;
  result?: string;
  profile?: { fullName: string } | null;
}

export default function LogsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [eventType, setEventType] = useState('');
  const [level, setLevel] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['logs', from, to, eventType, level],
    queryFn: () =>
      api.get('/logs', { params: { from: from || undefined, to: to || undefined, eventType: eventType || undefined, level: level || undefined, limit: 200 } })
        .then((r) => r.data),
  });

  function downloadCsv() {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (eventType) params.set('eventType', eventType);
    window.open(`/api/logs/export?${params}`, '_blank');
  }

  const EVENT_TYPES = ['SLOT_DETECTED', 'BOOKING_ATTEMPT', 'BOOKING_SUCCESS', 'BOOKING_FAILED', 'IP_BLOCKED', 'SESSION_EXPIRED', 'CAPTCHA_REQUIRED'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Logs & History</h1>
        <button className="btn-secondary gap-2" onClick={downloadCsv}>
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">From</label>
            <input type="datetime-local" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="datetime-local" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="label">Event Type</label>
            <select className="input" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">All</option>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Level</label>
            <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
            </select>
          </div>
        </div>
        <button className="btn-secondary mt-3 text-xs" onClick={() => refetch()}>Refresh</button>
      </div>

      {/* Log table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Timestamp</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Level</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Event</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Message</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>
              )}
              {data?.items?.map((log: LogEntry) => (
                <tr
                  key={log.id}
                  className={clsx(
                    'hover:bg-gray-50',
                    log.level === 'ERROR' && 'bg-red-50',
                    log.level === 'WARN' && 'bg-yellow-50',
                    log.eventType === 'SLOT_DETECTED' && 'bg-green-50',
                  )}
                >
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap font-mono">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className={clsx('badge',
                      log.level === 'ERROR' ? 'badge-red' :
                      log.level === 'WARN' ? 'badge-yellow' : 'badge-blue'
                    )}>
                      {log.level}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-gray-600">{log.eventType}</td>
                  <td className="px-4 py-2 text-gray-800">{log.message}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{log.profile?.fullName}</td>
                </tr>
              ))}
              {!isLoading && !data?.items?.length && (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">No logs match the filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {data?.total > 0 && (
          <div className="px-4 py-3 text-xs text-gray-400 border-t">
            Showing {data.items.length} of {data.total} entries
          </div>
        )}
      </div>
    </div>
  );
}
