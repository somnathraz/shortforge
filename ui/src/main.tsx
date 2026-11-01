import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/lib/auth';
import { PipelineProvider, usePipeline } from '@/lib/pipeline';
import { PipelineGate } from '@/components/pipeline-gate';
import { RequireAuth } from '@/components/require-auth';
import { HomePage } from '@/pages/home-page';
import { LoginPage } from '@/pages/login-page';
import './index.css';

const App = lazy(() => import('./App'));
const TechStudio = lazy(() => import('./pages/tech-studio').then(module => ({ default: module.TechStudio })));

function DeskWorkspace() {
  const { ready, needsGate, isTech } = usePipeline();
  const [params] = useSearchParams();
  if (!ready || needsGate) return null;
  // Tech default = proven episode Desk (App). Optional motion storyboard UI: /desk?studio=1
  const useTechStudio =
    isTech && (params.get('studio') === '1' || params.get('motion') === '1');
  return (
    <Suspense fallback={<p role="status" className="p-8">Loading studio…</p>}>
      {useTechStudio ? <TechStudio /> : <App />}
    </Suspense>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/desk"
            element={
              <RequireAuth>
                <PipelineProvider>
                  <PipelineGate />
                  <DeskWorkspace />
                </PipelineProvider>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
