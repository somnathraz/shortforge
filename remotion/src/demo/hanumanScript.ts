import type { ClaimType } from './govardhanScript';

/**
 * Demo script #3: "The Sun was never the problem" — Hanuman, the Chalisa's distance, heat and scale.
 * Structure: striking number -> honest caveat -> the real problem (heat) -> scripture supplies the answer -> scale.
 * Narration lines double as on-screen captions (no TTS generated yet).
 *
 * Math: 12,000 x 1,000 x 8 mi = 96M mi (154.5M km) vs 92.96M mi (149.6M km) actual = +3.3%.
 *       At 9 mi/yojana: 108M mi = +16%. Jet 900 km/h -> ~19 yr. Sun volume ~1.3M Earths.
 * To verify before publish: Valmiki Uttara Kanda (Vayu's cooling wind, Indra's vajra, name "Hanuman"),
 * Parker Solar Probe closest approach (~6.1M km) and shield thickness (~11.5 cm).
 */
export type HanumanScene = {
  id: 'hook' | 'math' | 'caveat' | 'distance' | 'heat' | 'vayu' | 'name' | 'scale';
  frames: number;
  claimType?: ClaimType;
  lines: string[];
};

export const hanumanScript: HanumanScene[] = [
  {
    id: 'hook',
    frames: 180,
    lines: ['One line in the Hanuman Chalisa gives the distance to the Sun.', 'And it is off by only three percent.']
  },
  {
    id: 'math',
    frames: 360,
    claimType: 'TRADITION',
    lines: [
      'Yuga, sahasra, yojana: twelve thousand times a thousand times eight miles.',
      'That is 96 million miles.',
      'The real distance from Earth to the Sun is 93 million.'
    ]
  },
  {
    id: 'caveat',
    frames: 270,
    claimType: 'INTERPRETATION',
    lines: [
      'Catch: the Chalisa is Tulsidas’s hymn, not Valmiki’s scripture.',
      'And a yojana can mean eight miles or nine. At nine, the answer drifts sixteen percent.',
      'So treat it as a striking coincidence, not proof.'
    ]
  },
  {
    id: 'distance',
    frames: 330,
    claimType: 'ESTIMATE',
    lines: [
      'Either way, 149.6 million kilometres is vast.',
      'A passenger jet would need nineteen years.',
      'Light takes eight minutes and twenty seconds.'
    ]
  },
  {
    id: 'heat',
    frames: 330,
    claimType: 'ESTIMATE',
    lines: [
      'But distance was never the real problem. Heat was.',
      'The Sun’s surface burns at about 5,500 degrees Celsius.',
      'NASA’s Parker Solar Probe came within 6 million kilometres, behind an 11-centimetre carbon shield.'
    ]
  },
  {
    id: 'vayu',
    frames: 300,
    claimType: 'SCRIPTURE',
    lines: [
      'The Valmiki Ramayana has the answer.',
      'Baby Hanuman leapt for the Sun, mistaking it for a fruit.',
      'His father Vayu, the wind god, rushed beside him with cooling winds, and the Sun did not burn him.'
    ]
  },
  {
    id: 'name',
    frames: 240,
    claimType: 'SCRIPTURE',
    lines: ['Then Indra struck him with the thunderbolt, and he fell.', 'His jaw, hanu, was wounded. That is how he became Hanuman.']
  },
  {
    id: 'scale',
    frames: 270,
    claimType: 'INTERPRETATION',
    lines: [
      'A child mistook a sphere 1.3 million Earths wide for a fruit.',
      'That is not a story about speed. It is a story about fearlessness.'
    ]
  }
];

export const hanumanTotalFrames = () => hanumanScript.reduce((n, s) => n + s.frames, 0);
