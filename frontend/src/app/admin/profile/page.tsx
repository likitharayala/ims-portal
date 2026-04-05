'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Toast, useToast } from '@/components/ui/Toast';
import { getApiError } from '@/lib/utils';

interface ProfileData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
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

export default function AdminProfilePage() {
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
    pwMutation.mutate({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
  };

  if (isLoading) return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="animate-pulse h-8 w-32 bg-slate-200 rounded mb-6" />
      <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />
    </div>
  );

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">My Profile</h1>

      <div className="space-y-6">
        {/* Personal info */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Personal Information</h2>
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
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Change Password</h2>

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
    </div>
  );
}
