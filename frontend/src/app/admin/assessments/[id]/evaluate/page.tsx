'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  useAdminAssessment,
  useSubmissions,
  useReleaseAllResults,
  useAssessmentStats,
  useExtraTimeList,
  useGrantExtraTime,
  useRemoveExtraTime,
} from '@/hooks/use-assessments';
import type { Submission } from '@/hooks/use-assessments';
import { Toast, useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { getApiError } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  in_progress: 'bg-yellow-100 text-yellow-700',
  submitted: 'bg-blue-100 text-blue-700',
  evaluated: 'bg-green-100 text-green-700',
  absent: 'bg-slate-100 text-slate-500',
};

interface ExtraTimeModal {
  studentId: string;
  studentName: string;
  current?: { extraMinutes: number; reason: string | null };
}

export default function EvaluateAssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const { toast, show: showToast, hide: hideToast } = useToast();

  const { data: assessment } = useAdminAssessment(id);
  const { data: submissions, isLoading } = useSubmissions(id);
  const { data: stats } = useAssessmentStats(id);
  const { data: extraTimes } = useExtraTimeList(id);
  const releaseAllMutation = useReleaseAllResults();
  const grantMutation = useGrantExtraTime();
  const removeMutation = useRemoveExtraTime();

  const [etModal, setEtModal] = useState<ExtraTimeModal | null>(null);
  const [etMinutes, setEtMinutes] = useState('');
  const [etReason, setEtReason] = useState('');

  // Build a lookup: studentId → extraTime record
  const extraTimeMap = new Map(
    (extraTimes ?? []).map((et) => [et.studentId, et]),
  );
  const visibleSubmissions = (submissions ?? []).filter(
    (submission) => !submission.studentIsDeleted,
  );

  const handleReleaseAll = async () => {
    try {
      await releaseAllMutation.mutateAsync(id);
      showToast('Results released to all students');
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const openExtraTimeModal = (s: Submission) => {
    const existing = extraTimeMap.get(s.studentId);
    setEtMinutes(existing ? String(existing.extraMinutes) : '');
    setEtReason(existing?.reason ?? '');
    setEtModal({
      studentId: s.studentId,
      studentName: s.studentName,
      current: existing
        ? { extraMinutes: existing.extraMinutes, reason: existing.reason }
        : undefined,
    });
  };

  const handleSaveExtraTime = async () => {
    if (!etModal) return;
    const mins = Number(etMinutes);
    if (isNaN(mins) || mins < 1) {
      showToast('Extra time must be at least 1 minute', 'error');
      return;
    }
    try {
      const result = await grantMutation.mutateAsync({
        assessmentId: id,
        studentId: etModal.studentId,
        extraMinutes: mins,
        reason: etReason.trim() || undefined,
      });
      if (result?.submissionReopened) {
        showToast(`Extra time granted — exam reopened for ${etModal.studentName}`);
      } else {
        showToast(
          `Extra time ${etModal.current ? 'updated' : 'granted'} — ${mins} min${mins !== 1 ? 's' : ''}`,
        );
      }
      setEtModal(null);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  const handleRemoveExtraTime = async () => {
    if (!etModal) return;
    try {
      await removeMutation.mutateAsync({
        assessmentId: id,
        studentId: etModal.studentId,
      });
      showToast('Extra time removed');
      setEtModal(null);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/admin/assessments/${id}`}
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          ← {assessment?.title ?? 'Assessment'}
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold text-slate-800">Evaluate Submissions</h1>
        <button
          onClick={handleReleaseAll}
          disabled={releaseAllMutation.isPending}
          className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-medium"
        >
          {releaseAllMutation.isPending ? 'Releasing…' : 'Release All Results'}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Submitted', value: stats.submitted },
            { label: 'Evaluated', value: stats.evaluated },
            { label: 'Absent', value: stats.absent },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white border border-slate-200 rounded-xl p-4 text-center"
            >
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {stats && (stats.highest !== null || stats.average !== null) && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Highest', value: stats.highest },
            { label: 'Average', value: stats.average },
            { label: 'Lowest', value: stats.lowest },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white border border-slate-200 rounded-xl p-4 text-center"
            >
              <p className="text-xl font-bold text-slate-800">
                {s.value ?? '—'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Submissions list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse h-14 bg-slate-100 rounded-xl" />
          ))}
        </div>
      ) : visibleSubmissions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-12 text-center">
          <p className="text-slate-500 text-sm">No submissions yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                  Student
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden sm:table-cell">
                  Class
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">
                  Marks
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden md:table-cell">
                  Extra Time
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden sm:table-cell">
                  Released
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleSubmissions.map((s) => {
                const et = extraTimeMap.get(s.studentId);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{s.studentName}</p>
                      <p className="text-xs text-slate-400">{s.studentEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                      {s.studentClass}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s.status]}`}
                      >
                        {s.status === 'in_progress'
                          ? 'In Progress'
                          : s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        {s.autoSubmitted && ' (auto)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {s.totalMarks !== null && s.totalMarks !== undefined
                        ? Number(s.totalMarks)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {s.studentIsDeleted ? (
                        <span className="text-xs text-slate-300">—</span>
                      ) : et ? (
                        <button
                          onClick={() => openExtraTimeModal(s)}
                          className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100"
                          title={et.reason ?? undefined}
                        >
                          +{et.extraMinutes} min
                        </button>
                      ) : (
                        <button
                          onClick={() => openExtraTimeModal(s)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium transition-colors"
                        >
                          Grant Time
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      {s.resultReleased ? (
                        <span className="text-green-600 text-xs">Released</span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.status !== 'absent' && (
                        <Link
                          href={`/admin/assessments/${id}/evaluate/${s.id}`}
                          className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 font-medium transition-colors inline-block"
                        >
                          Evaluate
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Grant Extra Time modal */}
      {etModal && (
        <Modal
          title="Grant Extra Time"
          onClose={() => setEtModal(null)}
        >
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              Extra time extends this student's effective exam end time. Other students are unaffected.
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Student</label>
              <p className="text-sm text-slate-800 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                {etModal.studentName}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Extra Time (minutes) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={etMinutes}
                onChange={(e) => setEtMinutes(e.target.value)}
                placeholder="e.g. 15"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={etReason}
                onChange={(e) => setEtReason(e.target.value)}
                placeholder="e.g. Technical issue, late start"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-between mt-5">
            <div>
              {etModal.current && (
                <button
                  onClick={handleRemoveExtraTime}
                  disabled={removeMutation.isPending}
                  className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-60"
                >
                  {removeMutation.isPending ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEtModal(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveExtraTime}
                disabled={grantMutation.isPending}
                className="px-5 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-60 font-medium"
              >
                {grantMutation.isPending
                  ? 'Saving…'
                  : etModal.current
                  ? 'Update'
                  : 'Grant'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
