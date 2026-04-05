import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Student {
  id: string;
  rollNumber: string | null;
  class: string;
  school: string;
  dateOfBirth: string | null;
  address: string | null;
  parentName: string | null;
  parentPhone: string | null;
  profilePhotoPath: string | null;
  feeAmount: string;
  joinedDate: string;
  emailSent: boolean;
  emailSentAt: string | null;
  emailStatus: string;
  emailRetryCount: number;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    mustChangePassword: boolean;
    isEmailVerified: boolean;
    isActive: boolean;
    lastLoginAt: string | null;
  };
}

export interface StudentListMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface StudentListQuery {
  page?: number;
  search?: string;
  class?: string;
  school?: string;
}

export function useStudents(query: StudentListQuery = {}) {
  return useQuery({
    queryKey: ['students', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.page) params.set('page', String(query.page));
      if (query.search) params.set('search', query.search);
      if (query.class) params.set('class', query.class);
      if (query.school) params.set('school', query.school);
      const { data } = await api.get(`/admin/students?${params}`);
      return data as { data: Student[]; meta: StudentListMeta };
    },
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: ['student', id],
    queryFn: async () => {
      const { data } = await api.get(`/admin/students/${id}`);
      return data.data as Student;
    },
    enabled: !!id,
  });
}

export function useStudentFilterOptions() {
  return useQuery({
    queryKey: ['student-filter-options'],
    queryFn: async () => {
      const { data } = await api.get('/admin/students/filter-options');
      return data.data as { classes: string[]; schools: string[] };
    },
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.post('/admin/students', payload);
      return data.data as { student: Student; message: string; emailStatus: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student-filter-options'] });
    },
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, unknown> & { id: string }) => {
      const { data } = await api.put(`/admin/students/${id}`, payload);
      return data.data as Student;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student', vars.id] });
    },
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/students/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student-filter-options'] });
    },
  });
}

export function useResendStudentCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/admin/students/${id}/resend-credentials`);
      return data.data as { studentId: string; message: string; emailStatus: string };
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student', id] });
    },
  });
}

export function useUploadStudentPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append('photo', file);
      const { data } = await api.post(`/admin/students/${id}/profile-photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as { profilePhotoPath: string };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['student', vars.id] });
    },
  });
}

export interface BulkUploadResult {
  created: number;
  queuedForEmail: number;
  emailQueueFailures: number;
  skipped: number;
  errors: Array<{ row: number; email: string; reason: string }>;
}

export function useBulkUpload() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/admin/students/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as BulkUploadResult;
    },
  });
}
