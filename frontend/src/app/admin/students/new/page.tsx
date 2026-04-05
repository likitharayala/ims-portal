'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateStudent } from '@/hooks/use-students';
import { Toast, useToast } from '@/components/ui/Toast';
import { getApiError } from '@/lib/utils';

const INITIAL_FORM = {
  name: '',
  email: '',
  phone: '',
  class: '',
  school: '',
  feeAmount: '',
  rollNumber: '',
  dateOfBirth: '',
  address: '',
  parentName: '',
  parentPhone: '',
  joinedDate: '',
};

export default function NewStudentPage() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { toast, show: showToast, hide: hideToast } = useToast();

  const createMutation = useCreateStudent();

  const set = (field: keyof typeof INITIAL_FORM) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email address';
    if (!form.phone.trim()) errs.phone = 'Phone is required';
    else if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) errs.phone = 'Phone must be 10 digits';
    if (!form.class.trim()) errs.class = 'Class is required';
    if (!form.school.trim()) errs.school = 'School is required';
    if (!form.feeAmount || Number(form.feeAmount) < 0) errs.feeAmount = 'Fee amount is required';
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        class: form.class,
        school: form.school,
        feeAmount: parseFloat(form.feeAmount),
      };
      if (form.rollNumber) payload.rollNumber = form.rollNumber;
      if (form.dateOfBirth) payload.dateOfBirth = form.dateOfBirth;
      if (form.address) payload.address = form.address;
      if (form.parentName) payload.parentName = form.parentName;
      if (form.parentPhone) payload.parentPhone = form.parentPhone;
      if (form.joinedDate) payload.joinedDate = form.joinedDate;

      const result = await createMutation.mutateAsync(payload);
      showToast(
        result.message,
        result.emailStatus === 'FAILED' ? 'warning' : 'success',
      );
      window.setTimeout(() => {
        router.push('/admin/students');
      }, result.emailStatus === 'FAILED' ? 2200 : 1400);
    } catch (err) {
      showToast(getApiError(err), 'error');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/students"
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          ← Students
        </Link>
        <h1 className="text-2xl font-semibold text-slate-800">Add Student</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Required fields */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.name ? 'border-red-400' : 'border-slate-300'}`}
                placeholder="Full name"
              />
              {fieldErrors.name && <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.email ? 'border-red-400' : 'border-slate-300'}`}
                placeholder="student@email.com"
              />
              {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.phone ? 'border-red-400' : 'border-slate-300'}`}
                placeholder="10-digit mobile"
              />
              {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Class <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.class}
                onChange={set('class')}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.class ? 'border-red-400' : 'border-slate-300'}`}
                placeholder="e.g. 10A"
              />
              {fieldErrors.class && <p className="text-xs text-red-500 mt-1">{fieldErrors.class}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                School <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.school}
                onChange={set('school')}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.school ? 'border-red-400' : 'border-slate-300'}`}
                placeholder="School name"
              />
              {fieldErrors.school && <p className="text-xs text-red-500 mt-1">{fieldErrors.school}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Fee Amount (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.feeAmount}
                onChange={set('feeAmount')}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.feeAmount ? 'border-red-400' : 'border-slate-300'}`}
                placeholder="Monthly fee"
              />
              {fieldErrors.feeAmount && <p className="text-xs text-red-500 mt-1">{fieldErrors.feeAmount}</p>}
            </div>
          </div>
        </div>

        {/* Optional fields */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Additional Details (optional)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Roll Number</label>
              <input
                type="text"
                value={form.rollNumber}
                onChange={set('rollNumber')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={set('dateOfBirth')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Parent Name</label>
              <input
                type="text"
                value={form.parentName}
                onChange={set('parentName')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Parent Phone</label>
              <input
                type="tel"
                value={form.parentPhone}
                onChange={set('parentPhone')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Joined Date</label>
              <input
                type="date"
                value={form.joinedDate}
                onChange={set('joinedDate')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
              <textarea
                value={form.address}
                onChange={set('address')}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Optional"
              />
            </div>
          </div>
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          Credentials will be emailed to the student automatically after the account is created.
        </div>

        <div className="flex gap-3 justify-end">
          <Link
            href="/admin/students"
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
          >
            {createMutation.isPending ? 'Creating…' : 'Create Student'}
          </button>
        </div>
      </form>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
