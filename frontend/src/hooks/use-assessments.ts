import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AssessmentQuestion {
  id: string;
  questionNumber: number;
  questionType: 'mcq' | 'descriptive';
  questionText: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctOption?: string;
  marks: number;
  aiGenerated: boolean;
  createdAt: string;
}

export interface Assessment {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  subject?: string;
  totalMarks: number;
  negativeMarking: boolean;
  negativeValue?: number;
  status: 'draft' | 'published' | 'active' | 'closed' | 'evaluated';
  startAt?: string;
  endAt?: string;
  resultsReleased: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  _count?: { questions: number; submissions: number };
  questions?: AssessmentQuestion[];
}

export interface AssessmentMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface Submission {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentClass: string;
  studentIsDeleted: boolean;
  status: 'in_progress' | 'submitted' | 'evaluated' | 'absent';
  totalMarks?: number;
  isFinalized: boolean;
  resultReleased: boolean;
  submittedAt?: string;
  autoSubmitted: boolean;
}

export interface AssessmentStats {
  total: number;
  submitted: number;
  evaluated: number;
  absent: number;
  highest: number | null;
  lowest: number | null;
  average: number | null;
}

// ─── Admin Hooks ──────────────────────────────────────────────────────────────

export function useAdminAssessments(params: {
  search?: string;
  status?: string;
  page?: number;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));

  return useQuery({
    queryKey: ['admin-assessments', params],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Assessment[]; meta: AssessmentMeta }>(
        `/admin/assessments?${query}`,
      );
      return res.data;
    },
  });
}

export function useAdminAssessment(id: string) {
  return useQuery({
    queryKey: ['admin-assessment', id],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Assessment }>(
        `/admin/assessments/${id}`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      instructions?: string;
      subject?: string;
      totalMarks: number;
      negativeMarking?: boolean;
      negativeValue?: number;
      startAt?: string;
      endAt?: string;
    }) => {
      const res = await api.post<{ success: true; data: Assessment }>(
        '/admin/assessments',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-assessments'] }),
  });
}

export function useUpdateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Assessment> }) => {
      const res = await api.patch<{ success: true; data: Assessment }>(
        `/admin/assessments/${id}`,
        data,
      );
      return res.data.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin-assessments'] });
      qc.invalidateQueries({ queryKey: ['admin-assessment', id] });
    },
  });
}

export function usePublishAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ success: true; data: Assessment }>(
        `/admin/assessments/${id}/publish`,
      );
      return res.data.data;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['admin-assessments'] });
      qc.invalidateQueries({ queryKey: ['admin-assessment', id] });
    },
  });
}

export function useDeleteAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/assessments/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-assessments'] }),
  });
}

export function useDuplicateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ success: true; data: Assessment }>(
        `/admin/assessments/${id}/duplicate`,
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-assessments'] }),
  });
}

// ─── Question Hooks ───────────────────────────────────────────────────────────

export function useAddQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      data,
    }: {
      assessmentId: string;
      data: {
        questionType: 'mcq' | 'descriptive';
        questionText: string;
        optionA?: string;
        optionB?: string;
        optionC?: string;
        optionD?: string;
        correctOption?: string;
        marks: number;
      };
    }) => {
      const res = await api.post<{ success: true; data: AssessmentQuestion }>(
        `/admin/assessments/${assessmentId}/questions`,
        data,
      );
      return res.data.data;
    },
    onSuccess: (_, { assessmentId }) =>
      qc.invalidateQueries({ queryKey: ['admin-assessment', assessmentId] }),
  });
}

export function useUpdateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      questionId,
      data,
    }: {
      assessmentId: string;
      questionId: string;
      data: Partial<AssessmentQuestion>;
    }) => {
      const res = await api.patch<{ success: true; data: AssessmentQuestion }>(
        `/admin/assessments/${assessmentId}/questions/${questionId}`,
        data,
      );
      return res.data.data;
    },
    onSuccess: (_, { assessmentId }) =>
      qc.invalidateQueries({ queryKey: ['admin-assessment', assessmentId] }),
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      questionId,
    }: {
      assessmentId: string;
      questionId: string;
    }) => {
      await api.delete(
        `/admin/assessments/${assessmentId}/questions/${questionId}`,
      );
    },
    onSuccess: (_, { assessmentId }) =>
      qc.invalidateQueries({ queryKey: ['admin-assessment', assessmentId] }),
  });
}

// ─── Evaluation Hooks ─────────────────────────────────────────────────────────

export function useSubmissions(assessmentId: string) {
  return useQuery({
    queryKey: ['submissions', assessmentId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Submission[] }>(
        `/admin/assessments/${assessmentId}/submissions`,
      );
      return res.data.data;
    },
    enabled: !!assessmentId,
  });
}

