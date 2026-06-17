import { cookies } from 'next/headers';
import Login from '@/components/auth/Login';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { verifySession } from '@/lib/session';

export default async function Home() {
  const cookieStore = await cookies();
  const sessionString = cookieStore.get('crm_session_secure')?.value;

  if (!sessionString) {
    return <Login />;
  }

  const user = verifySession(sessionString);
  if (!user) {
    return <Login />;
  }

  return <DashboardLayout user={user} />;
}
