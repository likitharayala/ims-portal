import Image from 'next/image';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo.png" alt="Teachly" width={160} height={54} className="object-contain" priority />
          <p className="text-slate-500 text-sm mt-2">Institute Management System</p>
        </div>
        {children}
      </div>
    </div>
  );
}
