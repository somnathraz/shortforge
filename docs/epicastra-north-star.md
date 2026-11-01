# EpicAstra — product & content north star

**Status:** strategy note — keep this in mind for the next build phase.  
**Not yet shipped:** Instagram comment→DM rewards, retention-learning topic router, multi-episode series packs as first-class objects.

**Second account (tech IG):** same factory, different brand — see [`brands/multi-account-architecture.md`](./brands/multi-account-architecture.md) and [`brands/tech-instagram-north-star.md`](./brands/tech-instagram-north-star.md).

---

## Positioning

**Not enough:** “Beautiful AI mythology videos.”  
Competitors already do that (e.g. Sanatan AI Films–class channels). Attractive AI clips alone do not guarantee a large channel.

**Promise:**

> **EpicAstra — cinematic mysteries, forgotten moments and meanings from Indian mythology, told in under 60 seconds.**

That is **story + curiosity + value** — not just visuals.

---

## Content engine (every episode)

```text
Known character
      ↓
Unknown question
      ↓
Cinematic 45–60 sec story
      ↓
Clear payoff
      ↓
One useful takeaway / reward
      ↓
Reason to return tomorrow
```

**Core rule:** build around **one unanswered question**, never “today we tell the story of…”

| Weak | Better | Stronger |
| --- | --- | --- |
| श्री कृष्ण जन्म कथा | कृष्ण का जन्म जेल में क्यों हुआ? | कृष्ण के जन्म की रात जेल के दरवाज़े अपने आप कैसे खुल गए? |

**Formula to implement in prompts / packaging:**

> Famous character → unfamiliar question → cinematic story → credible payoff → emotional ending → optional useful reward → next episode.

---

## Content pillars to test

| Pillar | Example hook | Why |
| --- | --- | --- |
| Hidden Mystery | हनुमान अपनी शक्तियाँ भूल कैसे गए थे? | Familiar + unknown |
| One Moment Before… | रावण से लड़ने से पहले जटायु ने क्या कहा था? | Suspense |
| Why Did This Happen? | कृष्ण ने गोवर्धन पर्वत क्यों उठाया? | Searchable curiosity |
| Forgotten Character | योगमाया कौन थीं…? | Discovery |
| Divine Object | सुदर्शन चक्र कृष्ण को कैसे मिला? | Visual |
| Myth vs Common Belief | क्या हनुमान सच में…? | Comments |
| Final Decision | कर्ण ने कवच-कुंडल दान क्यों दिए? | Emotion |
| Unexpected Encounter | जब भीम को रास्ते में एक बूढ़ा वानर मिला… | Payoff |
| Festival Mystery | जन्माष्टमी आधी रात को ही क्यों…? | Seasonal |
| Meaning Behind Ritual | दही हांडी का कृष्ण से क्या संबंध है? | Useful knowledge |
| Epic Sacrifice | जटायु जानते थे… फिर भी क्यों लड़े? | Retention |
| Tomorrow's continuation | कृष्ण गोकुल पहुँच गए… अगली सुबह कंस ने क्या किया? | Series loop |

**Launch bias:** Krishna, Hanuman, Shiva, Ramayana, Mahabharata first — then lesser-known characters *through* them.

---

## 60-second structure (engine target)

```text
0–2s     HOOK (question / paradox)
2–10s    Set up the mystery
10–28s   Conflict / background
28–42s   Unexpected information
42–52s   Payoff
52–57s   Meaning / takeaway
57–60s   Continuation CTA (optional — sometimes revelation is enough)
```

Wire this into story generation + packaging, not only into human docs.

---

## Episodic universe (not isolated Shorts)

Example series:

```text
EPICASTRA — KRISHNA: NIGHT OF BIRTH
EP 01  कृष्ण का जन्म जेल में क्यों हुआ?
EP 02  योगमाया कौन थीं?
EP 03  जेल के दरवाज़े कैसे खुले?
EP 04  यमुना ने वासुदेव को रास्ता क्यों दिया?
EP 05  कृष्ण को गोकुल क्यों ले जाया गया?
EP 06  कंस ने अगली सुबह क्या किया?
EP 07  पूतना कृष्ण को मारने क्यों आई?
```

One viral clip should feed the next. Later: first-class `seriesId` / episode order in data model.

---

## Learning loop (after ~20 videos)

Use YouTube Analytics (chose-to-view, AVD, % viewed, retention spikes, subs) so the engine stops guessing:

```text
Krishna mystery → high chose-to-view + high % viewed
  → generate more of that structure
Generic biography → weak
  → downrank
```

---

## Instagram growth: comment keyword → DM reward (later)

**Do not** promise “subscribe and I’ll DM” (can’t verify; YT ≠ IG).

**Do** on Reels:

> कृष्ण का छोटा मंत्र + अर्थ चाहिए? Comment **KRISHNA** — हम DM करेंगे।

Pipeline to build when ready:

```text
Reel published
  → viewer comments keyword
  → Meta webhook
  → EpicAstra matches keyword
  → private reply / DM within 7 days (API rules)
  → mantra + meaning + optional wallpaper
```

Meta supports private reply to a commenter within seven days; further messages need user reply. Fits permissions already on the app path.

### Rewards worth commenting for

- Mantra card (text + simple meaning)
- Phone wallpaper
- **Source card** (“इस कथा का संदर्भ कहाँ मिलता है?”) — trust differentiator
- Festival card
- 7-day series opt-in
- Character card (powers, links, one lesser-known fact)
- Short mantra audio
- Vote next story (`KALIYA` / `GOVARDHAN`)

**Hard no:** fake miracle / wealth claims. Keep rewards **devotional + educational**. Trust is a competitive advantage vs generic AI mythology pages.

---

## What EpicAstra should become

Not only an **AI content generator**.

An **episodic mythology universe** that is:

> cinematic enough to entertain, trustworthy enough to learn from.

---

## Near-term product implications (when we implement)

1. Story prompts: question-hook + pillar + series continuity fields.  
2. Packaging: suspense titles / Hinglish hooks already lean this way — keep tightening.  
3. `narrationStyle` + Sound Director: serve mystery / devotion / revelation tones.  
4. Later: Instagram comment keyword → reward DM automation.  
5. Later: analytics → topic/structure router.

Until those ship, **every manual and prompt decision should still aim at this north star.**
