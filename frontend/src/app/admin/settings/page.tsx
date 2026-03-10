'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Profile is now at /admin/profile — see AdminSidebar avatar dropdown
import { api } from '@/lib/api';
import { Toast, useToast } from '@/components/ui/Toast';
import { getApiError } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InstituteData {
  id: string;
  name: string;
  email: string;
  phone: string;
  slug: string;
}

interface FeaturesData {
  students: boolean;
  materials: boolean;
  assessments: boolean;
  payments: boolean;
  ai_generation: boolean;
}

interface ProfileData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

// ─── API hooks ────────────────────────────────────────────────────────────────

function useInstitute() {
  return useQuery({
    queryKey: ['settings-institute'],
    queryFn: async () => {
      const { data } = await api.get('/admin/settings/institute');
      return data.data as InstituteData;
    },
  });
}

function useFeatures() {
  return useQuery({
    queryKey: ['settings-features'],
    queryFn: async () => {
      const { data } = await api.get('/admin/settings/features');
      return data.data as FeaturesData;
    },
  });
}

function useAdminProfile() {
  return useQuery({
    queryKey: ['settings-profile'],
    queryFn: async () => {
      const { data } = await api.get('/admin/settings/profile');
      return data.data as ProfileData;
    },
  });
}

// ─── Tab: Institute ───────────────────────────────────────────────────────────

function InstituteTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useInstitute();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [isDirty, setIsDirty] = useState(false);
  const { toast, show: showToast, hide: hideToast } = useToast();

  useEffect(() => {
    if (data) setForm({ name: data.name, phone: data.phone });
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (payload: { name?: string; phone?: string }) => {
      const { data: res } = await api.patch('/admin/settings/institute', payload);
      return res.data as InstituteData;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-institute'] });
      showToast('Institute settings updated');
      setIsDirty(false);
    },
    onError: (err) => showToast(getApiError(err), 'error'),
  });

  if (isLoading) return <div className="animate-pulse h-40 bg-slate-100 rounded-xl" />;

  return (
    <>
      <form
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }}
        className="space-y-4 max-w-md"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Institute Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setIsDirty(true); }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => { setForm((p) => ({ ...p, phone: e.target.value })); setIsDirty(true); }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            disabled
            value={data?.email ?? ''}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
          />
          <p className="text-xs text-slate-400 mt-1">Email cannot be changed in V1</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Slug</label>
          <input
            type="text"
            disabled
            value={data?.slug ?? ''}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 cursor-not-allowed font-mono"
          />
        </div>

        <button
          type="submit"
          disabled={!isDirty || mutation.isPending}
          className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {mutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  );
}

// ─── Tab: Features ────────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  students: 'Students',
  materials: 'Study Materials',
  assessments: 'Assessments',
  payments: 'Payments',
  ai_generation: 'AI Generation',
};

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  students: 'Manage student profiles, bulk uploads, and credentials',
  materials: 'Upload and share study materials (PDF)',
  assessments: 'Create and conduct online assessments',
  payments: 'Track monthly fee payments',
  ai_generation: 'Generate assessment questions using AI',
};

function FeaturesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useFeatures();
  const [local, setLocal] = useState<Partial<FeaturesData>>({});
  const { toast, show: showToast, hide: hideToast } = useToast();

  useEffect(() => {
    if (data) setLocal(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (features: Partial<FeaturesData>) => {
      const { data: res } = await api.patch('/admin/settings/features', { features });
      return res.data as FeaturesData;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-features'] });
      showToast('Feature settings updated');
      // Sidebar caches for both roles
      qc.invalidateQueries({ queryKey: ['student-features'] });
    },
    onError: (err) => showToast(getApiError(err), 'error'),
  });

  const toggle = (key: keyof FeaturesData, value: boolean) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    mutation.mutate({ [key]: value });
  };

  if (isLoading) return <div className="animate-pulse h-40 bg-slate-100 rounded-xl" />;

  return (
    <>
      <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <strong>Note:</strong> Disabling a feature hides data from users — it does not delete
        anything. Re-enabling it restores all data immediately.
      </div>

      <div className="space-y-3 max-w-lg">
        {(Object.keys(FEATURE_LABELS) as Array<keyof FeaturesData>).map((key) => (
          <div
            key={key}
            className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl"
          >
            <div>
              <p className="font-medium text-slate-800 text-sm">{FEATURE_LABELS[key]}</p>
              <p className="text-xs text-slate-500 mt-0.5">{FEATURE_DESCRIPTIONS[key]}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(key, !local[key])}
              disabled={mutation.isPending}
              className={`relative inline-flex h-6 w-11 rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
                local[key] ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  local[key] ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  );
}

// ─── Tab: Profile ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useAdminProfile();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [isDirty, setIsDirty] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwError, setPwError] = useState('');
  const { toast, show: showToast, hide: hideToast } = useToast();

  useEffect(() => {
    if (data) setForm({ name: data.name, phone: data.phone ?? '' });
  }, [data]);

  const profileMutation = useMutation({
    mutationFn: async (payload: { name?: string; phone?: string }) => {
      const { data: res } = await api.patch('/admin/settings/profile', payload);
      return res.data as ProfileData;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-profile'] });
      showToast('Profile updated');
      setIsDirty(false);
    },
    onError: (err) => showToast(getApiError(err), 'error'),
  });

  const pwMutation = useMutation({
    mutationFn: async (payload: { currentPassword: string; newPassword: string }) => {
      await api.post('/auth/change-password', payload);
    },
    onSuccess: () => {
      showToast('Password changed successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPwError('');
    },
    onError: (err) => setPwError(getApiError(err)),
  });

  const handlePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwError('Password must be at least 8 characters');
      return;
    }
    pwMutation.mutate({
      currentPassword: pwForm.currentPassword,
      newPassword: pwForm.newPassword,
    });
  };

  if (isLoading) return <div className="animate-pulse h-40 bg-slate-100 rounded-xl" />;

  return (
    <>
      <div className="space-y-6 max-w-md">
        {/* Profile form */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Personal Information</h3>
          <form
            onSubmit={(e) => { e.preventDefault(); profileMutation.mutate(form); }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setIsDirty(true); }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => { setForm((p) => ({ ...p, phone: e.target.value })); setIsDirty(true); }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                disabled
                value={data?.email ?? ''}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              <p className="text-xs text-slate-400 mt-1">Email cannot be changed in V1</p>
            </div>
            <button
              type="submit"
              disabled={!isDirty || profileMutation.isPending}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {profileMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Change Password</h3>

          {pwError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {pwError}
            </div>
          )}

          <form onSubmit={handlePwSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
              <input
                type="password"
                required
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={pwForm.newPassword}
                onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={pwMutation.isPending}
              className="px-5 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 font-medium"
            >
              {pwMutation.isPending ? 'Updating…' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'institute' | 'features';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('institute');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'institute', label: 'Institute' },
    { key: 'features', label: 'Features' },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              tab === t.key
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'institute' && <InstituteTab />}
      {tab === 'features' && <FeaturesTab />}
    </div>
  );
}
