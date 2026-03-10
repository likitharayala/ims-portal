import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AttendanceStatus = 'present' | 'absent' | 'late';

export interface StudentAttendanceRow {
  studentId: string;
  name: string;
  email: string;
  class: string;
  rollNumber: string | null;
  attendance: {
    id: string;
    status: AttendanceStatus;
    notes: string | null;
  } | null;
}

export interface AttendanceRecord {
  date: string;
  status: AttendanceStatus;
  notes: string | null;
}

export interface MonthlyReportStudent {
  studentId: string;
  name: string;
  email: string;
  class: string;
  rollNumber: string | null;
  present: number;
  late: number;
  absent: number;
  unmarked: number;
  percentage: number;
  records: AttendanceRecord[];
}

export interface MonthlyReport {
  month: number;
  year: number;
  monthName: string;
  totalDays: number;
  students: MonthlyReportStudent[];
}

export interface StudentMonthlyAttendance {
  month: number;
  year: number;
  monthName: string;
  totalDays: number;
  present: number;
  late: number;
  absent: number;
  unmarked: number;
  percentage: number;
  records: AttendanceRecord[];
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export function useAttendanceByDate(date: string, classFilter?: string) {
  return useQuery({
    queryKey: ['admin-attendance-date', date, classFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ date });
      if (classFilter) params.set('class', classFilter);
      const res = await api.get<{ success: true; data: StudentAttendanceRow[] }>(
        `/admin/attendance?${params}`,
      );
      return res.data.data;
    },
    enabled: !!date,
  });
}

export function useAttendanceReport(month?: number, year?: number, classFilter?: string) {
  return useQuery({
    queryKey: ['admin-attendance-report', month, year, classFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (month) params.set('month', String(month));
      if (year) params.set('year', String(year));
      if (classFilter) params.set('class', classFilter);
      const res = await api.get<{ success: true; data: MonthlyReport }>(
        `/admin/attendance/report?${params}`,
      );
      return res.data.data;
    },
  });
}

export function useAttendanceFilterOptions() {
  return useQuery({
    queryKey: ['attendance-filter-options'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: { classes: string[] } }>(
        '/admin/attendance/filter-options',
      );
      return res.data.data;
    },
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      date: string;
      entries: { studentId: string; status: AttendanceStatus; notes?: string }[];
    }) => {
      const res = await api.post<{ success: true; data: { marked: number; date: string } }>(
        '/admin/attendance/mark',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-attendance-date'] });
      qc.invalidateQueries({ queryKey: ['admin-attendance-report'] });
    },
  });
}

// ─── Teacher ────────────────────────────────────────────────────────────────

export function useTeacherAttendanceByDate(date: string, classFilter?: string) {
  return useQuery({
    queryKey: ['teacher-attendance-date', date, classFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ date });
      if (classFilter) params.set('class', classFilter);
      const res = await api.get<{ success: true; data: StudentAttendanceRow[] }>(
        `/teacher/attendance?${params}`,
      );
      return res.data.data;
    },
    enabled: !!date,
  });
}

export function useMarkTeacherAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      date: string;
      entries: { studentId: string; status: AttendanceStatus; notes?: string }[];
    }) => {
      const res = await api.post<{ success: true; data: { marked: number; date: string } }>(
        '/teacher/attendance/mark',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-attendance-date'] });
    },
  });
}

// ─── Student ────────────────────────────────────────────────────────────────

export function useMyAttendance(month?: number, year?: number) {
  return useQuery({
    queryKey: ['student-attendance', month, year],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (month) params.set('month', String(month));
      if (year) params.set('year', String(year));
      const res = await api.get<{ success: true; data: StudentMonthlyAttendance }>(
        `/student/attendance?${params}`,
      );
      return res.data.data;
    },
  });
}
