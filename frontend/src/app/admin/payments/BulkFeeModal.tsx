'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useBulkFeeUpdate, usePaymentFilterOptions } from '@/hooks/use-payments';
import { getApiError } from '@/lib/utils';

interface Props {
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function BulkFeeModal({ onClose, onSuccess, onError }: Props) {
  const [selectedClass, setSelectedClass] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const mutation = useBulkFeeUpdate();
  const { data: filterOptions } = usePaymentFilterOptions();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) { onError('Select a class'); return; }
    if (!feeAmount || Number(feeAmount) < 0) { onError('Enter a valid fee amount'); return; }
    try {
      const result = await mutation.mutateAsync({
        class: selectedClass,
        feeAmount: Number(feeAmount),
      });
      onSuccess(`Fee updated for ${result.updated} student(s) in ${selectedClass}. Applies from next month.`);
      onClose();
    } catch (err) {
      onError(getApiError(err));
    }
  };

  return (
    <Modal title="Bulk Fee Update" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          ⚠ This change applies from <strong>next month</strong>. Past payment records are unaffected.
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Select class…</option>
            {filterOptions?.classes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">New Fee Amount (₹)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={feeAmount}
            onChange={(e) => setFeeAmount(e.target.value)}
            placeholder="e.g. 5000"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            {mutation.isPending ? 'Updating…' : 'Update Fee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
