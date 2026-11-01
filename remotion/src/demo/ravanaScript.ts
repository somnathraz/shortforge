import type { ClaimType } from './govardhanScript';

/**
 * Demo script #2: "One toe vs ten heads" — Ravana, Kailash and the origin of his name.
 * Narration lines double as on-screen captions (no TTS generated yet).
 * Beats are tagged so scripture, estimates and interpretation never blur together.
 *
 * Sources: Valmiki Ramayana, Uttara Kanda (Kailash episode, naming of "Ravana").
 * Numbers: Kailash ≈ 6,638 m, Burj Khalifa = 828 m, human brain ≈ 20 W, A100 TDP ≈ 400 W.
 */
export type RavanaScene = {
  id: 'hook' | 'name' | 'scale' | 'lift' | 'toe' | 'minds' | 'roar' | 'close';
  frames: number;
  claimType?: ClaimType;
  lines: string[];
};

export const ravanaScript: RavanaScene[] = [
  {
    id: 'hook',
    frames: 180,
    lines: ['The ten-headed king lifted an entire mountain.', 'Then one toe pinned him down.', 'How does that even happen?']
  },
  {
    id: 'name',
    frames: 270,
    claimType: 'SCRIPTURE',
    lines: [
      'He was born Dashagriva — Sanskrit for “ten necks”.',
      'The Valmiki Ramayana, in its Uttara Kanda, tells what happened when he reached Mount Kailash.'
    ]
  },
  {
    id: 'scale',
    frames: 330,
    claimType: 'ESTIMATE',
    lines: [
      'Kailash rises about 6,600 metres.',
      'Stack eight Burj Khalifas and you still only match its height.',
      'This is the mountain he decided to lift.'
    ]
  },
  {
    id: 'lift',
    frames: 300,
    claimType: 'SCRIPTURE',
    lines: [
      'His flying chariot stopped dead above the peak.',
      'Furious, Ravana pushed his twenty arms under the mountain and heaved.',
      'Kailash shook, and everyone on it panicked.'
    ]
  },
  {
    id: 'toe',
    frames: 300,
    claimType: 'SCRIPTURE',
    lines: [
      'Shiva did not rise. He did not even stand.',
      'He simply pressed down with his toe.',
      'Twenty arms against one toe — and the arms were trapped.'
    ]
  },
  {
    id: 'minds',
    frames: 360,
    claimType: 'ESTIMATE',
    lines: [
      'Ravana had ten heads. Count one human brain at about 20 watts, and ten brains draw 200.',
      'A single A100 GPU draws up to 400 watts.',
      'All that brainpower, and none of it taught him when to stop.'
    ]
  },
  {
    id: 'roar',
    frames: 330,
    claimType: 'SCRIPTURE',
    lines: [
      'Crushed, he screamed so loud the three worlds trembled.',
      'Shiva named him for it: Ravana, “the one who roars”.',
      'Ten necks became one cry.'
    ]
  },
  {
    id: 'close',
    frames: 240,
    claimType: 'INTERPRETATION',
    lines: [
      'He could lift a mountain, but not his own ego.',
      'Strength was never the hard part. Humility was.'
    ]
  }
];

export const ravanaTotalFrames = () => ravanaScript.reduce((n, s) => n + s.frames, 0);
