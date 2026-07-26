'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ADMIN_UID } from '@/lib/admin';
import { auth } from '@/lib/firebase';
import Auth from '@/components/auth';
import ArzCalculator from '@/components/arz-calculator';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

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
  getIdToken: async () => '',
  getIdTokenResult: async () => ({} as any),
  reload: async () => {},
  toJSON: () => ({}),
};


export default function Home() {
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
    try {
      await auth.signOut();
      setUser(null);
    } catch (error) {
      console.error('Error signing out: ', error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>در حال بارگذاری...</p>
      </div>
    );
  }

  return (
    <main>
      {user ? (
        <>
          <div className="absolute top-4 left-4 z-10 no-print">
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="ml-2" />
              خروج
            </Button>
          </div>
          <ArzCalculator user={user} />
        </>
      ) : (
        <Auth />
      )}
    </main>
  );
}
