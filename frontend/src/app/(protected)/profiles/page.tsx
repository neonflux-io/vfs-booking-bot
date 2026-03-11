'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { api } from '@/lib/api';
import { Plus, Upload, Trash2, Edit2 } from 'lucide-react';
import clsx from 'clsx';

interface Profile {
  id: string;
  fullName: string;
  passportNumberMasked: string;
  nationality: string;
  email: string;
  priority: 'HIGH' | 'NORMAL';
  isActive: boolean;
}

export default function ProfilesPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [importResults, setImportResults] = useState<{ succeeded: number; failed: number; results: { row: number; success: boolean; error?: string }[] } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.get('/profiles').then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/profiles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'text/csv': ['.csv'] },
    maxFiles: 1,
    onDrop: async (files) => {
      if (!files[0]) return;
      const fd = new FormData();
      fd.append('file', files[0]);
      const res = await api.post('/profiles/bulk-upload', fd);
      setImportResults(res.data);
      qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Applicant Profiles</h1>
        <button className="btn-primary gap-2" onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus size={16} /> Add Profile
        </button>
      </div>

      {/* Bulk upload zone */}
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
          isDragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-400'
        )}
      >
        <input {...getInputProps()} />
        <Upload size={20} className="mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-500">Drop Excel or CSV file here to bulk import</p>
        <p className="text-xs text-gray-400 mt-1">Columns: Full Name, Passport Number, Date of Birth, Passport Expiry, Nationality, Email, Phone, Priority</p>
      </div>

      {/* Import results */}
      {importResults && (
        <div className="card">
          <p className="text-sm font-medium">
            Import complete: <span className="text-green-600">{importResults.succeeded} succeeded</span>,{' '}
            <span className="text-red-600">{importResults.failed} failed</span>
          </p>
          {importResults.results.filter((r) => !r.success).map((r) => (
            <p key={r.row} className="text-xs text-red-600 mt-1">Row {r.row}: {r.error}</p>
          ))}
        </div>
      )}

      {/* Profile table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Passport</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nationality</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>
            )}
            {data?.items?.map((p: Profile) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.fullName}</td>
                <td className="px-4 py-3 font-mono text-gray-500">{p.passportNumberMasked}</td>
                <td className="px-4 py-3 text-gray-600">{p.nationality}</td>
                <td className="px-4 py-3">
                  <span className={clsx('badge', p.priority === 'HIGH' ? 'badge-yellow' : 'badge-gray')}>
                    {p.priority}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <button className="btn-secondary p-1.5" onClick={() => { setEditing(p); setShowModal(true); }}>
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="btn-danger p-1.5"
                      onClick={() => { if (confirm('Delete this profile?')) deleteMutation.mutate(p.id); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && !data?.items?.length && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No profiles yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && <ProfileModal profile={editing} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function ProfileModal({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fullName: profile?.fullName ?? '',
    passportNumber: '',
    dob: '',
    passportExpiry: '',
    nationality: profile?.nationality ?? '',
    email: profile?.email ?? '',
    phone: '',
    priority: profile?.priority ?? 'NORMAL',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (profile) {
        await api.put(`/profiles/${profile.id}`, form);
      } else {
        await api.post('/profiles', form);
      }
      qc.invalidateQueries({ queryKey: ['profiles'] });
      onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold mb-4">{profile ? 'Edit Profile' : 'Add Profile'}</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Full Name</label><input className="input" required {...field('fullName')} /></div>
            <div><label className="label">Passport Number</label><input className="input" required={!profile} {...field('passportNumber')} placeholder={profile ? '(unchanged)' : ''} /></div>
            <div><label className="label">Date of Birth</label><input type="date" className="input" required={!profile} {...field('dob')} /></div>
            <div><label className="label">Passport Expiry</label><input type="date" className="input" required={!profile} {...field('passportExpiry')} /></div>
            <div><label className="label">Nationality</label><input className="input" required {...field('nationality')} /></div>
            <div><label className="label">Phone</label><input className="input" required={!profile} {...field('phone')} /></div>
          </div>
          <div><label className="label">Email</label><input type="email" className="input" required {...field('email')} /></div>
          <div>
            <label className="label">Priority</label>
            <select className="input" {...field('priority')}>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
