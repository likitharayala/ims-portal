'use client';

/**
 * DateTimePicker
 *
 * Works entirely in IST (Asia/Kolkata, UTC+5:30).
 * value / onChange use the format "YYYY-MM-DDTHH:mm" in IST.
 *
 * Auto-closes after the user picks date + hour + minute + AM/PM.
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  value: string;           // "YYYY-MM-DDTHH:mm" in IST, or ''
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseISTValue(v: string): {
  year: number; month: number; day: number;
  hour12: number; minute: number; period: 'AM' | 'PM';
} | null {
  if (!v) return null;
  const [datePart, timePart] = v.split('T');
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const period = hh < 12 ? 'AM' : 'PM';
  const hour12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return { year, month, day, hour12, minute: mm, period };
}

function buildISTValue(
  year: number, month: number, day: number,
  hour12: number, minute: number, period: 'AM' | 'PM',
): string {
  const h24 =
    period === 'AM'
      ? hour12 === 12 ? 0 : hour12
      : hour12 === 12 ? 12 : hour12 + 12;
  const y = String(year).padStart(4, '0');
  const mo = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  const h = String(h24).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${m}`;
}

function formatDisplay(v: string): string {
  if (!v) return '';
  const p = parseISTValue(v);
  if (!p) return '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const min = String(p.minute).padStart(2, '0');
  return `${String(p.day).padStart(2,'0')} ${MONTHS[p.month - 1]} ${p.year}, ${p.hour12}:${min} ${p.period}`;
}

/** Return array of {date, inMonth} for a 6-week calendar grid */
function buildCalendarDays(year: number, month: number) {
  // month is 1-indexed
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const startDow = first.getDay(); // 0=Sun
  const days: { date: number; month: number; year: number; inMonth: boolean }[] = [];

  // Days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, -i);
    days.push({ date: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear(), inMonth: false });
  }
  // Days in current month
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: d, month, year, inMonth: true });
  }
  // Pad to multiple of 7
  while (days.length % 7 !== 0) {
    const prev = days[days.length - 1];
    const next = new Date(prev.year, prev.month - 1, prev.date + 1);
    days.push({ date: next.getDate(), month: next.getMonth() + 1, year: next.getFullYear(), inMonth: false });
  }
  return days;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// ── component ─────────────────────────────────────────────────────────────────

