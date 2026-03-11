'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Sidebar } from '@/components/layout/Sidebar';
import { CaptchaModal } from '@/components/ui/CaptchaModal';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  useWebSocket(); // initialise WS connection for all protected pages

  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user, router]);

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
        {children}
      </main>
      <CaptchaModal />
    </div>
  );
}
