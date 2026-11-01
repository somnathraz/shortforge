/**
 * Demo script: "How heavy was Govardhan?" — EpicAstra Explained format.
 * Narration lines double as on-screen captions (no TTS generated for this demo).
 * Every beat carries a claimType so the screen never presents an assumption as scripture.
 */
export type ClaimType = 'SCRIPTURE' | 'ESTIMATE' | 'ASSUMPTION' | 'INTERPRETATION' | 'TRADITION';

export type DemoScene = {
  id: 'hook' | 'source' | 'size' | 'weight' | 'compare' | 'close';
  frames: number;
  claimType?: ClaimType;
  lines: string[];
};

export const DEMO_FPS = 30;

export const govardhanScript: DemoScene[] = [
  {
    id: 'hook',
    frames: 120,
    lines: ['A seven-year-old boy… and a whole mountain on his hand.', 'So how heavy was that mountain?']
  },
  {
    id: 'source',
    frames: 210,
    claimType: 'SCRIPTURE',
    lines: [
      'The Bhagavata Purana, canto 10, says Krishna held up Govardhan on his left hand for seven days.',
      'And he did it the way a child lifts a mushroom while playing.'
    ]
  },
  {
    id: 'size',
    frames: 210,
    claimType: 'ESTIMATE',
    lines: [
      'Today, Govardhan Hill is about 8 kilometres long and 25 metres high.',
      'There is no proof of its ancient size, so we assume today’s size.'
    ]
  },
  {
    id: 'weight',
    frames: 240,
    claimType: 'ASSUMPTION',
    lines: [
      'Assume the rock weighs about 2,600 kilograms per cubic metre.',
      'That puts the weight at roughly 130 million tonnes.'
    ]
  },
  {
    id: 'compare',
    frames: 360,
    claimType: 'ASSUMPTION',
    lines: [
      'That equals about 260 Burj Khalifas.',
      'Or 26 billion school bags — over three for every person on Earth.',
      'And an AI supercomputer of 100,000 A100 GPUs? It weighs about one millionth of that.'
    ]
  },
  {
    id: 'close',
    frames: 240,
    lines: [
      'This maths rests on our assumptions, not on proof.',
      'But the scale is clear — this story was never just about strength. It was about trust.'
    ]
  }
];

export const demoTotalFrames = (scenes: DemoScene[] = govardhanScript) =>
  scenes.reduce((n, s) => n + s.frames, 0);

export const CLAIM_LABEL: Record<ClaimType, { en: string }> = {
  SCRIPTURE: { en: 'SCRIPTURE' },
  ESTIMATE: { en: 'ESTIMATE' },
  ASSUMPTION: { en: 'ASSUMPTION' },
  INTERPRETATION: { en: 'INTERPRETATION' },
  TRADITION: { en: 'TRADITION' }
};
