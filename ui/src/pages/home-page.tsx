import { Link } from 'react-router-dom';
import { ArrowRightIcon, ClapperboardIcon, KeyRoundIcon, UploadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

const CREATE_STACK = [
  {
    stage: 'Story',
    title: 'Script from a topic',
    copy: 'Turn a hook into a timed short-form script with scenes, narration, and payoffs.',
    tools: ['OpenRouter', 'OpenAI', 'Ollama', 'Groq']
  },
  {
    stage: 'Voice',
    title: 'Natural narration',
    copy: 'Generate spoken audio for every beat — free Edge voices or premium TTS when you add keys.',
    tools: ['Edge TTS', 'Sarvam', 'ElevenLabs']
  },
  {
    stage: 'Visuals',
    title: 'Scene stills & motion',
    copy: 'Build 9:16 frames, then optional AI video clips before the final assemble.',
    tools: ['Gemini', 'Pollinations', 'Wan 2.2', 'ComfyUI']
  },
  {
    stage: 'Finish',
    title: 'Mix & assemble',
    copy: 'Layer sound, captions, and cuts into a publish-ready Short with local tooling.',
    tools: ['FFmpeg', 'Sound Director', 'BGM · SFX']
  }
] as const;

export function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="home-page">
      <header className="home-nav">
        <div className="home-nav-inner">
          <Link to="/" className="home-nav-brand">
            <span className="home-nav-mark" aria-hidden>
              SF
            </span>
            <span className="home-nav-wordmark">
              <span className="home-nav-name">Shortforge</span>
              <span className="home-nav-tag">Shorts · Reels · Publish</span>
            </span>
          </Link>

          <nav className="home-nav-links" aria-label="Primary">
            <a href="#create">Create</a>
            <a href="#publish">Publish</a>
            <a href="#setup">Your keys</a>
          </nav>

          <div className="home-nav-actions">
            {isAuthenticated ? (
              <Button asChild size="sm" className="home-nav-cta">
                <Link to="/desk">
                  Open studio
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            ) : (
              <>
                <Link to="/login" className="home-nav-signin">
                  Sign in
                </Link>
                <Button asChild size="sm" className="home-nav-cta">
                  <Link to="/login">
                    Get started
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="home-hero">
        <div className="home-hero-veil" aria-hidden />
        <div className="home-hero-grid" aria-hidden />
        <div className="home-hero-orb home-hero-orb-a" aria-hidden />
        <div className="home-hero-orb home-hero-orb-b" aria-hidden />

        <div className="home-hero-frame">
          <div className="home-hero-copy">
            <p className="home-hero-kicker">Self-hosted video studio</p>
            <h1 className="home-hero-brand">Shortforge</h1>
            <p className="home-hero-headline">
              Forge cinematic Shorts and Reels from a topic — script, voice, visuals, final cut —
              then publish with your own keys and developer apps.
            </p>
            <div className="home-hero-actions">
              <Button asChild size="lg">
                <Link to={isAuthenticated ? '/desk' : '/login'}>
                  {isAuthenticated ? 'Back to studio' : 'Open Shortforge'}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="home-hero-secondary">
                <a href="#create">See the stack</a>
              </Button>
            </div>
            <p className="home-hero-meta">
              <span>Topic → script</span>
              <span aria-hidden>·</span>
              <span>Voice & visuals</span>
              <span aria-hidden>·</span>
              <span>Publish with your setup</span>
            </p>
          </div>

          <div className="home-hero-stage" aria-hidden>
            <div className="home-hero-reel">
              <div className="home-hero-reel-bar">
                <span />
                <span />
                <span />
              </div>
              <div className="home-hero-reel-screen">
                <p className="home-hero-reel-label">Video studio</p>
                <p className="home-hero-reel-title">From blank topic to live Short</p>
                <div className="home-hero-reel-steps">
                  <span className="is-done">Script</span>
                  <span className="is-done">Voice</span>
                  <span className="is-active">Visuals</span>
                  <span>Publish</span>
                </div>
              </div>
              <div className="home-hero-reel-caption">Bring your own keys</div>
            </div>
            <div className="home-hero-stack">
              <div className="home-hero-stack-card home-hero-stack-a">
                <span>Create</span>
                <strong>Story to final cut</strong>
              </div>
              <div className="home-hero-stack-card home-hero-stack-b">
                <span>Publish</span>
                <strong>Your apps · your accounts</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="create" className="home-section">
        <div className="home-section-inner">
          <p className="home-section-kicker">Create</p>
          <h2 className="home-section-title">Everything that builds the Short.</h2>
          <p className="home-section-lede">
            One desk for the full craft path. You plug in providers — we wire the workflow from topic
            to a finished 9:16 file.
          </p>

          <div className="home-stack-grid">
            {CREATE_STACK.map((item) => (
              <article key={item.stage} className="home-stack-card">
                <p className="home-stack-stage">{item.stage}</p>
                <h3 className="home-stack-title">{item.title}</h3>
                <p className="home-stack-copy">{item.copy}</p>
                <ul className="home-stack-tools">
                  {item.tools.map((tool) => (
                    <li key={tool}>{tool}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="publish" className="home-section home-section-muted">
        <div className="home-section-inner">
          <p className="home-section-kicker">Publish</p>
          <h2 className="home-section-title">Ship when your accounts are connected.</h2>
          <p className="home-section-lede home-section-lede-tight">
            Desk can upload or schedule — after you finish Meta, Google, and media-hosting setup.
          </p>
          <ul className="home-steps">
            <li>
              <ClapperboardIcon aria-hidden />
              <div>
                <h3>Approve the final cut</h3>
                <p>Watch the Short once. When it feels right, move to publish.</p>
              </div>
            </li>
            <li>
              <KeyRoundIcon aria-hidden />
              <div>
                <h3>Use your developer apps</h3>
                <p>
                  Instagram and Facebook need your Meta app and tokens. YouTube needs your Google
                  OAuth. Reels need a public HTTPS URL (usually S3).
                </p>
              </div>
            </li>
            <li>
              <UploadIcon aria-hidden />
              <div>
                <h3>Upload or schedule</h3>
                <p>
                  Send to Instagram, YouTube, or Facebook from Desk — no manual export-and-reupload
                  loop once setup is done.
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section id="setup" className="home-section">
        <div className="home-section-inner">
          <p className="home-section-kicker">Your keys</p>
          <h2 className="home-section-title">You bring the keys. We run the desk.</h2>
          <p className="home-section-lede">
            Shortforge is self-hosted. It is not a fully managed publish product with shared cloud
            keys or zero developer setup.
          </p>

          <div className="home-pipeline-grid">
            <article className="home-pipeline home-pipeline-heritage">
              <p className="home-pipeline-label">Create</p>
              <h3 className="home-pipeline-name">Your AI providers</h3>
              <p className="home-pipeline-copy">
                Add keys for story, voice, and images in your own <code>.env</code>. Nothing is billed
                through a shared Shortforge account.
              </p>
            </article>
            <article className="home-pipeline home-pipeline-tech">
              <p className="home-pipeline-label">Publish</p>
              <h3 className="home-pipeline-name">Your Meta & Google apps</h3>
              <p className="home-pipeline-copy">
                Create the apps, authorize accounts, and host media yourself. Shortforge uses those
                credentials — it does not skip developer onboarding.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="home-cta">
        <div className="home-cta-inner">
          <h2 className="home-cta-title">Ready to forge the next Short?</h2>
          <p className="home-cta-copy">
            Sign in to Shortforge. Create first if you want — wire publish when your keys and apps
            are ready.
          </p>
          <Button asChild size="lg">
            <Link to={isAuthenticated ? '/desk' : '/login'}>
              {isAuthenticated ? 'Open studio' : 'Sign in'}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="home-footer">
        <span>Shortforge</span>
        <span>BYOK · self-hosted · setup required</span>
      </footer>
    </div>
  );
}
