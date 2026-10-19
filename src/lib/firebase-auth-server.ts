import {createRemoteJWKSet, jwtVerify} from 'jose';
import {NextRequest} from 'next/server';
import {ADMIN_UID} from '@/lib/admin';

const FIREBASE_PROJECT_ID = 'arz-calculator';
const JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  )
);

const getBearer = (request: NextRequest) => {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token || undefined;
};

export async function verifyFirebaseIdToken(
  idToken: string
): Promise<{uid: string; email?: string}> {
  const {payload} = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });

  const uid = typeof payload.sub === 'string' ? payload.sub : '';
  if (!uid) throw new Error('Invalid token: missing subject');

  return {
    uid,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  };
}

/** Requires admin. Supports mock auth for local NEXT_PUBLIC_USE_MOCK_AUTH=true. */
export async function requireAdmin(request: NextRequest): Promise<string> {
  const token = getBearer(request);

  if (!token) {
    if (process.env.NEXT_PUBLIC_USE_MOCK_AUTH === 'true') {
      return ADMIN_UID;
    }
    throw new AuthError('Unauthorized', 401);
  }

  if (token === 'mock' && process.env.NEXT_PUBLIC_USE_MOCK_AUTH === 'true') {
    return ADMIN_UID;
  }

  try {
    const {uid} = await verifyFirebaseIdToken(token);
    if (uid !== ADMIN_UID) throw new AuthError('Forbidden', 403);
    return uid;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('Invalid token', 401);
  }
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
