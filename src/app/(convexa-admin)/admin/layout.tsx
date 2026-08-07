import { redirect } from 'next/navigation';

/** Legacy /admin → Platform Console */
export default function AdminRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  redirect('/console');
  return children;
}
