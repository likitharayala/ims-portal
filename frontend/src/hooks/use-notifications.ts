import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: 'general' | 'payment_reminder' | 'assessment_reminder';
  createdBy: string;
  createdAt: string;
  _count: { studentNotifications: number };
}

export interface StudentNotification {
  id: string;           // studentNotification id (for dismiss/read)
  notificationId: string;
  title: string;
  message: string;
  type: 'general' | 'payment_reminder' | 'assessment_reminder';
  notificationCreatedAt: string;
  isRead: boolean;
  isDismissed: boolean;
  readAt: string | null;
  createdAt: string;
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export function useAdminNotifications(page = 1) {
  return useQuery({
    queryKey: ['admin-notifications', page],
    queryFn: async () => {
      const res = await api.get<{
        success: true;
        data: AdminNotification[];
        meta: { total: number; page: number; pageSize: number };
      }>(`/admin/notifications?page=${page}`);
      return res.data;
    },
  });
}

export function useCreateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      message: string;
      type?: 'general' | 'payment_reminder' | 'assessment_reminder';
      target: 'all' | 'specific';
      studentIds?: string[];
    }) => {
      const res = await api.post<{
        success: true;
        data: { notification: AdminNotification; sentTo: number };
      }>('/admin/notifications', data);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/notifications/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });
}

export function useDismissAllAdminNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.delete<{ success: true; data: { deleted: number } }>(
        '/admin/notifications',
      );
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });
}

// ─── Student ────────────────────────────────────────────────────────────────

export function useStudentNotifications() {
  return useQuery({
    queryKey: ['student-notifications'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: StudentNotification[] }>(
        '/student/notifications',
      );
      return res.data.data;
    },
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['student-notifications-unread'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: number }>(
        '/student/notifications/unread-count',
      );
      return res.data.data;
    },
    refetchInterval: 30_000, // poll every 30s for badge update
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/student/notifications/${id}/read`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-notifications'] });
      qc.invalidateQueries({ queryKey: ['student-notifications-unread'] });
    },
  });
}

export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/student/notifications/${id}/dismiss`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-notifications'] });
      qc.invalidateQueries({ queryKey: ['student-notifications-unread'] });
    },
  });
}

export function useDismissAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ success: true; data: { dismissed: number } }>(
        '/student/notifications/dismiss-all',
      );
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-notifications'] });
      qc.invalidateQueries({ queryKey: ['student-notifications-unread'] });
    },
  });
}
