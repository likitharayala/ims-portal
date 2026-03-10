import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Material {
  id: string;
  title: string;
  subject: string;
  author: string | null;
  description: string | null;
  filePath: string;
  fileSize: number;
  isHidden: boolean;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialListMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface MaterialsQuery {
  page?: number;
  search?: string;
  subject?: string;
  sort?: 'newest' | 'oldest';
}

// ─── Admin hooks ──────────────────────────────────────────────────────────────

export function useAdminMaterials(query: MaterialsQuery = {}) {
  return useQuery({
    queryKey: ['admin-materials', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.page) params.set('page', String(query.page));
      if (query.search) params.set('search', query.search);
      if (query.subject) params.set('subject', query.subject);
      if (query.sort) params.set('sort', query.sort);
      const { data } = await api.get(`/admin/materials?${params}`);
      return data as { data: Material[]; meta: MaterialListMeta };
    },
  });
}

export function useAdminMaterialSubjects() {
  return useQuery({
    queryKey: ['admin-material-subjects'],
    queryFn: async () => {
      const { data } = await api.get('/admin/materials/subjects');
      return data.data as string[];
    },
  });
}

export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const { data } = await api.post('/admin/materials', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as Material;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-materials'] });
      qc.invalidateQueries({ queryKey: ['admin-material-subjects'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
    },
  });
}

export function useUpdateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: FormData }) => {
      const { data } = await api.put(`/admin/materials/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as Material;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-materials'] });
      qc.invalidateQueries({ queryKey: ['admin-material-subjects'] });
    },
  });
}

export function useToggleHidden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/admin/materials/${id}/toggle-hidden`);
      return data.data as Material;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-materials'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
    },
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/materials/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-materials'] });
      qc.invalidateQueries({ queryKey: ['admin-material-subjects'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
    },
  });
}

// ─── Student hooks ────────────────────────────────────────────────────────────

export function useStudentMaterials(query: MaterialsQuery = {}) {
  return useQuery({
    queryKey: ['student-materials', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.page) params.set('page', String(query.page));
      if (query.search) params.set('search', query.search);
      if (query.subject) params.set('subject', query.subject);
      if (query.sort) params.set('sort', query.sort);
      const { data } = await api.get(`/student/materials?${params}`);
      return data as { data: Material[]; meta: MaterialListMeta };
    },
  });
}

export function useStudentMaterialSubjects() {
  return useQuery({
    queryKey: ['student-material-subjects'],
    queryFn: async () => {
      const { data } = await api.get('/student/materials/subjects');
      return data.data as string[];
    },
  });
}

export function useStudentMaterial(id: string) {
  return useQuery({
    queryKey: ['student-material', id],
    queryFn: async () => {
      const { data } = await api.get(`/student/materials/${id}`);
      return data.data as Material;
    },
    enabled: !!id,
  });
}
