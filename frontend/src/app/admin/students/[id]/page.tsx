'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useStudent,
  useUpdateStudent,
  useDeleteStudent,
  useUploadStudentPhoto,
  useResendStudentCredentials,
} from '@/hooks/use-students';
import { useStudentPerformance } from '@/hooks/use-assessments';
import type { PerformanceRecord } from '@/hooks/use-assessments';
import { Modal } from '@/components/ui/Modal';
import { Toast, useToast } from '@/components/ui/Toast';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { toIST, formatINR, getApiError } from '@/lib/utils';

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, show: showToast, hide: hideToast } = useToast();

  const { data: student, isLoading } = useStudent(id);
  const updateMutation = useUpdateStudent();
  const deleteMutation = useDeleteStudent();
  const photoMutation = useUploadStudentPhoto();
  const resendCredentialsMutation = useResendStudentCredentials();
  const { data: performance = [], isLoading: perfLoading } = useStudentPerformance(id);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    class: '',
    school: '',
    rollNumber: '',
    dateOfBirth: '',
    address: '',
    parentName: '',
    parentPhone: '',
    joinedDate: '',
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [tab, setTab] = useState<'details' | 'performance'>('details');

  useEffect(() => {
    if (student) {
      setForm({
        name: student.user.name,
        phone: student.user.phone ?? '',
        class: student.class,
        school: student.school,
        rollNumber: student.rollNumber ?? '',
        dateOfBirth: student.dateOfBirth
          ? student.dateOfBirth.split('T')[0]
          : '',
        address: student.address ?? '',
        parentName: student.parentName ?? '',
        parentPhone: student.parentPhone ?? '',
        joinedDate: student.joinedDate.split('T')[0],
      });
    }
  }, [student]);

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setIsDirty(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id,
        name: form.name,
        phone: form.phone || undefined,
        class: form.class,
        school: form.school,
        rollNumber: form.rollNumber || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        address: form.address || undefined,
        parentName: form.parentName || undefined,
        parentPhone: form.parentPhone || undefined,
        joinedDate: form.joinedDate || undefined,
      });
      showToast('Student updated successfully');
      setIsDirty(false);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      router.push('/admin/students');
    } catch (err) {
      showToast(getApiError(err), 'error');
      setShowDeleteDialog(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.jpg') && !ext.endsWith('.jpeg') && !ext.endsWith('.png')) {
      showToast('Only JPG and PNG files are allowed', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Photo must be under 5MB', 'error');
      return;
    }
    try {
      await photoMutation.mutateAsync({ id, file });
      showToast('Profile photo updated');
    } catch {
      showToast('Failed to upload photo', 'error');
    }
    e.target.value = '';
  };

  const handleResendCredentials = async () => {
    try {
      const result = await resendCredentialsMutation.mutateAsync(id);
      showToast(
        result.message,
        result.emailStatus === 'FAILED' ? 'warning' : 'success',
      );
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-6 text-center text-slate-500">
        Student not found.{' '}
        <Link href="/admin/students" className="text-blue-600 hover:underline">
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/students" className="text-slate-400 hover:text-slate-600 text-sm">
          ← Students
        </Link>
        <h1 className="text-2xl font-semibold text-slate-800 flex-1">{student.user.name}</h1>
        <button
          onClick={handleResendCredentials}
          disabled={resendCredentialsMutation.isPending}
          className="px-3 py-1.5 text-sm text-blue-700 hover:text-blue-800 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-60"
        >
          {resendCredentialsMutation.isPending ? 'Queueing…' : 'Resend Credentials'}
        </button>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
        >
          Delete
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {(['details', 'performance'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors -mb-px ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'performance' ? 'Performance History' : 'Details'}
          </button>
        ))}
      </div>

      {/* Performance tab */}
      {tab === 'performance' && (
        <div className="space-y-3">
          {perfLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm animate-pulse">
              Loading performance…
            </div>
          ) : performance.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
              <p className="text-slate-500 text-sm">No assessments attempted yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Assessment</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden sm:table-cell">Subject</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">Marks</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden md:table-cell">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {performance.map((p: PerformanceRecord) => {
                    const pct = p.marksObtained !== null && p.totalMarks > 0
                      ? Math.round((p.marksObtained / p.totalMarks) * 100)
                      : null;
                    return (
                      <tr key={p.assessmentId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{p.title}</td>
                        <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{p.subject ?? '—'}</td>
                        <td className="px-4 py-3 text-center">
                          {p.marksObtained !== null ? (
                            <span className={`font-semibold ${pct !== null && pct >= 75 ? 'text-green-600' : pct !== null && pct >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                              {p.marksObtained} / {p.totalMarks}
                              {pct !== null && <span className="text-xs text-slate-400 ml-1">({pct}%)</span>}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">
                              {p.isFinalized ? '—' : 'Pending'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
                            p.status === 'absent' ? 'bg-orange-100 text-orange-700'
                            : p.status === 'evaluated' ? 'bg-green-100 text-green-700'
                            : p.status === 'submitted' ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-500'
                          }`}>
                            {p.status === 'in_progress' ? 'In Progress' : p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                          {p.submittedAt
                            ? new Date(p.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'details' && (
      <>{/* Info banner */}
      <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap gap-4 text-sm">
        <div>
          <span className="text-slate-500">Email: </span>
          <span className="font-medium text-slate-700">{student.user.email}</span>
          <span className="ml-2 text-xs text-slate-400">(cannot be changed)</span>
        </div>
        <div>
          <span className="text-slate-500">Fee: </span>
          <span className="font-medium text-slate-700">{formatINR(Number(student.feeAmount))}/mo</span>
        </div>
        <div>
          <span className="text-slate-500">Status: </span>
          {student.user.mustChangePassword ? (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
              Pending login
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
              Active
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-500">Email delivery: </span>
          <span
            className={`px-2 py-0.5 text-xs rounded-full ${
              student.emailStatus === 'SENT'
                ? 'bg-green-100 text-green-700'
                : student.emailStatus === 'FAILED'
                ? 'bg-red-100 text-red-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {student.emailStatus}
          </span>
        </div>
        {student.user.lastLoginAt && (
          <div>
            <span className="text-slate-500">Last login: </span>
            <span className="text-slate-700">{toIST(student.user.lastLoginAt)}</span>
          </div>
        )}
      </div>

      {/* Profile Photo */}
      <div className="mb-6 bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-2xl flex-shrink-0 overflow-hidden">
          {student.user.name[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-700">Profile Photo</p>
          <p className="text-xs text-slate-500 mt-0.5">JPG or PNG, max 5MB</p>
        </div>
        <label className={`px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer ${photoMutation.isPending ? 'opacity-60 cursor-not-allowed' : ''}`}>
          {photoMutation.isPending ? 'Uploading…' : 'Upload Photo'}
          <input
            type="file"
            accept=".jpg,.jpeg,.png"
            className="hidden"
            disabled={photoMutation.isPending}
            onChange={handlePhotoUpload}
          />
        </label>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={set('name')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
              <input
                type="text"
                required
                value={form.class}
                onChange={set('class')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">School</label>
              <input
                type="text"
                required
                value={form.school}
                onChange={set('school')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Roll Number</label>
              <input
                type="text"
                value={form.rollNumber}
                onChange={set('rollNumber')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={set('dateOfBirth')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Parent Name</label>
              <input
                type="text"
                value={form.parentName}
                onChange={set('parentName')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Parent Phone</label>
              <input
                type="tel"
                value={form.parentPhone}
                onChange={set('parentPhone')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Joined Date</label>
              <input
                type="date"
                value={form.joinedDate}
                onChange={set('joinedDate')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
              <textarea
                value={form.address}
                onChange={set('address')}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isDirty || updateMutation.isPending}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      </>)} {/* end tab === 'details' */}

      {/* Delete confirmation */}
      {showDeleteDialog && (
        <Modal title="Delete Student" onClose={() => setShowDeleteDialog(false)}>
          <p className="text-sm text-slate-600 mb-6">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-slate-800">{student.user.name}</span>? Their
            session will be invalidated immediately. This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowDeleteDialog(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
