import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import DashboardHeader from '@/components/DashboardHeader';
import DocumentList from '@/components/DocumentList';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true },
  });

  // Signed cookie for a user who no longer exists (e.g. DB reseeded) — treat as signed out.
  if (!user) redirect('/login');

  const [owned, shares] = await Promise.all([
    prisma.document.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        _count: { select: { shares: true } },
      },
    }),
    prisma.documentShare.findMany({
      where: { userId: user.id },
      orderBy: { document: { updatedAt: 'desc' } },
      select: {
        role: true,
        document: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            owner: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <DashboardHeader userName={user.name} userEmail={user.email} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <DocumentList
          heading="My documents"
          description="Documents you own."
          emptyMessage="You haven't created any documents yet. Use “New document” or upload a file to get started."
          items={owned.map((doc) => ({
            id: doc.id,
            title: doc.title,
            updatedAt: doc.updatedAt.toISOString(),
            shareCount: doc._count.shares,
          }))}
        />

        <div className="mt-12">
          <DocumentList
            heading="Shared with me"
            description="Documents other people have given you access to."
            emptyMessage="Nothing has been shared with you yet."
            variant="shared"
            items={shares.map((share) => ({
              id: share.document.id,
              title: share.document.title,
              updatedAt: share.document.updatedAt.toISOString(),
              ownerName: share.document.owner.name,
              role: share.role,
            }))}
          />
        </div>
      </main>
    </div>
  );
}
