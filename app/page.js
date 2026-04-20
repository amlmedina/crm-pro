import { cookies } from 'next/headers';
import Login from '@/components/auth/Login';
import DashboardLayout from '@/components/layout/DashboardLayout';

export default async function Home() {
  const cookieStore = await cookies();
  const sessionString = cookieStore.get('crm_session_secure')?.value;

  if (!sessionString) {
    return <Login />;
  }

  let user = null;
  try {
    user = JSON.parse(sessionString);
  } catch (e) {
    return <Login />;
  }

  return <DashboardLayout user={user} />;
}
