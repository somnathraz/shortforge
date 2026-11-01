import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function LoginForm({ className, ...props }: React.ComponentProps<'div'>) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await login(email, password);
      if (result.devFallback) {
        toast.message('Local Desk access', {
          description: 'Set DESK_AUTH_PASSWORD in .env before going Live.'
        });
      } else {
        toast.success('Signed in');
      }
      const next = params.get('next');
      navigate(next && next.startsWith('/') ? next : '/desk', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <form onSubmit={(event) => void onSubmit(event)}>
        <FieldGroup>
          <Field data-invalid={Boolean(error) || undefined}>
            <FieldLabel htmlFor="desk-email">Email</FieldLabel>
            <Input
              id="desk-email"
              type="email"
              autoComplete="username"
              placeholder="you@studio.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              aria-invalid={Boolean(error) || undefined}
              disabled={pending}
            />
          </Field>
          <Field data-invalid={Boolean(error) || undefined}>
            <FieldLabel htmlFor="desk-password">Password</FieldLabel>
            <Input
              id="desk-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              aria-invalid={Boolean(error) || undefined}
              disabled={pending}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <Field>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? (
                <>
                  <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Enter Desk
                  <ArrowRightIcon data-icon="inline-end" />
                </>
              )}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
