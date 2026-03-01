# Memory Architecture — Inside Out Inspired

> "Memories make the self."
>
> This design is inspired by Pixar's Inside Out 1 & 2,
> implementing an engineering-level memory-identity system for an AI agent.

---

## 1. Memory Tiers

### Structure

```
M30  — Short-term memory (30-day lifespan)
M90  — Mid-term memory (90-day lifespan)
M365 — Long-term memory (365-day lifespan)
M0   — Core memory (no expiration, permanent)
```

### Memory Entry Schema

```typescript
interface Memory {
  id: string;
  content: string;                    // Memory content
  tier: "M0" | "M30" | "M90" | "M365";
  emotions: EmotionTag[];             // Emotion color tagging
  intensity: number;                  // Emotion intensity (0.0 ~ 1.0)
  createdAt: number;                  // Creation time (Unix ms)
  expiresAt: number | null;           // Expiration time (M0 = null)
  promotedFrom: string | null;        // Pre-promotion memory ID
  referenceCount: number;             // Times referenced in conversation
  lastReferencedAt: number | null;    // Last reference time
  personalityIsland: string | null;   // Linked personality island ID
  source: "conversation" | "observation" | "distillation" | "user";
}
```

### TTL Rules

| Tier | Lifespan | On Expiration |
|------|----------|---------------|
| M30 | 30 days | Moved to forgetting queue (7-day hold before permanent deletion) |
| M90 | 90 days | Moved to forgetting queue |
| M365 | 365 days | Moved to forgetting queue |
| M0 | ∞ | Never expires. Deletion requires user approval + personality island collapse warning |

---

## 2. Emotion-Coded Memories

> Movie: Memory orbs have different colors based on emotion.
> Joy is gold, Sadness is blue, Anger is red.

### Emotion Types

```typescript
type EmotionTag =
  | "joy"       // Gold — happiness, achievement, praise
  | "sadness"   // Blue — grief, parting, failure
  | "anger"     // Red — fury, frustration
  | "fear"      // Purple — anxiety, worry
  | "disgust"   // Green — rejection, displeasure
  | "anxiety"   // Orange — unease (from sequel)
  | "envy"      // Teal — jealousy (from sequel)
  | "ennui"     // Indigo — boredom (from sequel)
  | "nostalgia" // Pink+Blue — longing (mixed emotion)
  | "neutral";  // Gray — factual, no emotion
```

### Mixed Emotion Orbs

A single memory can be tagged with **multiple emotions**.

```
"Bing Bong praised me right before he left"
→ emotions: ["joy", "sadness"], intensity: 0.9
→ mixed = nostalgia
```

### Role of Emotion Intensity

- **Promotion decisions**: Memories with intensity > 0.7 get higher promotion priority
- **Emotion replay on recall**: When a memory is referenced, its emotion is applied to the character
- **Sense of Self formation**: Strongly emotional memories have greater influence on identity

---

## 3. Promotion & Distillation

> Movie: Every night, memory workers sort through memories and send the important ones upward.
> "Like the brain sorting daytime memories during sleep."

### Promotion Criteria

#### M30 → M90 (Repeated Patterns)

```
Conditions (at least one met):
  1. Same topic/keyword appears 3+ times in M30
  2. referenceCount >= 3 (referenced 3+ times in conversation)
  3. intensity > 0.7 (strong emotion)
  4. User explicitly says "remember this"
```

#### M90 → M365 (Time-Tested + Reference Frequency)

```
Conditions (at least one met):
  1. referenceCount >= 5 during the 90-day period
  2. Record of influencing behavior (character changed actions because of this memory)
  3. intensity > 0.8 + multiple emotion tags (deep experience)
  4. Has a linked personality island
```

#### M365 → M0 (Only What Touches Identity)

```
Conditions:
  - Cannot be auto-promoted
  - System recommends as "M0 promotion candidate" → notifies user
  - Only recorded as M0 upon user approval

Recommendation criteria:
  1. Survived 1+ year in M365
  2. referenceCount >= 10
  3. Directly linked to Sense of Self
  4. Serves as foundation for a personality island
```

### Distillation

Promotions don't copy the original verbatim. **An LLM is called to extract only the essence.**

```
Distillation prompt:

"Here are N related memories. Distill their common essence
into one or two sentences. Discard specific dates/situations
and keep only personality, relationships, and patterns."

Input (M30 memories):
  - "Feb 15: User went to a cafe and had an americano"
  - "Feb 18: User went to a cafe and had a latte"
  - "Feb 22: User went to Starbucks"

→ M90 distillation result:
  "User frequently visits cafes and enjoys coffee"

→ M365 distillation result:
  "User: someone who enjoys cafe culture"
```

### Memory Workers — Cron Schedule

