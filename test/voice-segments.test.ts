import assert from 'node:assert/strict';
import test from 'node:test';
import { EpisodeSchema } from '../src/schema/episode.js';
import { defaultSarvamVoiceCast } from '../src/schema/voiceCast.js';
import { mockEpisode } from '../src/providers/mock.js';
import {
  expandEpisodeVoicePlan,
  resolveSpokenHook
} from '../src/lib/ttsScript.js';

test('multi-voice cast and segments stay stable when production drafts are edited', () => {
  const raw = mockEpisode('The warrior Bhishma refused to fight') as {
    id: string;
    spokenHook: unknown;
    voiceCast?: unknown;
    characterVoiceMap?: unknown;
    scenes: Array<{ id: number; voiceSegments?: unknown }>;
  };
  raw.id = 'why-bhishma-lowered-his-bow';
  raw.spokenHook = {
    textHi: 'भीष्म ने अम्बा और अर्जुन के सामने अपना धनुष क्यों झुकाया?',
    voiceRole: 'NARRATOR',
    delivery: 'curious',
    estimatedDurationSeconds: 6
  };
  raw.voiceCast = defaultSarvamVoiceCast();
  raw.characterVoiceMap = {
    Bhishma: 'MALE_ELDER',
    Amba: 'FEMALE_CHARACTER',
    Arjuna: 'MALE_CHARACTER'
  };
  raw.scenes.find((scene) => scene.id === 2)!.voiceSegments = [
    {
      id: '2a',
      type: 'NARRATION',
      speaker: 'NARRATOR',
      voiceRole: 'NARRATOR',
      textHi: 'अम्बा ने भीष्म की ओर देखा।'
    },
    {
      id: '2b',
      type: 'DIALOGUE',
      speaker: 'Amba',
      voiceRole: 'FEMALE_CHARACTER',
      textHi: 'यह प्रतिज्ञा अधूरी नहीं रहेगी।'
    }
  ];
  raw.scenes.find((scene) => scene.id === 3)!.voiceSegments = [
    {
      id: '3a',
      type: 'DIALOGUE',
      speaker: 'Bhishma',
      voiceRole: 'MALE_ELDER',
      textHi: 'मैं अपनी प्रतिज्ञा नहीं तोड़ूँगा।'
    }
  ];
  raw.scenes.find((scene) => scene.id === 4)!.voiceSegments = [
    {
      id: '4a',
      type: 'DIALOGUE',
      speaker: 'Arjuna',
      voiceRole: 'MALE_CHARACTER',
      textHi: 'पितामह, मुझे क्षमा कीजिए।'
    }
  ];
  const episode = EpisodeSchema.parse(raw);
  assert.equal(episode.id, 'why-bhishma-lowered-his-bow');
  assert.equal(typeof episode.spokenHook, 'object');
  assert.ok(resolveSpokenHook(episode).includes('भीष्म'));
  assert.equal(episode.voiceCast?.NARRATOR?.speaker, 'shubh');
  assert.equal(episode.voiceCast?.MALE_ELDER?.speaker, 'anand');
  assert.equal(episode.characterVoiceMap?.Bhishma, 'MALE_ELDER');
  assert.equal(episode.characterVoiceMap?.Amba, 'FEMALE_CHARACTER');

  const scene2 = episode.scenes.find((scene) => scene.id === 2)!;
  assert.equal(scene2.voiceSegments?.[1]?.speaker, 'Amba');
  assert.equal(scene2.voiceSegments?.[1]?.type, 'DIALOGUE');

  const plan = expandEpisodeVoicePlan(episode);
  assert.ok(plan.some((item) => item.relativePath === 'hook.wav'));
  const dialogue = plan.filter((item) => item.type === 'DIALOGUE');
  assert.equal(dialogue.length, 3);
  assert.equal(dialogue.find((d) => d.speaker === 'Bhishma')?.profile.speaker, 'anand');
  assert.equal(dialogue.find((d) => d.speaker === 'Amba')?.profile.speaker, 'ritu');
  assert.equal(dialogue.find((d) => d.speaker === 'Arjuna')?.profile.speaker, 'aditya');
});
