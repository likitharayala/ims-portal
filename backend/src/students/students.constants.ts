export const STUDENT_ONBOARDING_QUEUE = 'student-onboarding';
export const STUDENT_ONBOARDING_SEND_CREDENTIALS_JOB = 'send-credentials';
export const STUDENT_ONBOARDING_SEND_CREDENTIALS_ATTEMPTS = 3;
export const STUDENT_ONBOARDING_SEND_CREDENTIALS_BACKOFF_MS = 30000;

export const STUDENT_EMAIL_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export type StudentEmailStatus =
  (typeof STUDENT_EMAIL_STATUS)[keyof typeof STUDENT_EMAIL_STATUS];

export const STUDENT_EVENTS = {
  CREATED: 'students.created',
  BULK_CREATED: 'students.bulk-created',
  EMAIL_QUEUED: 'students.email-queued',
  EMAIL_SENT: 'students.email-sent',
} as const;