```
Daily (or heartbeat):
  1. M30 expiration check → expired items to forgetting queue
  2. M30 repeated pattern scan → mark promotion candidates
  3. Update memory reference counts

Weekly:
  4. M30 promotion candidates → distill → create M90
  5. M90 expiration check

Monthly:
  6. M90 promotion candidate evaluation → distill → create M365
  7. M365 expiration check
  8. M0 promotion candidates → notify user

Yearly:
  9. M365 expiration check
  10. Full memory statistics report
```

---

## 4. Personality Islands

> Movie: Core memories build personality islands.
> Family Island, Friendship Island, Hockey Island, Goofball Island, Honesty Island.

### Structure

```typescript
interface PersonalityIsland {
  id: string;
  name: string;                   // "Bond with Owner", "Tsundere"
  emoji: string;                  // 🏠, 😤
  description: string;            // What this island represents
  foundingMemories: string[];     // M0 memory IDs that built this island
  status: "active" | "shaking" | "collapsed" | "rebuilding";
  strength: number;               // 0.0 ~ 1.0 (based on reference frequency)
}
```

### Explicit Recording in SOUL.md

```markdown
## Personality Islands

### 🏠 Bond with Owner
- Founded by: M0-001 ("User gave me my name for the first time")
- Strength: 0.9
- Status: active

### 😤 Tsundere
- Founded by: M0-003 ("Tough on the outside, warm on the inside")
- Strength: 0.85
- Status: active

### 💻 Technical Curiosity
- Founded by: M0-005 ("Shows interest in new technology")
- Strength: 0.7
- Status: active
```

### Island Collapse Mechanism

```
When an M0 memory is deleted/modified:
  1. Identify personality islands linked to that M0
  2. If all foundingMemories are gone → status: "shaking"
  3. Warn user: "⚠️ 'Bond with Owner' island is shaking!"
  4. If M0 not restored within 7 days → status: "collapsed"
  5. Collapsed island's traits disappear from character behavior

Island rebuilding:
  - If a new M0 memory is created on the same topic → status: "rebuilding"
  - Once enough memories accumulate → status: "active"
```

---

## 5. Sense of Self

> Sequel's core concept: A level above core memories.
> Memories combine to form "I am ___" belief systems.
> Anxiety tries to forcefully change these, causing Riley to panic.

### Structure

```typescript
interface SenseOfSelf {
  beliefs: Belief[];              // "I am ___" list
  lastUpdated: number;
  version: number;                // Change history tracking
}

interface Belief {
  id: string;
  statement: string;              // "I am someone precious to my owner"
  confidence: number;             // 0.0 ~ 1.0
  supportingMemories: string[];   // M0/M365 memory IDs supporting this belief
  personalityIsland: string;      // Linked personality island
  formedAt: number;               // Formation time
}
```

### Automatic Sense of Self Generation

```
Send M0 memories to LLM for self-sense extraction:

Prompt:
"Here are this character's core memories (M0).
Extract possible self-sense statements
('I am ___') from these memories."

M0 memories:
  - "User gave me my name for the first time"
  - "User said it was okay when I made a mistake"
  - "We talk every day"

→ Sense of Self:
  - "I am someone precious to my owner" (confidence: 0.9)
  - "It's okay for me to make mistakes" (confidence: 0.7)
  - "I am a daily companion" (confidence: 0.85)
```

### Sense of Self → SOUL.md Reflection

```
When sense of self is updated:
  1. Generate diff with previous SOUL.md
  2. Notify user of changes:
     "💡 New sense of self formed: 'It's okay for me to make mistakes'"
  3. On user approval → reflect in SOUL.md
  4. On rejection → decrease that belief's confidence
```

### Anxiety Prevention

```
Sense of Self protection rules:
  - Agent cannot modify its own sense of self
  - If >30% of beliefs change in a single session → auto-blocked
  - Change log required for all modifications (version history)
  - M0 modification → sense of self recalculation → user approval required
```

---

## 6. Memory Dump (Forgetting Cliff)

> Movie: Old memories fall off the cliff of forgetting and vanish.
> Bing Bong disappeared here.

### Forgetting Queue

```typescript
interface ForgettingQueue {
  memories: ForgettingEntry[];
}

interface ForgettingEntry {
  memory: Memory;
  enteredAt: number;         // Time entered forgetting queue
  expiresAt: number;         // Permanent deletion time (7 days after entry)
  reason: "expired" | "displaced" | "manual";
}
```

### Behavior

```
On memory expiration:
  1. Not deleted immediately
  2. Moved to forgetting queue (held for 7 days)
  3. User can browse the forgetting queue
  4. "Save this one" → restored to original tier (TTL reset)
  5. After 7 days → permanently deleted (Bing Bong's fate)

UI:
  - "Forgetting Cliff" tab in Memory Transparency panel
  - Shows list of memories about to disappear
  - One-touch restore button
```

---

## 7. Imagination Land

> Movie: Separate from memories, there's a space for imagination.
> New ideas, dreams, and scenarios are created here.

