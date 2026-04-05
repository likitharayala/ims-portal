'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useUpdatePaymentStatus } from '@/hooks/use-payments';
import type { Payment } from '@/hooks/use-payments';
import { getApiError } from '@/lib/utils';

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  payment: Payment;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function StatusUpdateModal({ payment, onClose, onSuccess, onError }: Props) {
  const [status, setStatus] = useState<'pending' | 'paid' | 'overdue'>(payment.status);
  const [notes, setNotes] = useState(payment.notes ?? '');
  const mutation = useUpdatePaymentStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await mutation.mutateAsync({ id: payment.id, status, notes: notes || undefined });
      onSuccess('Payment status updated');
      onClose();
    } catch (err) {
      onError(getApiError(err));
    }
  };

  return (
    <Modal title="Update Payment Status" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
          <p className="font-medium text-slate-800">{payment.student.user.name}</p>
          <p>
            {MONTHS[payment.month]} {payment.year} · ₹{Number(payment.amount).toLocaleString('en-IN')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
          <div className="flex gap-3">
            {(['pending', 'paid', 'overdue'] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={status === s}
                  onChange={() => setStatus(s)}
                />
                <span className="text-sm capitalize">{s}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note…"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
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
            {mutation.isPending ? 'Saving…' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
