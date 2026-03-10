'use client';

import { useState } from 'react';
import {
  usePayments,
  useOverduePayments,
  usePaymentFilterOptions,
} from '@/hooks/use-payments';
import type { Payment } from '@/hooks/use-payments';
import { StatusUpdateModal } from './StatusUpdateModal';
import { BulkFeeModal } from './BulkFeeModal';
import { ReminderModal } from './ReminderModal';
import { Toast, useToast } from '@/components/ui/Toast';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { api } from '@/lib/api';

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-600',
};

function formatINR(val: string | number) {
  return `₹${Number(val).toLocaleString('en-IN')}`;
}

function PaymentTable({
  payments,
  onUpdate,
}: {
  payments: Payment[];
  onUpdate: (p: Payment) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Student</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden sm:table-cell">Class</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Month</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Amount</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {payments.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">
                  {p.student.user.name}
                  {p.student.isDeleted && (
                    <span className="ml-1 text-xs text-slate-400">(deleted)</span>
                  )}
                </p>
              </td>
              <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{p.student.class}</td>
              <td className="px-4 py-3 text-slate-600">
                {MONTHS[p.month]} {p.year}
              </td>
              <td className="px-4 py-3 text-right font-medium text-slate-800">
                {formatINR(p.amount)}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_BADGE[p.status]}`}>
                  {p.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onUpdate(p)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors"
                >
                  Update
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const [tab, setTab] = useState<'all' | 'overdue'>('all');
  const [page, setPage] = useState(1);
  const [overduePage, setOverduePage] = useState(1);
  const [monthYear, setMonthYear] = useState(''); // "M-YYYY"
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [statusModal, setStatusModal] = useState<Payment | null>(null);
  const [showBulkFee, setShowBulkFee] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { toast, show: showToast, hide: hideToast } = useToast();
  const { data: filterOptions } = usePaymentFilterOptions();

  const parsedMonth = monthYear ? Number(monthYear.split('-')[0]) : undefined;
  const parsedYear = monthYear ? Number(monthYear.split('-')[1]) : undefined;

  const { data: allData, isLoading: allLoading } = usePayments({
    page,
    month: parsedMonth,
    year: parsedYear,
    class: classFilter || undefined,
    status: statusFilter || undefined,
  });

  const { data: overdueData, isLoading: overdueLoading } = useOverduePayments({
    page: overduePage,
  });

  const allPayments = allData?.data ?? [];
  const allMeta = allData?.meta;
  const overduePayments = overdueData?.data ?? [];
  const overdueMeta = overdueData?.meta;

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (parsedMonth) params.set('month', String(parsedMonth));
      if (parsedYear) params.set('year', String(parsedYear));
      if (classFilter) params.set('class', classFilter);
      if (statusFilter) params.set('status', statusFilter);

      const response = await api.get(`/admin/payments/export?${params}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'payments.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Payments</h1>
          {allMeta && tab === 'all' && (
            <p className="text-sm text-slate-500 mt-0.5">{allMeta.total} records</p>
          )}
          {overdueMeta && tab === 'overdue' && (
            <p className="text-sm text-red-500 mt-0.5">{overdueMeta.total} overdue</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowReminder(true)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Send Reminder
          </button>
          <button
            onClick={() => setShowBulkFee(true)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Bulk Fee Update
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-3 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-60"
          >
            {exporting ? 'Exporting…' : 'Export ↓'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {([
          { key: 'all', label: 'All Payments' },
          { key: 'overdue', label: 'Overdue' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters (only for All tab) */}
      {tab === 'all' && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <select
            value={monthYear}
            onChange={(e) => { setMonthYear(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Months</option>
            {filterOptions?.monthYears.map((my) => (
              <option key={`${my.month}-${my.year}`} value={`${my.month}-${my.year}`}>
                {MONTHS[my.month]} {my.year}
              </option>
            ))}
          </select>

          <select
            value={classFilter}
            onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Classes</option>
            {filterOptions?.classes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      )}

      {/* Content */}
      {tab === 'all' ? (
        <>
          {allLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <SkeletonRows rows={8} cols={6} />
                </tbody>
              </table>
            </div>
          ) : allPayments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
              <p className="text-4xl mb-4">💳</p>
              <p className="text-slate-500 text-sm">No payment records found.</p>
            </div>
          ) : (
            <PaymentTable payments={allPayments} onUpdate={setStatusModal} />
          )}

          {allMeta && allMeta.total > allMeta.pageSize && (
            <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
              <span>Page {allMeta.page} of {Math.ceil(allMeta.total / allMeta.pageSize)}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
                >
                  Previous
                </button>
                <button
                  disabled={page >= Math.ceil(allMeta.total / allMeta.pageSize)}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {overdueLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <SkeletonRows rows={8} cols={6} />
                </tbody>
              </table>
            </div>
          ) : overduePayments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
              <p className="text-4xl mb-4">✅</p>
              <p className="text-slate-500 text-sm">No overdue payments.</p>
            </div>
          ) : (
            <PaymentTable payments={overduePayments} onUpdate={setStatusModal} />
          )}

          {overdueMeta && overdueMeta.total > overdueMeta.pageSize && (
            <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
              <span>Page {overdueMeta.page} of {Math.ceil(overdueMeta.total / overdueMeta.pageSize)}</span>
              <div className="flex gap-2">
                <button
                  disabled={overduePage <= 1}
                  onClick={() => setOverduePage(overduePage - 1)}
                  className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
                >
                  Previous
                </button>
                <button
                  disabled={overduePage >= Math.ceil(overdueMeta.total / overdueMeta.pageSize)}
                  onClick={() => setOverduePage(overduePage + 1)}
                  className="px-3 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {statusModal && (
        <StatusUpdateModal
          payment={statusModal}
          onClose={() => setStatusModal(null)}
          onSuccess={(msg) => { showToast(msg); setStatusModal(null); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
      {showBulkFee && (
        <BulkFeeModal
          onClose={() => setShowBulkFee(false)}
          onSuccess={(msg) => { showToast(msg); setShowBulkFee(false); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
      {showReminder && (
        <ReminderModal
          onClose={() => setShowReminder(false)}
          onSuccess={(msg) => { showToast(msg); setShowReminder(false); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
