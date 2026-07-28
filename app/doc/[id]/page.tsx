import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { resolveAccess } from '@/lib/access';
import DocumentEditor from '@/components/DocumentEditor';

export const dynamic = 'force-dynamic';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;

  // Same chokepoint the API uses. The page cannot accidentally be more permissive than
  // the route handlers because neither one implements its own rule.
  const role = await resolveAccess(id, session.userId);
  if (!role) notFound();

  const document = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      contentHtml: true,
      owner: { select: { name: true, email: true } },
    },
  });

  if (!document) notFound();

  return (
    <DocumentEditor
      documentId={document.id}
      initialTitle={document.title}
      initialContent={document.contentHtml}
      ownerName={document.owner.name}
      role={role}
    />
  );
}
