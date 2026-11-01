export function mockEpisode(topic: string): unknown {
  const narrations = [
    'एक ऐसा वीर, जो अपनी ही अपार शक्ति भूल चुका था।',
    'बचपन में हनुमान सूर्य को पका हुआ फल समझ बैठे।',
    'उनकी शरारतों से तपस्वी ऋषियों की साधना टूटती थी।',
    'तब ऋषियों ने कहा—शक्ति तब तक भूली रहेगी, जब तक कोई याद न दिलाए।',
    'वर्षों बाद समुद्र किनारे वानर सेना निराश खड़ी थी।',
    'तभी जाम्बवान ने हनुमान को याद दिलाया—वे कौन हैं।',
    'स्मृति लौटी, रूप विराट हुआ—शक्ति जगाने को सही आवाज़ चाहिए।'
  ];
  const hookSeconds = 5;
  const sceneSeconds = 5;

  return {
    id: `mock-${Date.now()}`,
    storyKind: 'CANONICAL_MYTHOLOGY',
    topic,
    titleHi: 'हनुमान अपनी शक्ति क्यों भूल गए?',
    titleEn: 'Why Hanuman Forgot His Powers',
    hookHi: 'जिस शक्ति से पर्वत हिल सकते थे, हनुमान उसी शक्ति को भूल कैसे गए?',
    spokenHook: 'जिस शक्ति से पर्वत हिलते थे, हनुमान उसे भूल कैसे गए—किसने जगाई?',
    spokenHookDurationSeconds: hookSeconds,
    hookDelivery: 'curious',
    featuredLords: [
      {
        nameEn: 'Lord Hanuman',
        nameHi: 'भगवान हनुमान',
        importance: 'primary',
        visualIdentity:
          'Divine vanara Lord Hanuman with monkey face, clear simian features, visible monkey tail, orange-saffron dhoti, golden ornaments, heroic calm expression',
        doNotConfuseWith: 'a human warrior without simian features, or a generic blue Hindu god'
      },
      {
        nameEn: 'Jambavan',
        nameHi: 'जाम्बवान',
        importance: 'supporting',
        visualIdentity: 'Wise bear-king elder Jambavan, dignified aged bear form, not a human child',
        doNotConfuseWith: 'a human boy or a generic forest animal mascot'
      }
    ],
    targetDurationSeconds: hookSeconds + narrations.length * sceneSeconds,
    audience: 'GENERAL_FAMILY',
    fictionDisclosureRequired: false,
    sourceReview: {
      status: 'NEEDS_REVIEW',
      claimsToVerify: ['बाल हनुमान ने सूर्य को फल समझा।', 'ऋषियों के शाप से हनुमान अपनी शक्ति भूल गए।'],
      notes: ['प्रकाशन से पहले मान्य रामायण संस्करण और विद्वत टिप्पणी से जाँचें।']
    },
    scenes: narrations.map((narrationHi, index) => ({
      id: index + 1,
      startSecond: hookSeconds + index * sceneSeconds,
      durationSeconds: sceneSeconds,
      narrationHi,
      visualPrompt:
        index === 5
          ? `Jambavan reminds Lord Hanuman of his true power on the ocean shore, respectful cinematic Indian epic lighting`
          : `Lord Hanuman in respectful cinematic Indian epic scene ${index + 1}, detailed lighting`,
      camera: index % 2 ? 'slow pan' : 'slow push in',
      importance: index === 6 ? 10 : 6,
      renderMode: index === 0 || index === 6 ? 'AI_VIDEO' : 'STILL',
      soundCue: index === 6 ? 'power surge' : 'cinematic ambience',
      appearingLords: index === 5 ? ['Lord Hanuman', 'Jambavan'] : ['Lord Hanuman']
    })),
    ending: {
      payoffHi: 'हनुमान ने महासागर लांघने को पहली विराट छलांग लगाई।',
      nextEpisodeTeaseHi: 'लेकिन लंका के रास्ते में तीन परीक्षाएँ उनका इंतज़ार कर रही थीं।'
    },
    metadata: {
      descriptionHi: 'जाम्बवान द्वारा हनुमान को उनकी भूली शक्ति याद दिलाने की प्रचलित कथा।',
      keywords: ['हनुमान', 'रामायण', 'जाम्बवान', 'पौराणिक कथा'],
      thumbnailTextHi: 'हनुमान शक्ति क्यों भूले?'
    }
  };
}
