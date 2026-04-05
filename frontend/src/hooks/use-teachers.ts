import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Teacher {
  id: string;
  instituteId: string;
  userId: string;
  assignedClasses: string[];
  createdAt: string;
  user: { name: string; email: string; phone: string | null; lastLoginAt: string | null };
}

export interface TeacherStudent {
  id: string;
  class: string;
  rollNumber: string | null;
  user: { name: string; email: string };
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export function useTeachers() {
  return useQuery({
    queryKey: ['admin-teachers'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Teacher[] }>('/admin/teachers');
      return res.data.data;
    },
  });
}

export function useCreateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      email: string;
      phone?: string;
      assignedClasses: string[];
    }) => {
      const res = await api.post<{
        success: true;
        data: {
          teacher: Teacher;
          tempPassword: string | null;
          onboardingMethod: 'manual_temp_password' | 'supabase_invite';
        };
      }>('/admin/teachers', data);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-teachers'] });
    },
  });
}

export function useUpdateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; phone?: string; assignedClasses?: string[] };
    }) => {
      const res = await api.put<{ success: true; data: Teacher }>(
        `/admin/teachers/${id}`,
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-teachers'] });
    },
  });
}

export function useDeleteTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/teachers/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-teachers'] });
    },
  });
}

// ─── Teacher ────────────────────────────────────────────────────────────────

export function useTeacherProfile() {
  return useQuery({
    queryKey: ['teacher-profile'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Teacher }>('/teacher/profile');
      return res.data.data;
    },
  });
}

export function useTeacherStudents() {
  return useQuery({
    queryKey: ['teacher-students'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: TeacherStudent[] }>(
        '/teacher/students',
      );
      return res.data.data;
    },
  });
}
