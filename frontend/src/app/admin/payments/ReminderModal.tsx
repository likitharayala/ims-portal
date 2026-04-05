'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useSendReminder } from '@/hooks/use-payments';
import { getApiError } from '@/lib/utils';

interface Props {
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const DEFAULT_TITLE = 'Payment Reminder';
const DEFAULT_MESSAGE =
  'Your payment for this month is due. Please clear your dues at the earliest to avoid overdue charges.';

export function ReminderModal({ onClose, onSuccess, onError }: Props) {
  const [target, setTarget] = useState<'all' | 'pending_overdue' | 'specific'>('pending_overdue');
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const mutation = useSendReminder();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) { onError('Title and message are required'); return; }
    try {
      const result = await mutation.mutateAsync({ target, title, message });
      onSuccess(`Reminder sent to ${result.sentTo} student(s)`);
      onClose();
    } catch (err) {
      onError(getApiError(err));
    }
  };

  return (
    <Modal title="Send Payment Reminder" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Send To</label>
          <div className="space-y-2">
            {([
              { value: 'all', label: 'All students' },
              { value: 'pending_overdue', label: 'Students with pending or overdue payments' },
            ] as const).map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="target"
                  checked={target === opt.value}
                  onChange={() => setTarget(opt.value)}
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Title <span className="text-slate-400 text-xs">({title.length}/100)</span>
          </label>
          <input
            type="text"
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
            {mutation.isPending ? 'Sending…' : 'Send Reminder'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
