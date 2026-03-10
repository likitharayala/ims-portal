import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface EnabledFeatures {
  students: boolean;
  materials: boolean;
  assessments: boolean;
  payments: boolean;
  ai_generation: boolean;
  [key: string]: boolean;
}

/** Used by AdminSidebar — fetches from /admin/settings/features */
export function useAdminFeatures() {
  return useQuery({
    queryKey: ['settings-features'],
    queryFn: async () => {
      const { data } = await api.get('/admin/settings/features');
      return data.data as EnabledFeatures;
    },
    staleTime: 5 * 60 * 1000, // 5 min — features rarely change mid-session
  });
}

/** Used by StudentSidebar — fetches from /student/features */
export function useStudentFeatures() {
  return useQuery({
    queryKey: ['student-features'],
    queryFn: async () => {
      const { data } = await api.get('/student/features');
      return data.data as EnabledFeatures;
    },
    staleTime: 5 * 60 * 1000,
  });
}
