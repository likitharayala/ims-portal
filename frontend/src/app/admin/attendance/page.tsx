'use client';

import { useState, useEffect } from 'react';
import {
  useAttendanceByDate,
  useAttendanceReport,
  useAttendanceFilterOptions,
  useMarkAttendance,
} from '@/hooks/use-attendance';
import type { AttendanceStatus, StudentAttendanceRow } from '@/hooks/use-attendance';
import { Toast, useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

const STATUS_OPTIONS: AttendanceStatus[] = ['present', 'absent', 'late'];

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: 'bg-green-100 text-green-700 border-green-300',
  absent: 'bg-red-100 text-red-600 border-red-300',
  late: 'bg-amber-100 text-amber-700 border-amber-300',
};

const STATUS_ACTIVE: Record<AttendanceStatus, string> = {
  present: 'bg-green-500 text-white',
  absent: 'bg-red-500 text-white',
  late: 'bg-amber-500 text-white',
};

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function currentMonth() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function AdminAttendancePage() {
  const [tab, setTab] = useState<'mark' | 'report'>('mark');
  const [date, setDate] = useState(todayISO());
  const [classFilter, setClassFilter] = useState('');
  const { month: curMonth, year: curYear } = currentMonth();
  const [reportMonth, setReportMonth] = useState(curMonth);
  const [reportYear, setReportYear] = useState(curYear);
  const [reportClass, setReportClass] = useState('');
  const [exporting, setExporting] = useState(false);

  // Local attendance state for mark tab
  const [localAttendance, setLocalAttendance] = useState<
    Record<string, AttendanceStatus>
  >({});

  const { toast, show: showToast, hide: hideToast } = useToast();
  const { data: filterOptions } = useAttendanceFilterOptions();
  const { data: students = [], isLoading: studentsLoading } = useAttendanceByDate(
    date,
    classFilter || undefined,
  );
  const { data: report, isLoading: reportLoading } = useAttendanceReport(
    reportMonth,
    reportYear,
    reportClass || undefined,
  );
  const markMutation = useMarkAttendance();

  // Sync server attendance to local state when students load.
  // Uses functional setState returning prev when content is unchanged —
  // prevents re-render loops caused by new array references on refetch.
  useEffect(() => {
    setLocalAttendance((prev) => {
      const next: Record<string, AttendanceStatus> = {};
      for (const s of students) {
        next[s.studentId] = s.attendance?.status ?? 'present';
      }
      // Bail out if nothing changed (avoids triggering a re-render)
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && nextKeys.every((k) => prev[k] === next[k])) {
        return prev;
      }
      return next;
    });
  }, [students]);

  const markAll = (status: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = {};
    for (const s of students) next[s.studentId] = status;
    setLocalAttendance(next);
  };

  const handleSave = async () => {
    if (students.length === 0) return;
    try {
      const entries = students.map((s) => ({
        studentId: s.studentId,
        status: localAttendance[s.studentId] ?? 'present',
      }));
      const result = await markMutation.mutateAsync({ date, entries });
      showToast(`Attendance saved for ${result.marked} student(s)`);
    } catch {
      showToast('Failed to save attendance', 'error');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        month: String(reportMonth),
        year: String(reportYear),
      });
      if (reportClass) params.set('class', reportClass);
      const res = await api.get(`/admin/attendance/export?${params}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${MONTHS[reportMonth]}-${reportYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Attendance</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {([
          { key: 'mark', label: 'Mark Attendance' },
          { key: 'report', label: 'Monthly Report' },
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

      {/* Mark Attendance Tab */}
      {tab === 'mark' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Classes</option>
              {filterOptions?.classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="flex gap-2 ml-auto">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => markAll(s)}
                  className={`px-3 py-2 text-xs rounded-lg border font-medium capitalize ${STATUS_STYLE[s]}`}
                >
                  All {s}
                </button>
              ))}
            </div>
          </div>

          {/* Student list */}
          {studentsLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm animate-pulse">
              Loading students…
            </div>
          ) : students.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
              <p className="text-4xl mb-4">📋</p>
              <p className="text-slate-500 text-sm">No students found for this date and filter.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Student</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden sm:table-cell">Class</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map((s) => {
                      const current = localAttendance[s.studentId] ?? 'present';
                      return (
                        <tr key={s.studentId} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{s.name}</p>
                            {s.rollNumber && (
                              <p className="text-xs text-slate-400">#{s.rollNumber}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{s.class}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              {STATUS_OPTIONS.map((opt) => (
                                <button
                                  key={opt}
                                  onClick={() =>
                                    setLocalAttendance((p) => ({ ...p, [s.studentId]: opt }))
                                  }
                                  className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize border transition-colors ${
                                    current === opt
                                      ? STATUS_ACTIVE[opt]
                                      : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={markMutation.isPending}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
                >
                  {markMutation.isPending ? 'Saving…' : 'Save Attendance'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Monthly Report Tab */}
      {tab === 'report' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={reportMonth}
              onChange={(e) => setReportMonth(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {MONTHS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={reportYear}
              onChange={(e) => setReportYear(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {Array.from({ length: 5 }, (_, i) => curYear - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={reportClass}
              onChange={(e) => setReportClass(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Classes</option>
              {filterOptions?.classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="ml-auto px-3 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-60"
            >
              {exporting ? 'Exporting…' : 'Export ↓'}
            </button>
          </div>

          {reportLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm animate-pulse">
              Loading report…
            </div>
          ) : !report ? null : report.students.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
              <p className="text-slate-500 text-sm">No attendance data for {report.monthName} {report.year}.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-4 mb-4 text-sm text-slate-600">
                <span>{report.monthName} {report.year}</span>
                <span>·</span>
                <span>{report.totalDays} school day{report.totalDays !== 1 ? 's' : ''} recorded</span>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Student</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden sm:table-cell">Class</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-green-600 uppercase">Present</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-amber-600 uppercase">Late</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-red-500 uppercase">Absent</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.students.map((s) => (
                      <tr key={s.studentId} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{s.name}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{s.class}</td>
                        <td className="px-4 py-3 text-center text-green-700 font-medium">{s.present}</td>
                        <td className="px-4 py-3 text-center text-amber-600 font-medium">{s.late}</td>
                        <td className="px-4 py-3 text-center text-red-500 font-medium">{s.absent}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-xs font-semibold ${
                              s.percentage >= 75
                                ? 'text-green-600'
                                : s.percentage >= 50
                                ? 'text-amber-600'
                                : 'text-red-500'
                            }`}
                          >
                            {s.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
