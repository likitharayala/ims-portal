import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Payment {
  id: string;
  month: number;
  year: number;
  amount: string; // Prisma Decimal → string in JSON
  status: 'pending' | 'paid' | 'overdue';
  paidAt: string | null;
  notes: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    class: string;
    isDeleted: boolean;
    user: { name: string };
  };
}

export interface PaymentMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface PaymentQuery {
  page?: number;
  month?: number;
  year?: number;
  class?: string;
  status?: string;
}

export interface FilterOptions {
  monthYears: { month: number; year: number }[];
  classes: string[];
}

// ─── Query Hooks ──────────────────────────────────────────────────────────────

export function usePayments(query: PaymentQuery) {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.month) params.set('month', String(query.month));
  if (query.year) params.set('year', String(query.year));
  if (query.class) params.set('class', query.class);
  if (query.status) params.set('status', query.status);

  return useQuery({
    queryKey: ['admin-payments', query],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Payment[]; meta: PaymentMeta }>(
        `/admin/payments?${params}`,
      );
      return res.data;
    },
  });
}

export function useOverduePayments(query: { page?: number }) {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));

  return useQuery({
    queryKey: ['admin-payments-overdue', query],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Payment[]; meta: PaymentMeta }>(
        `/admin/payments/overdue?${params}`,
      );
      return res.data;
    },
  });
}

export function usePaymentFilterOptions() {
  return useQuery({
    queryKey: ['payment-filter-options'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: FilterOptions }>(
        '/admin/payments/filter-options',
      );
      return res.data.data;
    },
  });
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

export function useUpdatePaymentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: 'pending' | 'paid' | 'overdue';
      notes?: string;
    }) => {
      const res = await api.patch<{ success: true; data: Payment }>(
        `/admin/payments/${id}/status`,
        { status, notes },
      );
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-payments'] });
      qc.invalidateQueries({ queryKey: ['admin-payments-overdue'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
    },
  });
}

export function useBulkFeeUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { class: string; feeAmount: number }) => {
      const res = await api.post<{ success: true; data: { updated: number } }>(
        '/admin/payments/bulk-fee-update',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export function useSendReminder() {
  return useMutation({
    mutationFn: async (data: {
      target: 'all' | 'pending_overdue' | 'specific';
      studentIds?: string[];
      title: string;
      message: string;
    }) => {
      const res = await api.post<{
        success: true;
        data: { notificationId: string | null; sentTo: number };
      }>('/admin/payments/send-reminder', data);
      return res.data.data;
    },
  });
}
