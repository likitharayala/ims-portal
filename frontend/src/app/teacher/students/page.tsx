'use client';

import { useState } from 'react';
import { useTeacherStudents } from '@/hooks/use-teachers';

export default function TeacherStudentsPage() {
  const [classFilter, setClassFilter] = useState('');
  const [search, setSearch] = useState('');
  const { data: students = [], isLoading } = useTeacherStudents();

  const classes = Array.from(new Set(students.map((s) => s.class))).sort();

  const filtered = students.filter((s) => {
    if (classFilter && s.class !== classFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.user.name.toLowerCase().includes(q) ||
        s.user.email.toLowerCase().includes(q) ||
        s.class.toLowerCase().includes(q) ||
        (s.rollNumber ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">My Students</h1>
          <p className="text-sm text-slate-500 mt-0.5">{students.length} total students</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name, email, roll number…"
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden md:table-cell">Email</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Class</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 hidden sm:table-cell">Roll No.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center text-slate-500">
                    <p className="text-base font-medium">
                      {students.length === 0 ? 'No students in your assigned classes' : 'No students match your search'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{s.user.name}</td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{s.user.email}</td>
                    <td className="px-4 py-3 text-slate-600">{s.class}</td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{s.rollNumber ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
