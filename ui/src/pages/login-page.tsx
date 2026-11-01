import { Link, Navigate } from 'react-router-dom';
import { LoginForm } from '@/components/login-form';
import { useAuth } from '@/lib/auth';
import { Skeleton } from '@/components/ui/skeleton';

export function LoginPage() {
  const { ready, isAuthenticated } = useAuth();

  if (!ready) {
    return (
      <div className="login-stage flex min-h-svh items-center justify-center p-8">
        <Skeleton className="h-72 w-full max-w-md rounded-2xl" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/desk" replace />;
  }

  return (
    <div className="login-stage">
      <div className="login-stage-glow" aria-hidden />
      <div className="login-stage-grain" aria-hidden />

      <div className="relative z-10 mx-auto grid min-h-svh w-full max-w-6xl items-stretch lg:grid-cols-[1.1fr_0.9fr]">
        <section className="login-brand-pane flex flex-col justify-between px-8 py-10 md:px-12 md:py-14">
          <Link to="/" className="login-brand-link w-fit">
            Shortforge
          </Link>
          <div className="login-brand-copy max-w-md">
            <p className="login-kicker">Studio access</p>
            <h1 className="login-title">Sign in to forge and publish.</h1>
            <p className="login-lede">
              Self-hosted Shorts & Reels studio — bring your own AI keys and developer apps.
            </p>
          </div>
          <p className="text-sm text-white/45">BYOK · your setup</p>
        </section>

        <section className="flex items-center justify-center px-6 py-12 md:px-10">
          <div className="login-form-panel w-full max-w-md">
            <div className="mb-8 flex flex-col gap-2">
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                Welcome back
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Enter your email and password to open Shortforge.
              </p>
            </div>
            <LoginForm />
            <p className="mt-8 text-center text-sm text-muted-foreground">
              <Link to="/" className="text-foreground underline-offset-4 hover:underline">
                Back to home
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