export function useSubmission(assessmentId: string, submissionId: string) {
  return useQuery({
    queryKey: ['submission', assessmentId, submissionId],
    queryFn: async () => {
      const res = await api.get(
        `/admin/assessments/${assessmentId}/submissions/${submissionId}`,
      );
      return res.data.data;
    },
    enabled: !!assessmentId && !!submissionId,
  });
}

export function useEnterMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      submissionId,
      marks,
    }: {
      assessmentId: string;
      submissionId: string;
      marks: { questionId: string; marks: number; comment?: string; flagged?: boolean }[];
    }) => {
      const res = await api.patch(
        `/admin/assessments/${assessmentId}/submissions/${submissionId}/marks`,
        { marks },
      );
      return res.data.data;
    },
    onSuccess: (_, { assessmentId, submissionId }) => {
      qc.invalidateQueries({ queryKey: ['submissions', assessmentId] });
      qc.invalidateQueries({ queryKey: ['submission', assessmentId, submissionId] });
    },
  });
}

export function useFinalizeSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      submissionId,
    }: {
      assessmentId: string;
      submissionId: string;
    }) => {
      const res = await api.post(
        `/admin/assessments/${assessmentId}/submissions/${submissionId}/finalize`,
      );
      return res.data.data;
    },
    onSuccess: (_, { assessmentId }) =>
      qc.invalidateQueries({ queryKey: ['submissions', assessmentId] }),
  });
}

export function useReleaseAllResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assessmentId: string) => {
      await api.post(`/admin/assessments/${assessmentId}/release-results`);
    },
    onSuccess: (_, assessmentId) => {
      qc.invalidateQueries({ queryKey: ['admin-assessment', assessmentId] });
      qc.invalidateQueries({ queryKey: ['submissions', assessmentId] });
    },
  });
}

export function useAssessmentStats(assessmentId: string) {
  return useQuery({
    queryKey: ['assessment-stats', assessmentId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: AssessmentStats }>(
        `/admin/assessments/${assessmentId}/stats`,
      );
      return res.data.data;
    },
    enabled: !!assessmentId,
  });
}

// ─── Student Hooks ────────────────────────────────────────────────────────────

export function useStudentAssessments(params: { search?: string; page?: number }) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.page) query.set('page', String(params.page));

  return useQuery({
    queryKey: ['student-assessments', params],
    queryFn: async () => {
      const res = await api.get<{
        success: true;
        data: Assessment[];
        meta: AssessmentMeta;
      }>(`/student/assessments?${query}`);
      return res.data;
    },
  });
}

export function useStudentAssessment(id: string) {
  return useQuery({
    queryKey: ['student-assessment', id],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Assessment }>(
        `/student/assessments/${id}`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useMySubmission(assessmentId: string) {
  return useQuery({
    queryKey: ['my-submission', assessmentId],
    queryFn: async () => {
      const res = await api.get(`/student/assessments/${assessmentId}/submission`);
      return res.data.data;
    },
    enabled: !!assessmentId,
  });
}

export function useStartExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assessmentId: string) => {
      const res = await api.post(
        `/student/assessments/${assessmentId}/start`,
      );
      return res.data.data;
    },
    onSuccess: (data, assessmentId) => {
      // Use setQueryData (not invalidateQueries) so the exam page sees the
      // fresh in_progress submission IMMEDIATELY on mount — no background
      // refetch race where the page briefly has submission=null and the
      // upload endpoint throws "Active submission not found".
      qc.setQueryData(['my-submission', assessmentId], data);
    },
  });
}

export function useSaveAnswers() {
  return useMutation({
    mutationFn: async ({
      assessmentId,
      answers,
    }: {
      assessmentId: string;
      answers: Record<string, { selectedOption?: string; text?: string }>;
    }) => {
      await api.put(`/student/assessments/${assessmentId}/save`, { answers });
    },
  });
}

export function useSubmitExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      answers,
    }: {
      assessmentId: string;
      answers: Record<string, { selectedOption?: string; text?: string }>;
    }) => {
      const res = await api.post(
        `/student/assessments/${assessmentId}/submit`,
        { answers },
      );
      return res.data.data;
    },
    onSuccess: (_, { assessmentId }) => {
      qc.invalidateQueries({ queryKey: ['my-submission', assessmentId] });
      qc.invalidateQueries({ queryKey: ['student-assessments'] });
    },
  });
}

