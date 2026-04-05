'use client';

import {
  useStudentNotifications,
  useDismissNotification,
  useDismissAll,
  useMarkRead,
} from '@/hooks/use-notifications';
import type { StudentNotification } from '@/hooks/use-notifications';
import { Toast, useToast } from '@/components/ui/Toast';

const TYPE_BADGE: Record<string, string> = {
  general: 'bg-slate-100 text-slate-600',
  payment_reminder: 'bg-amber-100 text-amber-700',
  assessment_reminder: 'bg-blue-100 text-blue-700',
};

const TYPE_LABELS: Record<string, string> = {
  general: 'General',
  payment_reminder: 'Payment',
  assessment_reminder: 'Assessment',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function NotificationItem({
  n,
  onDismiss,
  onRead,
}: {
  n: StudentNotification;
  onDismiss: (id: string) => void;
  onRead: (id: string) => void;
}) {
  return (
    <div
      className={`bg-white rounded-xl border p-4 flex items-start gap-3 transition-colors ${
        n.isRead ? 'border-slate-200' : 'border-blue-200 bg-blue-50/30'
      }`}
      onClick={() => { if (!n.isRead) onRead(n.id); }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {!n.isRead && (
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          )}
          <p className="font-medium text-slate-800 text-sm">{n.title}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[n.type]}`}>
            {TYPE_LABELS[n.type]}
          </span>
        </div>
        <p className="text-sm text-slate-600">{n.message}</p>
        <p className="text-xs text-slate-400 mt-1.5">{formatDate(n.createdAt)}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
        className="text-xs text-slate-400 hover:text-red-500 flex-shrink-0 mt-0.5"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export default function StudentNotificationsPage() {
  const { data: notifications = [], isLoading } = useStudentNotifications();
  const dismissMutation = useDismissNotification();
  const dismissAllMutation = useDismissAll();
  const readMutation = useMarkRead();
  const { toast, show: showToast, hide: hideToast } = useToast();

  const handleDismiss = async (id: string) => {
    try {
      await dismissMutation.mutateAsync(id);
    } catch {
      showToast('Failed to dismiss', 'error');
    }
  };

  const handleRead = async (id: string) => {
    try {
      await readMutation.mutateAsync(id);
    } catch {}
  };

  const handleDismissAll = async () => {
    try {
      const result = await dismissAllMutation.mutateAsync();
      showToast(`Dismissed ${result.dismissed} notification(s)`);
    } catch {
      showToast('Failed to dismiss all', 'error');
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-blue-600 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        {notifications.length > 0 && (
          <button
            onClick={handleDismissAll}
            disabled={dismissAllMutation.isPending}
            className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-60"
          >
            Dismiss all
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
          <p className="text-4xl mb-4">🔔</p>
          <p className="text-slate-500 text-sm">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              n={n}
              onDismiss={handleDismiss}
              onRead={handleRead}
            />
          ))}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
