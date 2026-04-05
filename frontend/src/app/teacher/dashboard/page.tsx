'use client';

import { useTeacherProfile, useTeacherStudents } from '@/hooks/use-teachers';

export default function TeacherDashboardPage() {
  const { data: profile, isLoading: profileLoading } = useTeacherProfile();
  const { data: students = [], isLoading: studentsLoading } = useTeacherStudents();

  const assignedClasses = profile?.assignedClasses ?? [];
  const uniqueClasses = Array.from(new Set(students.map((s) => s.class))).sort();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">
          {profileLoading ? '…' : `Welcome, ${profile?.user.name ?? 'Teacher'}`}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {assignedClasses.length > 0
            ? `Assigned classes: ${assignedClasses.join(', ')}`
            : 'No classes assigned yet'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Total Students</p>
          {studentsLoading ? (
            <div className="h-8 bg-slate-100 rounded animate-pulse w-16" />
          ) : (
            <p className="text-3xl font-bold text-slate-800">{students.length}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Assigned Classes</p>
          {profileLoading ? (
            <div className="h-8 bg-slate-100 rounded animate-pulse w-16" />
          ) : (
            <p className="text-3xl font-bold text-slate-800">{assignedClasses.length}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Active Classes</p>
          {studentsLoading ? (
            <div className="h-8 bg-slate-100 rounded animate-pulse w-16" />
          ) : (
            <p className="text-3xl font-bold text-slate-800">{uniqueClasses.length}</p>
          )}
        </div>
      </div>

      {/* Class breakdown */}
      {!studentsLoading && uniqueClasses.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Students per Class</h2>
          <div className="space-y-3">
            {uniqueClasses.map((cls) => {
              const count = students.filter((s) => s.class === cls).length;
              const pct = students.length > 0 ? Math.round((count / students.length) * 100) : 0;
              return (
                <div key={cls}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">{cls}</span>
                    <span className="text-slate-500">{count} students</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-400 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!studentsLoading && students.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-16 text-center">
          <p className="text-4xl mb-4">👥</p>
          <p className="font-medium text-slate-700">No students yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Students in your assigned classes will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