export function useUploadAnswerSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      file,
    }: {
      assessmentId: string;
      file: File;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(
        `/student/assessments/${assessmentId}/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
    onSuccess: (_, { assessmentId }) =>
      qc.invalidateQueries({ queryKey: ['my-submission', assessmentId] }),
  });
}

export function useGenerateQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      topic,
      subject,
      questionType,
      count,
      marksPerQuestion,
    }: {
      assessmentId: string;
      topic: string;
      subject?: string;
      questionType: 'mcq' | 'descriptive';
      count: number;
      marksPerQuestion?: number;
    }) => {
      const res = await api.post<{ success: true; data: AssessmentQuestion[] }>(
        `/admin/assessments/${assessmentId}/generate-questions`,
        { topic, subject, questionType, count, marksPerQuestion },
      );
      return res.data.data;
    },
    onSuccess: (_, { assessmentId }) => {
      qc.invalidateQueries({ queryKey: ['admin-assessment', assessmentId] });
    },
  });
}

export interface PerformanceRecord {
  assessmentId: string;
  title: string;
  subject: string | null;
  totalMarks: number;
  marksObtained: number | null;
  status: 'in_progress' | 'submitted' | 'evaluated' | 'absent';
  isFinalized?: boolean;
  resultReleased: boolean;
  submittedAt: string | null;
  evaluatedAt?: string | null;
  startAt: string | null;
}

export function useMyPerformance() {
  return useQuery({
    queryKey: ['student-performance'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: PerformanceRecord[] }>(
        '/student/performance',
      );
      return res.data.data;
    },
  });
}

export function useStudentPerformance(studentId: string) {
  return useQuery({
    queryKey: ['admin-student-performance', studentId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: PerformanceRecord[] }>(
        `/admin/students/${studentId}/performance`,
      );
      return res.data.data;
    },
    enabled: !!studentId,
  });
}

export interface StudentResultRecord {
  assessmentId: string;
  submissionId: string;
  title: string;
  subject: string | null;
  totalMarks: number;
  marksObtained: number;
  status: string;
  startAt: string | null;
  evaluatedAt: string | null;
}

export function useStudentResults() {
  return useQuery({
    queryKey: ['student-results'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: StudentResultRecord[] }>(
        '/student/results',
      );
      return res.data.data;
    },
  });
}

export function useStudentResult(assessmentId: string) {
  return useQuery({
    queryKey: ['student-result', assessmentId],
    queryFn: async () => {
      const res = await api.get(
        `/student/assessments/${assessmentId}/result`,
      );
      return res.data.data;
    },
    enabled: !!assessmentId,
  });
}

// ─── Extra Time Hooks ─────────────────────────────────────────────────────────

export interface ExtraTimeRecord {
  id: string;
  studentId: string;
  extraMinutes: number;
  reason: string | null;
  createdAt: string;
  student: {
    class: string;
    user: { name: string; email: string };
  };
}

export function useExtraTimeList(assessmentId: string) {
  return useQuery({
    queryKey: ['extra-time-list', assessmentId],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: ExtraTimeRecord[] }>(
        `/admin/assessments/${assessmentId}/extra-time`,
      );
      return res.data.data;
    },
    enabled: !!assessmentId,
  });
}

export function useGrantExtraTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      studentId,
      extraMinutes,
      reason,
    }: {
      assessmentId: string;
      studentId: string;
      extraMinutes: number;
      reason?: string;
    }) => {
      const res = await api.post<{
        success: true;
        data: { submissionReopened: boolean; effectiveEndAt: string | null };
      }>(
        `/admin/assessments/${assessmentId}/extra-time`,
        { studentId, extraMinutes, reason },
      );
      return res.data.data;
    },
    onSuccess: (_, { assessmentId }) => {
      qc.invalidateQueries({ queryKey: ['extra-time-list', assessmentId] });
      qc.invalidateQueries({ queryKey: ['submissions', assessmentId] });
    },
  });
}

export function useRemoveExtraTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      studentId,
    }: {
      assessmentId: string;
      studentId: string;
    }) => {
      await api.delete(
        `/admin/assessments/${assessmentId}/extra-time/${studentId}`,
      );
    },
    onSuccess: (_, { assessmentId }) =>
      qc.invalidateQueries({ queryKey: ['extra-time-list', assessmentId] }),
  });
}

export function useMyExtraTime(assessmentId: string, refetchInterval?: number) {
  return useQuery({
    queryKey: ['my-extra-time', assessmentId],
    queryFn: async () => {
      const res = await api.get<{
        success: true;
        data: { extraMinutes: number; reason: string | null; effectiveEndAt: string | null };
      }>(`/student/assessments/${assessmentId}/extra-time`);
      return res.data.data;
    },
    enabled: !!assessmentId,
    refetchInterval,
  });
}
