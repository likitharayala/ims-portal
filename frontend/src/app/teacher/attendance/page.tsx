'use client';

import { useState, useEffect } from 'react';
import {
  useTeacherAttendanceByDate,
  useMarkTeacherAttendance,
} from '@/hooks/use-attendance';
import type { AttendanceStatus, StudentAttendanceRow } from '@/hooks/use-attendance';
import { useTeacherProfile } from '@/hooks/use-teachers';
import { Toast, useToast } from '@/components/ui/Toast';

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

export default function TeacherAttendancePage() {
  const [date, setDate] = useState(todayISO());
  const [classFilter, setClassFilter] = useState('');
  const [localAttendance, setLocalAttendance] = useState<Record<string, AttendanceStatus>>({});
  const { toast, show: showToast, hide: hideToast } = useToast();

  const { data: profile } = useTeacherProfile();
  const assignedClasses = profile?.assignedClasses ?? [];

  const { data: students = [], isLoading } = useTeacherAttendanceByDate(
    date,
    classFilter || undefined,
  );
  const markMutation = useMarkTeacherAttendance();

  useEffect(() => {
    const init: Record<string, AttendanceStatus> = {};
    for (const s of students) {
      init[s.studentId] = s.attendance?.status ?? 'present';
    }
    setLocalAttendance(init);
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Attendance</h1>
        {assignedClasses.length > 0 && (
          <p className="text-sm text-slate-500 mt-0.5">
            Your classes: {assignedClasses.join(', ')}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        {assignedClasses.length > 1 && (
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
          >
            <option value="">All My Classes</option>
            {assignedClasses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
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
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm animate-pulse">
          Loading students…
        </div>
      ) : students.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
          <p className="text-4xl mb-4">📋</p>
          <p className="text-slate-500 text-sm">
            {assignedClasses.length === 0
              ? 'No classes assigned. Contact your admin.'
              : 'No students found for this date and filter.'}
          </p>
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
                {students.map((s: StudentAttendanceRow) => {
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
              className="px-5 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60 font-medium"
            >
              {markMutation.isPending ? 'Saving…' : 'Save Attendance'}
            </button>
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
