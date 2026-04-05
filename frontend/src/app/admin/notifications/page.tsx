'use client';

import { useState } from 'react';
import {
  useAdminNotifications,
  useCreateNotification,
  useDeleteNotification,
  useDismissAllAdminNotifications,
} from '@/hooks/use-notifications';
import type { AdminNotification } from '@/hooks/use-notifications';
import { Modal } from '@/components/ui/Modal';
import { Toast, useToast } from '@/components/ui/Toast';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { getApiError } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  general: 'General',
  payment_reminder: 'Payment Reminder',
  assessment_reminder: 'Assessment Reminder',
};

const TYPE_BADGE: Record<string, string> = {
  general: 'bg-slate-100 text-slate-600',
  payment_reminder: 'bg-amber-100 text-amber-700',
  assessment_reminder: 'bg-blue-100 text-blue-700',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateNotificationModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'general' | 'payment_reminder' | 'assessment_reminder'>('general');
  const [target, setTarget] = useState<'all' | 'specific'>('all');
  const mutation = useCreateNotification();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      onError('Title and message are required');
      return;
    }
    try {
      const result = await mutation.mutateAsync({ title, message, type, target });
      onSuccess(`Notification sent to ${result.sentTo} student(s)`);
      onClose();
    } catch (err) {
      onError(getApiError(err));
    }
  };

  return (
    <Modal title="Send Notification" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Title <span className="text-slate-400 text-xs">({title.length}/100)</span>
          </label>
          <input
            type="text"
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Holiday Notice"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Message <span className="text-slate-400 text-xs">({message.length}/500)</span>
          </label>
          <textarea
            rows={4}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your message here…"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="general">General</option>
            <option value="payment_reminder">Payment Reminder</option>
            <option value="assessment_reminder">Assessment Reminder</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Send To</label>
          <div className="flex gap-4">
            {(['all', 'specific'] as const).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="target"
                  checked={target === opt}
                  onChange={() => setTarget(opt)}
                />
                <span className="text-sm">
                  {opt === 'all' ? 'All students' : 'Specific students (coming soon)'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
          >
            {mutation.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({
  notification,
  onClose,
  onConfirm,
  loading,
}: {
  notification: AdminNotification;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Modal title="Delete Notification" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-2">
        Are you sure you want to delete this notification? It will be removed from all students immediately.
      </p>
      <p className="text-sm font-medium text-slate-800 mb-6">"{notification.title}"</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 font-medium"
        >
          {loading ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminNotificationsPage() {
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminNotification | null>(null);

  const { toast, show: showToast, hide: hideToast } = useToast();
  const { data, isLoading } = useAdminNotifications(page);
  const deleteMutation = useDeleteNotification();
  const dismissAllMutation = useDismissAllAdminNotifications();

  const notifications = data?.data ?? [];
  const meta = data?.meta;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      showToast('Notification deleted');
      setDeleteTarget(null);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const handleDismissAll = async () => {
    try {
      const result = await dismissAllMutation.mutateAsync();
      showToast(`${result.deleted} notification${result.deleted !== 1 ? 's' : ''} dismissed`);
      setPage(1);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Notifications</h1>
          {meta && (
            <p className="text-sm text-slate-500 mt-0.5">{meta.total} sent</p>
          )}
        </div>
        <div className="flex gap-2">
          {notifications.length > 0 && (
            <button
              onClick={handleDismissAll}
              disabled={dismissAllMutation.isPending}
              className="px-4 py-2 text-sm border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 font-medium disabled:opacity-60"
            >
              {dismissAllMutation.isPending ? 'Dismissing…' : 'Dismiss All'}
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            + Send Notification
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <tbody><SkeletonRows rows={6} cols={5} /></tbody>
          </table>
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
          <p className="text-4xl mb-4">🔔</p>
          <p className="text-slate-500 text-sm">No notifications sent yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            Send your first notification
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-medium text-slate-800 text-sm">{n.title}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[n.type]}`}
                  >
                    {TYPE_LABELS[n.type]}
                  </span>
                </div>
                <p className="text-sm text-slate-500 line-clamp-2">{n.message}</p>
                <p className="text-xs text-slate-400 mt-1.5">
                  Sent to {n._count.studentNotifications} student(s) · {formatDate(n.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget(n)}
                className="text-xs text-red-500 hover:underline flex-shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total > meta.pageSize && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
          <span>Page {meta.page} of {Math.ceil(meta.total / meta.pageSize)}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
            >
              Previous
            </button>
            <button
              disabled={page >= Math.ceil(meta.total / meta.pageSize)}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateNotificationModal
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => { showToast(msg); setShowCreate(false); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          notification={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleteMutation.isPending}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
