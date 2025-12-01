// src/scripts/artifact-bootstrap.ts
import { mountArtifact } from '../components/ArtifactClient';

document.addEventListener('DOMContentLoaded', () => {
  const mounts = Array.from(document.querySelectorAll('.three-mount')) as HTMLElement[];
  if (!mounts.length) return;

  const onIntersect = async (entries: IntersectionObserverEntry[], io: IntersectionObserver) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const container = e.target as HTMLElement;
      await mountArtifact(container);
      io.unobserve(container);
    }
  };

  const io = new IntersectionObserver(onIntersect, { rootMargin: '400px' });
  mounts.forEach(el => io.observe(el));

  // click-to-load fallback
  document.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest('.load-cta') as HTMLElement | null;
    if (!btn) return;
    const parent = btn.closest('.artifact-card')!;
    const container = parent.querySelector('.three-mount') as HTMLElement;
    await mountArtifact(container);
  });
});