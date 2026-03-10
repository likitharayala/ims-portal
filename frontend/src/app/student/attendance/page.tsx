'use client';

import { useState } from 'react';
import { useMyAttendance } from '@/hooks/use-attendance';
import type { AttendanceStatus } from '@/hooks/use-attendance';

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-500',
  late: 'bg-amber-100 text-amber-700',
};

const STATUS_DOT: Record<AttendanceStatus, string> = {
  present: 'bg-green-500',
  absent: 'bg-red-500',
  late: 'bg-amber-500',
};

function currentMonth() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function firstDayOfMonth(month: number, year: number) {
  return new Date(year, month - 1, 1).getDay(); // 0=Sun
}

export default function StudentAttendancePage() {
  const { month: curMonth, year: curYear } = currentMonth();
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);

  const { data, isLoading } = useMyAttendance(month, year);

  // Build a map of date string → status for calendar rendering
  const recordMap: Record<string, AttendanceStatus> = {};
  if (data) {
    for (const r of data.records) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      recordMap[key] = r.status;
    }
  }

  const totalDays = daysInMonth(month, year);
  const firstDay = firstDayOfMonth(month, year);

  const goBack = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const goForward = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
    // Don't go past current month
  };
  const canGoForward = year < curYear || (year === curYear && month < curMonth);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">My Attendance</h1>

      {/* Month navigation */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={goBack}
          className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600"
        >
          ←
        </button>
        <span className="text-slate-800 font-medium text-sm w-36 text-center">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600 disabled:opacity-40"
        >
          →
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 animate-pulse text-center text-slate-400 text-sm">
          Loading…
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {([
                { label: 'Present', value: data.present, color: 'text-green-600' },
                { label: 'Late', value: data.late, color: 'text-amber-600' },
                { label: 'Absent', value: data.absent, color: 'text-red-500' },
                { label: 'Attendance', value: `${data.percentage}%`, color: data.percentage >= 75 ? 'text-green-600' : data.percentage >= 50 ? 'text-amber-600' : 'text-red-500' },
              ]).map((card) => (
                <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{card.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Calendar grid */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            {/* Day labels */}
            <div className="grid grid-cols-7 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-center text-xs text-slate-400 font-medium py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for first day offset */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {Array.from({ length: totalDays }, (_, i) => {
                const day = i + 1;
                const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const status = recordMap[dateKey];
                const isToday =
                  day === new Date().getDate() &&
                  month === curMonth &&
                  year === curYear;

                return (
                  <div
                    key={day}
                    className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                      status
                        ? STATUS_STYLE[status]
                        : isToday
                        ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-400'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{day}</span>
                    {status && (
                      <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${STATUS_DOT[status]}`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-4 pt-3 border-t border-slate-100 justify-center">
              {(['present', 'late', 'absent'] as AttendanceStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[s]}`} />
                  <span className="text-xs text-slate-500 capitalize">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