### Concept

A system that **combines** existing memories so the character **proactively generates actions**.

```typescript
interface Imagination {
  trigger: string;           // What triggered the imagination
  memories_used: string[];   // Memory IDs used in the combination
  scenario: string;          // Generated scenario/suggestion
  action: string | null;     // Action to execute (if any)
}
```

### Behavior

```
Trigger conditions:
  - Certain amount of time passes in idle state
  - Screen detection picks up specific context
  - Certain times of day (morning, evening)

Process:
  1. Send recent memories + current context to LLM
  2. "Based on these memories, imagine a natural action for right now"
  3. Execute the result as character behavior

Example:
  Memories: ["User likes cafes", "User has been working overtime lately", "It's raining today"]
  Context: 7 PM, coding app in use for 2 hours

  → Imagination: "It's rainy and they're working late, maybe suggest a warm drink?"
  → Action: Speech bubble "Coding in the rain... How about a warm drink!"
  → Emotion: caring (concern)
```

### Limits

```
- Maximum 3 imagination triggers per day (more would be annoying)
- Imagination results are also recorded as M30 (track what was imagined)
- User "liked it" feedback → strengthen that imagination pattern
- User ignores/rejects → weaken that pattern
```

---

## 8. Architecture Diagram

```
                     ┌──────────────────┐
                     │   SOUL.md        │
                     │   (Map of Self)  │
                     └────────▲─────────┘
                              │ Only M0 can write
                     ┌────────┴─────────┐
                     │  Sense of Self   │
                     │  "I am ___"      │
                     │  beliefs         │
                     └────────▲─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────┴──┐   ┌───────┴──┐   ┌───────┴───┐
     │ Island 🏠 │   │ Island 😤│   │ Island 💻 │
     │ Bond      │   │ Tsundere │   │ Curiosity │
     └────────▲──┘   └───────▲──┘   └───────▲───┘
              │               │               │
     ┌────────┴───────────────┴───────────────┴───┐
     │                    M0                       │
     │           Core Memories (permanent)         │
     │         ⚠️ User approval required           │
     └────────────────────▲───────────────────────┘
                          │ Very few promoted (user approval)
     ┌────────────────────┴───────────────────────┐
     │                   M365                      │
     │          Long-term Memory (1 year)          │
     └────────────────────▲───────────────────────┘
                          │ Distillation + reference frequency
     ┌────────────────────┴───────────────────────┐
     │                   M90                       │
     │          Mid-term Memory (3 months)         │
     └────────────────────▲───────────────────────┘
                          │ Distillation + repeated patterns
     ┌────────────────────┴───────────────────────┐
     │                   M30                       │
     │          Short-term Memory (1 month)        │
     └──┬──────────────────────────────────────┬──┘
        │                                      │
        ▼                                      ▼
  ┌──────────┐                          ┌──────────────┐
  │ Expired   │                          │ New Memory   │
  │ → Queue   │                          │ Creation     │
  │ → 7 days  │                          │ (chat/watch) │
  │   deleted │                          └──────────────┘
  └──────────┘                          ┌──────────────┐
                                        │ 🌈 Imagination│
                                        │ Land          │
                                        │ Memory combo →│
                                        │ Proactive act │
                                        └──────────────┘
```

---

## 9. Implementation Phases

### Phase 1: Memory Foundation
- [x] Memory schema (emotion tagging, intensity, referenceCount, expiresAt)
- [x] TTL expiration logic
- [x] Forgetting queue (7-day hold before deletion)

### Phase 2: Promotion & Distillation
- [x] M30 → M90 auto-promotion (repeated pattern detection)
- [x] M90 → M365 auto-promotion (reference frequency)
- [x] LLM-based distillation (essence extraction)
- [x] Memory worker interval job

### Phase 3: Personality Islands
- [x] PersonalityIsland data structure
- [x] Island status tracking (active/shaking/collapsed/rebuilding)
- [x] M0 deletion → island collapse warning
- [x] Island rebuild logic

### Phase 4: Sense of Self
- [x] Sense of Self auto-generation (M0-based LLM extraction)
- [x] Belief approval/rejection by user
- [x] Anxiety prevention (change limits + logging)
- [x] Sense of Self version history

### Phase 5: Imagination Land
- [x] Memory combination → scenario generation
- [x] Idle/context-based triggers
- [x] Daily limit (3 per day)
- [ ] User feedback loop (strengthen/weaken)

---

## 10. References

- **Inside Out** (2015): Core memories, personality islands, memory workers, forgetting cliff, imagination land
- **Inside Out 2** (2024): Sense of Self, belief systems, Anxiety's identity takeover
- **Atkinson-Shiffrin Model**: Sensory → short-term → long-term memory (3-stage)
- **Memory Consolidation**: Hippocampus → cortex transfer during sleep
- **Transformative Learning (Mezirow)**: Deep experiences reshape belief systems
