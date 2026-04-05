'use client';

import { useState } from 'react';
import {
  useTeachers,
  useCreateTeacher,
  useUpdateTeacher,
  useDeleteTeacher,
} from '@/hooks/use-teachers';
import type { Teacher } from '@/hooks/use-teachers';
import { Toast, useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { toIST, getApiError } from '@/lib/utils';

// ─── Create Teacher Modal ────────────────────────────────────────────────────

function CreateTeacherModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: (result: {
    name: string;
    email: string;
    tempPassword: string | null;
    onboardingMethod: 'manual_temp_password' | 'supabase_invite';
  }) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [classes, setClasses] = useState('');
  const createMutation = useCreateTeacher();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const assignedClasses = classes
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    try {
      const result = await createMutation.mutateAsync({
        name,
        email,
        phone: phone || undefined,
        assignedClasses,
      });
      onCreated({
        name: result.teacher.user.name,
        email: result.teacher.user.email,
        tempPassword: result.tempPassword,
        onboardingMethod: result.onboardingMethod,
      });
      onClose();
    } catch (err) {
      onError(getApiError(err));
    }
  };

  return (
    <Modal title="Add Teacher" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Assigned Classes (comma-separated)
          </label>
          <input
            placeholder="e.g. Class 10A, Class 10B"
            value={classes}
            onChange={(e) => setClasses(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {createMutation.isPending ? 'Adding…' : 'Add Teacher'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit Teacher Modal ──────────────────────────────────────────────────────

function EditTeacherModal({
  teacher,
  onClose,
  onError,
  onUpdated,
}: {
  teacher: Teacher;
  onClose: () => void;
  onError: (message: string) => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(teacher.user.name);
  const [phone, setPhone] = useState(teacher.user.phone ?? '');
  const [classes, setClasses] = useState(teacher.assignedClasses.join(', '));
  const updateMutation = useUpdateTeacher();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const assignedClasses = classes
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    try {
      await updateMutation.mutateAsync({
        id: teacher.id,
        data: { name, phone: phone || undefined, assignedClasses },
      });
      onUpdated();
      onClose();
    } catch (err) {
      onError(getApiError(err));
    }
  };

  return (
    <Modal title="Edit Teacher" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
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
            value={teacher.user.email}
            disabled
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-400 cursor-not-allowed"
          />
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
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Assigned Classes (comma-separated)
          </label>
          <input
            value={classes}
            onChange={(e) => setClasses(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Credential Modal ────────────────────────────────────────────────────────

function CredentialModal({
  name,
  email,
  tempPassword,
  onClose,
}: {
  name: string;
  email: string;
  tempPassword: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(`Email: ${email}\nPassword: ${tempPassword}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal title="Teacher Credentials" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-4">
        Share these credentials with <span className="font-semibold text-slate-800">{name}</span>.
        The password is shown once and not stored in plaintext.
      </p>
      <div className="bg-slate-50 rounded-lg p-4 space-y-2 font-mono text-sm mb-4">
        <div>
          <span className="text-slate-500 text-xs">Email</span>
          <p className="text-slate-800 font-medium">{email}</p>
        </div>
        <div>
          <span className="text-slate-500 text-xs">Temporary Password</span>
          <p className="text-slate-800 font-medium">{tempPassword}</p>
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <button
          onClick={copy}
          className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

// ─── Delete Confirm ──────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  teacher,
  onConfirm,
  onCancel,
  loading,
}: {
  teacher: Teacher;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <Modal title="Delete Teacher" onClose={onCancel}>
      <p className="text-sm text-slate-600 mb-6">
        Are you sure you want to delete{' '}
        <span className="font-semibold text-slate-800">{teacher.user.name}</span>? This action
        cannot be undone.
      </p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
        >
          {loading ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TeachersPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [deletingTeacher, setDeletingTeacher] = useState<Teacher | null>(null);
  const [credential, setCredential] = useState<{
    name: string;
    email: string;
    tempPassword: string;
  } | null>(null);
  const [search, setSearch] = useState('');

  const { toast, show: showToast, hide: hideToast } = useToast();
  const { data: teachers = [], isLoading } = useTeachers();
  const deleteMutation = useDeleteTeacher();

  const filtered = teachers.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.user.name.toLowerCase().includes(q) ||
      t.user.email.toLowerCase().includes(q) ||
      t.assignedClasses.some((c) => c.toLowerCase().includes(q))
    );
  });

  const handleDelete = async () => {
    if (!deletingTeacher) return;
    try {
      await deleteMutation.mutateAsync(deletingTeacher.id);
      showToast('Teacher deleted');
      setDeletingTeacher(null);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Teachers</h1>
          <p className="text-sm text-slate-500 mt-0.5">{teachers.length} total teachers</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
        >
          + Add Teacher
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search name, email, class…"
          className="w-full sm:w-80 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden md:table-cell">Email</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden lg:table-cell">Phone</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Classes</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden xl:table-cell">Last Login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <SkeletonRows rows={4} cols={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-slate-500">
                    <p className="text-base font-medium">
                      {teachers.length === 0 ? 'No teachers yet' : 'No teachers match your search'}
                    </p>
                    {teachers.length === 0 && (
                      <p className="text-sm mt-1">
                        <button
                          onClick={() => setShowCreate(true)}
                          className="text-blue-600 hover:underline"
                        >
                          Add your first teacher
                        </button>
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{t.user.name}</td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{t.user.email}</td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{t.user.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      {t.assignedClasses.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {t.assignedClasses.map((c) => (
                            <span
                              key={c}
                              className="inline-flex px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">No classes</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden xl:table-cell">
                      {t.user.lastLoginAt ? toIST(t.user.lastLoginAt, 'dd MMM yyyy') : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu
                        items={[
                          {
                            label: 'Edit',
                            onClick: () => setEditingTeacher(t),
                          },
                          {
                            label: 'Delete',
                            onClick: () => setDeletingTeacher(t),
                            variant: 'danger',
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateTeacherModal
          onClose={() => setShowCreate(false)}
          onCreated={(result) => {
            if (
              result.onboardingMethod === 'manual_temp_password' &&
              result.tempPassword
            ) {
              setCredential({
                name: result.name,
                email: result.email,
                tempPassword: result.tempPassword,
              });
              showToast('Teacher added successfully');
              return;
            }

            showToast(`Teacher added. Invite sent to ${result.email}`);
          }}
          onError={(message) => showToast(message, 'error')}
        />
      )}

      {editingTeacher && (
        <EditTeacherModal
          teacher={editingTeacher}
          onError={(message) => showToast(message, 'error')}
          onUpdated={() => showToast('Teacher updated')}
          onClose={() => {
            setEditingTeacher(null);
          }}
        />
      )}

      {credential && (
        <CredentialModal
          name={credential.name}
          email={credential.email}
          tempPassword={credential.tempPassword}
          onClose={() => setCredential(null)}
        />
      )}

      {deletingTeacher && (
        <DeleteConfirmDialog
          teacher={deletingTeacher}
          onConfirm={handleDelete}
          onCancel={() => setDeletingTeacher(null)}
          loading={deleteMutation.isPending}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
