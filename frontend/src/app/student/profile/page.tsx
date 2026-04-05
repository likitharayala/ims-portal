'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Link from 'next/link';
import { toIST, getApiError } from '@/lib/utils';
import { Toast, useToast } from '@/components/ui/Toast';

interface StudentProfile {
  id: string;
  rollNumber: string | null;
  class: string;
  school: string;
  dateOfBirth: string | null;
  address: string | null;
  parentName: string | null;
  parentPhone: string | null;
  feeAmount: string;
  joinedDate: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    mustChangePassword: boolean;
    lastLoginAt: string | null;
  };
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm text-slate-800">{value || '—'}</p>
    </div>
  );
}

export default function StudentProfilePage() {
  const { user: authUser, setAuth } = useAuthStore();
  const qc = useQueryClient();
  const { toast, show: showToast, hide: hideToast } = useToast();

  // ── Edit profile state ──────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');

  // ── Change password state ───────────────────────────────────────────────
  const [changingPw, setChangingPw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: async () => {
      const { data } = await api.get('/student/profile');
      return data.data as StudentProfile;
    },
  });

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setName(profile.user.name);
      setPhone(profile.user.phone ?? '');
      setAddress(profile.address ?? '');
      setParentName(profile.parentName ?? '');
      setParentPhone(profile.parentPhone ?? '');
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: async (dto: {
      name?: string;
      phone?: string;
      address?: string;
      parentName?: string;
      parentPhone?: string;
    }) => {
      const { data } = await api.put('/student/profile', dto);
      return data.data as StudentProfile;
    },
    onSuccess: (updated) => {
      qc.setQueryData(['student-profile'], updated);
      // Sync name in auth store so sidebar updates
      if (authUser) {
        setAuth(
          localStorage.getItem('accessToken')!,
          localStorage.getItem('refreshToken')!,
          { ...authUser, name: updated.user.name },
        );
      }
      setEditing(false);
      showToast('Profile updated');
    },
    onError: (err) => showToast(getApiError(err), 'error'),
  });

  const changePwMutation = useMutation({
    mutationFn: async (dto: { currentPassword: string; newPassword: string }) => {
      await api.post('/auth/change-password', dto);
    },
    onSuccess: () => {
      setChangingPw(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwError('');
      showToast('Password changed successfully');
    },
    onError: (err) => setPwError(getApiError(err)),
  });

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      name: name.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      parentName: parentName.trim() || undefined,
      parentPhone: parentPhone.trim() || undefined,
    });
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match');
      return;
    }
    if (newPw.length < 8) {
      setPwError('Password must be at least 8 characters');
      return;
    }
    changePwMutation.mutate({ currentPassword: currentPw, newPassword: newPw });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
            <div className="h-4 w-32 bg-slate-200 rounded mb-4" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-10 bg-slate-100 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">My Profile</h1>

      {/* ── Personal Info ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-700">Personal Information</h2>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                <input
                  value={profile.user.email}
                  disabled
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-400 cursor-not-allowed"
                />
                <p className="text-xs text-slate-400 mt-1">Email cannot be changed</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Parent Name</label>
                <input
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Parent Phone</label>
                <input
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name" value={profile.user.name} />
            <Field label="Email" value={profile.user.email} />
            <Field label="Phone" value={profile.user.phone} />
            <Field label="Address" value={profile.address} />
            <Field label="Parent Name" value={profile.parentName} />
            <Field label="Parent Phone" value={profile.parentPhone} />
          </div>
        )}
      </div>

      {/* ── Academic Info (read-only) ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-700 mb-5">Academic Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Class" value={profile.class} />
          <Field label="School" value={profile.school} />
          <Field label="Roll Number" value={profile.rollNumber} />
          <Field
            label="Date of Birth"
            value={profile.dateOfBirth ? toIST(profile.dateOfBirth, 'dd MMM yyyy') : null}
          />
          <Field
            label="Joined Date"
            value={toIST(profile.joinedDate, 'dd MMM yyyy')}
          />
          <Field
            label="Last Login"
            value={
              profile.user.lastLoginAt
                ? toIST(profile.user.lastLoginAt, 'dd MMM yyyy, hh:mm a')
                : null
            }
          />
        </div>
      </div>

      {/* ── Performance History link ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between">
        <div>
          <p className="font-semibold text-slate-700">Performance History</p>
          <p className="text-sm text-slate-500 mt-0.5">View your marks across all assessments</p>
        </div>
        <Link
          href="/student/performance"
          className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
        >
          View →
        </Link>
      </div>

      {/* ── Change Password ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-700">Change Password</h2>
          {!changingPw && (
            <button
              onClick={() => setChangingPw(true)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Change
            </button>
          )}
        </div>

        {changingPw ? (
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Current Password *
              </label>
              <input
                required
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                New Password *
              </label>
              <input
                required
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Confirm New Password *
              </label>
              <input
                required
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {pwError && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{pwError}</p>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setChangingPw(false);
                  setCurrentPw('');
                  setNewPw('');
                  setConfirmPw('');
                  setPwError('');
                }}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={changePwMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {changePwMutation.isPending ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">••••••••</p>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