export function DateTimePicker({ value, onChange, placeholder = 'Select date & time', id }: Props) {
  const parsed = parseISTValue(value);

  const today = new Date();
  const [open, setOpen] = useState(false);
  const [calYear, setCalYear] = useState(parsed?.year ?? today.getFullYear());
  const [calMonth, setCalMonth] = useState(parsed?.month ?? today.getMonth() + 1);

  // Selected parts — track separately so partial state is visible
  const [selDate, setSelDate] = useState<{ year: number; month: number; day: number } | null>(
    parsed ? { year: parsed.year, month: parsed.month, day: parsed.day } : null,
  );
  const [selHour, setSelHour] = useState<number | null>(parsed?.hour12 ?? null);
  const [selMinute, setSelMinute] = useState<number | null>(parsed?.minute ?? null);
  const [selPeriod, setSelPeriod] = useState<'AM' | 'PM' | null>(parsed?.period ?? null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  // Sync internal state when value prop changes externally
  useEffect(() => {
    const p = parseISTValue(value);
    if (p) {
      setSelDate({ year: p.year, month: p.month, day: p.day });
      setSelHour(p.hour12);
      setSelMinute(p.minute);
      setSelPeriod(p.period);
      setCalYear(p.year);
      setCalMonth(p.month);
    } else {
      setSelDate(null);
      setSelHour(null);
      setSelMinute(null);
      setSelPeriod(null);
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = containerRef.current?.contains(target);
      const clickedPopup = popupRef.current?.contains(target);
      if (!clickedTrigger && !clickedPopup) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const updatePopupPosition = () => {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const gutter = 16;
      const popupWidth = Math.min(320, window.innerWidth - gutter * 2);
      const popupHeight = 540;

      let left = rect.left;
      if (left + popupWidth > window.innerWidth - gutter) {
        left = Math.max(gutter, window.innerWidth - popupWidth - gutter);
      }

      let top = rect.bottom + 8;
      if (top + popupHeight > window.innerHeight - gutter) {
        top = Math.max(gutter, rect.top - popupHeight - 8);
      }

      setPopupStyle({ top, left });
    };

    updatePopupPosition();
    window.addEventListener('resize', updatePopupPosition);
    window.addEventListener('scroll', updatePopupPosition, true);

    return () => {
      window.removeEventListener('resize', updatePopupPosition);
      window.removeEventListener('scroll', updatePopupPosition, true);
    };
  }, [open]);

  // Emit value (no auto-close — user must click Confirm)
  function emitIfComplete(
    date: typeof selDate,
    hour: typeof selHour,
    minute: typeof selMinute,
    period: typeof selPeriod,
  ) {
    if (date && hour !== null && minute !== null && period) {
      const v = buildISTValue(date.year, date.month, date.day, hour, minute, period);
      onChange(v);
    }
  }

  const handleDateClick = (year: number, month: number, day: number) => {
    const d = { year, month, day };
    setSelDate(d);
    emitIfComplete(d, selHour, selMinute, selPeriod);
  };

  const handleHour = (h: number) => {
    setSelHour(h);
    emitIfComplete(selDate, h, selMinute, selPeriod);
  };

  const handleMinute = (m: number) => {
    setSelMinute(m);
    emitIfComplete(selDate, selHour, m, selPeriod);
  };

  const handlePeriod = (p: 'AM' | 'PM') => {
    setSelPeriod(p);
    emitIfComplete(selDate, selHour, selMinute, p);
  };

  const prevMonth = () => {
    if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const days = buildCalendarDays(calYear, calMonth);

  const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const MINUTES = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger input */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hover:border-slate-400 transition-colors"
      >
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
      </button>

      {/* Clear button */}
      {value && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(''); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Popup */}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{ top: popupStyle.top, left: popupStyle.left }}
          className="fixed z-[70] w-[min(320px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
        >

          {/* Calendar header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded hover:bg-slate-100 text-slate-600"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-slate-800">
              {MONTH_NAMES[calMonth - 1]} {calYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded hover:bg-slate-100 text-slate-600"
            >
              ›
            </button>
          </div>

          {/* Day of week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DOW.map((d) => (
              <div key={d} className="text-center text-xs text-slate-400 font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5 mb-4">
            {days.map((d, i) => {
              const isSelected =
                selDate &&
                selDate.year === d.year &&
                selDate.month === d.month &&
                selDate.day === d.date;
              const isToday =
                d.year === today.getFullYear() &&
                d.month === today.getMonth() + 1 &&
                d.date === today.getDate();

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleDateClick(d.year, d.month, d.date)}
                  className={`h-8 w-full rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isToday && !isSelected
                      ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-300'
                      : d.inMonth
                      ? 'text-slate-800 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {d.date}
                </button>
              );
            })}
          </div>

          {/* Time selector */}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500 mb-2 font-medium">Select time (IST)</p>
            <div className="flex items-center gap-2">

              {/* Hour */}
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Hour</label>
                <select
                  value={selHour ?? ''}
                  onChange={(e) => handleHour(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="" disabled>--</option>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>

              <span className="text-slate-400 mt-5 font-bold">:</span>

              {/* Minute */}
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Min</label>
                <select
                  value={selMinute ?? ''}
                  onChange={(e) => handleMinute(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="" disabled>--</option>
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>

              {/* AM / PM */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Period</label>
                <div className="flex rounded-lg overflow-hidden border border-slate-200">
                  {(['AM', 'PM'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePeriod(p)}
                      className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        selPeriod === p
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Status hint */}
            <p className="text-xs text-slate-400 mt-2">
              {selDate && selHour !== null && selMinute !== null && selPeriod
                ? <span className="text-blue-600 font-medium">✓ {formatDisplay(buildISTValue(selDate.year, selDate.month, selDate.day, selHour, selMinute, selPeriod))}</span>
                : 'Select date, hour, minute, and AM/PM'}
            </p>
          </div>

          {/* Confirm button — always visible, only closes picker */}
          <button
            type="button"
            disabled={!(selDate && selHour !== null && selMinute !== null && selPeriod)}
            onClick={() => {
              if (selDate && selHour !== null && selMinute !== null && selPeriod) {
                const v = buildISTValue(selDate.year, selDate.month, selDate.day, selHour, selMinute, selPeriod);
                onChange(v);
              }
              setOpen(false);
            }}
            className="mt-3 w-full py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Confirm
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
