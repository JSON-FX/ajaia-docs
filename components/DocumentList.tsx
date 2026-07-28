import Link from 'next/link';

type DocumentItem = {
  id: string;
  title: string;
  updatedAt: string;
  shareCount?: number;
  ownerName?: string;
  role?: 'VIEWER' | 'EDITOR';
};

type Props = {
  heading: string;
  description: string;
  emptyMessage: string;
  items: DocumentItem[];
  variant?: 'owned' | 'shared';
};

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/**
 * The two dashboard sections share this component but are visually distinguished by the
 * accent rail and the owner/role metadata — the brief asks specifically for a *visible*
 * distinction between owned and shared documents, so it can't just be two identical lists
 * under different headings.
 */
export default function DocumentList({
  heading,
  description,
  emptyMessage,
  items,
  variant = 'owned',
}: Props) {
  const isShared = variant === 'shared';

  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
          {items.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">{description}</p>

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white/50 px-5 py-8 text-center text-sm text-zinc-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/doc/${item.id}`}
                className={`flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4 transition hover:border-zinc-400 hover:shadow-sm ${
                  isShared ? 'border-l-4 border-l-indigo-400' : 'border-l-4 border-l-zinc-300'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Updated {formatUpdatedAt(item.updatedAt)}
                    {isShared && item.ownerName && <> · Owned by {item.ownerName}</>}
                    {!isShared && item.shareCount !== undefined && (
                      <>
                        {' '}
                        ·{' '}
                        {item.shareCount === 0
                          ? 'Not shared'
                          : `Shared with ${item.shareCount} ${
                              item.shareCount === 1 ? 'person' : 'people'
                            }`}
                      </>
                    )}
                  </p>
                </div>

                {isShared && item.role && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      item.role === 'EDITOR'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.role === 'EDITOR' ? 'Editor' : 'Viewer'}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
