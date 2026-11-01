import { Navigate, useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-8">
        <div className="flex w-full max-w-sm flex-col gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return children;
}
