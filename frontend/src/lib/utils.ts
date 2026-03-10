import { format, toZonedTime } from 'date-fns-tz';

const IST_TZ = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

/** Format a UTC date/string to IST display string */
export function toIST(date: Date | string, fmt = 'dd MMM yyyy, hh:mm a'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const zoned = toZonedTime(d, IST_TZ);
  return format(zoned, fmt, { timeZone: IST_TZ });
}

/**
 * Convert a UTC ISO string to "YYYY-MM-DDTHH:mm" in IST.
 * Used to populate datetime picker inputs from stored UTC values.
 */
export function utcToISTLocal(utc?: string | null): string {
  if (!utc) return '';
  const utcMs = new Date(utc).getTime();
  const istMs = utcMs + IST_OFFSET_MS;
  const d = new Date(istMs);
  const yyyy = d.getUTCFullYear();
  const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const HH = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd}T${HH}:${mm}`;
}

/**
 * Convert a "YYYY-MM-DDTHH:mm" IST local string back to a UTC ISO string.
 * Used when saving form values to the backend.
 */
export function istLocalToUTC(ist: string): string {
  if (!ist) return '';
  // Treat the datetime string as IST by appending +05:30
  return new Date(`${ist}:00+05:30`).toISOString();
}

/** Generate a temp password: 8 alphanumeric chars */
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

/** Slugify a string */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

/** Format currency in INR */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

/** Extract error message from API response */
export function getApiError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
    return (
      e.response?.data?.error?.message ??
      e.message ??
      'An unexpected error occurred'
    );
  }
  return 'An unexpected error occurred';
}
