import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const role = (user.app_metadata as { role?: string })?.role;
  if (role === 'auditor') redirect('/audit/log');
  if (role === 'admin') redirect('/admin/learning-objects');
  redirect('/corsi');
}
