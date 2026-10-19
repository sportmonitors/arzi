'use client';

import {useEffect, useState} from 'react';
import {onAuthStateChanged, type User} from 'firebase/auth';
import Link from 'next/link';
import {LogOut} from 'lucide-react';

import {ADMIN_UID} from '@/lib/admin';
import {auth} from '@/lib/firebase';
import Auth from '@/components/auth';
import TimeTracker from '@/components/time-tracker/time-tracker';
import {Button} from '@/components/ui/button';

const MOCK_USER: User = {
  uid: ADMIN_UID,
  email: 'php.modern@gmail.com',
  displayName: 'php.modern@gmail.com',
  photoURL: '',
  phoneNumber: null,
  emailVerified: true,
  isAnonymous: false,
  metadata: {},
  providerData: [],
  providerId: 'mock',
  refreshToken: '',
  tenantId: null,
  delete: async () => {},
  getIdToken: async () => 'mock',
  getIdTokenResult: async () => ({} as never),
  reload: async () => {},
  toJSON: () => ({}),
};

export default function TimerPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const useMockAuth = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === 'true';

  useEffect(() => {
    if (useMockAuth) {
      setUser(MOCK_USER);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [useMockAuth]);

  const handleSignOut = async () => {
    if (useMockAuth) {
      setUser(null);
      return;
    }
    await auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>در حال بارگذاری...</p>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <main>
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/">ماشین‌حساب</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          <LogOut className="ml-2 h-4 w-4" />
          خروج
        </Button>
      </div>
      <TimeTracker user={user} />
    </main>
  );
}
