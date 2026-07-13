# Mobile UX & Product Review — Transcript Analysis (Session 1)

> **Source:** `labelled_transcript-mobile-1.txt` (walkthrough of the "Logit" mobile app)
> **Participants:** UX Designer, Engineer (builder/founder), Doctor (GP domain expert)
> **Scope:** Voice/text app that turns spoken clinical cases into structured portfolio entries (Description / Reflection / Learning needs) mapped to curriculum capabilities, for later upload into FourteenFish / RCGP.
> **Prepared as:** consolidated, decision-relevant backlog for product, mobile UX, UI design, research, analytics, iOS, Android, backend, and security teams.

**Platform note:** the transcript never distinguishes iOS from Android anywhere. Per the rule not to infer "both platforms" merely because it is a mobile app, **every item is classified `Platform not stated`**. There are no platform-specific findings.

---

## 1. Executive summary

**What this is.** A walkthrough of "Logit," a voice/text mobile app that helps UK doctors-in-training (initially GPs) turn spoken clinical cases into structured portfolio entries mapped to curriculum capabilities, for later upload into FourteenFish/RCGP.

**Main themes.**
- **De-jargoning the language.** Repeated pushback on technical wording — "analysis," "portfolio," confidence percentages — because they either confuse users or trigger negative association with FourteenFish ("painful"). The strongest cross-cutting need is *warm, plain, action-first copy*.
- **Guest vs. sign-in tension.** Engineer wants near-zero friction (guest mode) for the first 100–1,000 users; UX argues the screen should still lead with "Sign in to save your progress" because losing entries would anger users. Partial resolution reached.
- **Conversation model ambiguity.** The single biggest unresolved UX problem: the system cannot reliably tell whether a user is finished or still adding thoughts (voice one-shot vs. typed short bursts). This drives the "Start analysis" button problem.
- **Reducing cognitive load.** One question at a time, progressive disclosure of tips/examples, hide reasoning/confidence, bigger question text, fewer steps.
- **Domain correctness.** The Doctor corrected two structural misunderstandings: (a) entry *type* is known up-front by users and should be asked first; (b) **PDP goals are strategic and span a whole 6-month review period — not per-case** — which the Engineer conceded is a design mistake to fix in v2.

**Most important user problems.** "Analysis" and "portfolio" wording (confusion + FourteenFish dread); confidence percentages that don't sum to 100; 3-minute countdown causing panic; pause button misleading users into one-shot answers; guest data loss with no merge path; PDP goals mis-modeled.

**Most frequently raised improvements.** Plain-language copy; progressive disclosure (tips, examples, questions one-at-a-time); hide confidence/reasoning behind accordions; NHS-design-system-aligned components; bigger text and touch targets; dark/light theme consistency.

**Confirmed decisions (explicit).** "Portfolio" is banned as the home-screen name; move entry-type selection to the start of the chat; make section titles (Description/Reflection/Learning needs) non-editable; keep guest mode for the first 100–1,000 users then remove it; move the accordion expander to the left; mirror the device light/dark theme; Engineer prefers "Continue chat" over "analysis."

**Major disagreements / alternatives.** Login-screen: dive-straight-in vs. proper sign-in screen (resolved toward sign-in-primary). "Done" button: single "Continue chat" vs. dual "Send and continue / Send and finish." Whether "I will anonymise patient identifiers" consent is even legally needed (unresolved).

**Key bugs / reliability.** Recording lost if the app crashes mid-record (stated technical constraint driving the 3-min limit); pen/arrow icons too close (mis-tap risk); one-tick status misleading; possible colour-contrast failure on hint text; formatting/bullets may not paste cleanly into FourteenFish (unverified).

**Key risks / constraints / open questions.** GDPR explicit-consent adequacy; PII/anonymisation consent necessity; AI hallucination in capability mapping (~9/10 correct, not guaranteed); inability to expose true pipeline stages (competitive concern) limiting accurate progress indicators; hard-coded, randomised copy needs sequencing; no analytics yet for examples/journey behaviour.

---

## 2. Consolidated mobile-app improvements

All rows: **Platform = Platform not stated.**

### Theme: Onboarding — intro / welcome

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-001 | UI improvement | Remove desktop-only button; "Just Talk" mistaken as CTA | Engineer repeatedly read "Just Talk" comparison as the start CTA; an element "looks like a button" | Remove the desktop button on mobile | Intro/welcome | UX, Engineer | "even after…comparison of 'Just Talk,' I thought that was my CTA"; "remove the desktop button" | Not stated | Not stated | Audit intro for stray desktop controls; redesign primary CTA |
| MOB-002 | UX improvement | Match app theme to device light/dark preference | Engineer unsure whether to default light/dark | Mirror the user's phone light/dark setting | First launch/global | UX, Engineer | "Can you match it with the user's preference…Oh yeah, I can actually" | Reduces decisions for Engineer | See MOB-071 (colour mapping) | Implement OS theme mirroring; verify both modes |
| MOB-003 | Content/terminology | Clarify intro is first-time-only + add welcome message | Unclear if intro repeats every launch | "Welcome / thanks for joining me today; we'll take you through a quick…" shown only first time | Intro | UX | "Will this happen every time…? No, just the first time…needs to say Welcome" | Not stated | Not stated | Add first-run welcome copy; gate to first launch |
| MOB-004 | Content/terminology | Rewrite 3-step carousel copy | "We'll do the paperwork" unclear | Step1 "Just Talk — describe your clinical experience…we prompt you with questions"; Step2 "Portfolio-ready in minutes…"; Step3 "Track your progress…before your ARCP" | Intro carousel | UX | "instead of 'We'll do the paperwork'…'We'll ask you some questions'" | Not stated | Content guide (MOB-013) | Finalise carousel copy with content guide |
| MOB-005 | UX improvement | Remove duplicate "Skip" on step 3 | Two buttons do the same thing on step 3 | Remove "Skip" on final step; keep "Let's go" | Intro step 3 | UX, Engineer | "on step three you've got two buttons doing the same thing…Remove 'Skip'" | Not stated | Not stated | Remove Skip on last slide |
| MOB-006 | Content/terminology | Reword "Your portfolio simplified" | Could imply important info is removed | "Building your portfolio, simplified" (process, not portfolio) | Intro | UX | "somebody could…think you're taking out information…it's the process that's simplified" | Not stated | Ties to MOB-023 | Adopt process-framed wording |

### Theme: Registration / login / guest mode

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-007 | Content/terminology | "Try the app" → "Continue as guest" | Wording unclear | Use "Continue as guest" / "Continue without…" | Login | UX | "Instead of 'Try the app'…'Continue as guest'" | Not stated | Not stated | Rename control |
| MOB-008 | UX improvement | Make login a proper sign-in screen | Ambiguous whether to sign in or dive in; risk of lost guest work | **A:** dive straight in. **B (favoured):** Sign-in screen with "Sign in to save your progress" primary + "Continue as guest" secondary (note it won't save data; state it's free) | Login | UX (B), Engineer (initially A) | "the main action…should be 'Sign in', and 'Continue as guest' should be secondary"; Engineer: "Okay, that makes sense" | UX: would be "annoyed if I'd done all those things and then lost them" | Depends on guest-data value + merge (MOB-010) | Design sign-in-primary screen; confirm value copy |
| MOB-009 | UX improvement | Persistent guest data-loss banner + Sign-in CTA | Guests may lose data unknowingly | Always-visible banner: in guest mode, data could be lost → "Sign in" CTA | Guest sessions | UX, Engineer | "always a clear banner…they're in guest mode and could lose their data" | Not stated | Not stated | Implement persistent banner + inline sign-in |
| MOB-010 | Risk or constraint | Guest→existing-account merge not possible | Guest entries can't be merged into a prior account | Find a merge/migration path (complex) | Account | Engineer | "no way to migrate those entries into their old account…more complicated" | Called an "edge case" | Backend merge design | Scope account-merge feasibility |
| MOB-011 | Decision | Keep guest mode for first 100–1,000 users | Sign-in friction deters early trial | Keep guest now; remove guest mode later once word-of-mouth grows | Login | Engineer | "for the first 100 to 1,000 users…keep it…Then I'm going to remove guest mode completely" | Growth-stage rationale | Not stated | Record as staged decision; revisit trigger |

### Theme: Consent / privacy / GDPR

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-012 | UX improvement | Show consent first-time only, before continuing | Unclear if consent repeats | Require consent once (first use), before continuing | Consent | UX, Engineer | "I need it the first time…not every time, but I need consent before they continue" | Not stated | Not stated | Gate consent to first run |
| MOB-013 | Content/terminology | Key-message consistency with website | App copy differs from website ("That's not on the website") | Agree key messages + content guide; one-sentence description reused everywhere | Consent/global | UX | "consistency gives you credibility…This is how we explain it in one sentence" | "credibility" | Website copy | Create content guide / key-message doc |
| MOB-014 | Privacy or security | Explicit GDPR consent checkbox for privacy policy & ToS | "By tapping Continue…" may be insufficient for GDPR | Checkbox: "I agree to the privacy policy and the terms of service" | Consent | UX | "For GDPR, you might need explicit consent…need a checkbox" | GDPR (possible blocker) | Legal confirmation | Legal review of consent mechanism |
| MOB-015 | Content/terminology | TL;DR summary of policy/ToS on website | Users won't read full policy | Collapsible/accordion summary — but place on website privacy page, not in app | Consent → website | UX | "a summary…'This is what it means'…put it on the page. Don't put it here" | "bonus points…nice to have" | Website page live? ("it is up and running") | Add summary section to web privacy page |
| MOB-016 | Privacy or security | "I am a UK doctor in training" checkbox | Need to confirm eligibility | Explicit checkbox / attestation | Consent | UX | "'I am a doctor in UK training'…Make it clear" | Not stated | Not stated | Add attestation checkbox |
| MOB-017 | Privacy or security | "I will anonymise patient identifiers" consent — necessity unresolved + reword | Is this consent needed? Current wording feels threatening; voice lowers guard vs typing | Reword friendlier (not "police will come round"); optional in-record reminder prompt; test real behaviour before strengthening. Redaction is a secondary safety net, not a crutch | Consent / recording | UX, Doctor, Engineer | "'I will' is very strong"; Doctor: "onus is on the doctor…redaction…secondary"; "voice is a different method…letting your guard down" | Potential "blocker" (GDPR) | Legal: is consent required? | Legal check on necessity; reword; add gentle record-time reminder |
| MOB-018 | UI improvement | Remove flashing text on consent | Flashing word distracting | Just tick the box, no flashing | Consent | UX | "not sure about the flashing…just have the box tick" | Not stated | Not stated | Remove flash animation |
| MOB-019 | Accessibility | Consent text-size/readability | Text size questioned | Increase/normalise text size | Consent | UX | "Is this text size?" | Not stated | Not stated | Review type scale on consent |

### Theme: Onboarding — training year & step fatigue

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-020 | Content/terminology | GP-specific training-year question | Generic phrasing feels not-for-me | "What GP specialty training year are you in?" (year 1/2/3). Keep generic templates for later specialties | Onboarding | UX, Engineer | "if the question reflected 'What GP specialty training year…'"; Engineer: "I want GPs to feel like it's specifically meant for them" | "important phase" for GP launch | Multi-specialty roadmap (~5 months) | Add GP-specific copy now; template for scale |
| MOB-021 | UX improvement | Remove/repurpose onboarding progress bar | Progress bar makes it feel like ~8 steps → step fatigue | Either full start-to-finish progress, or remove it here (favoured: remove). Intro isn't a "step" | Onboarding | UX, Engineer | "It looks like there are eight steps…I think you should get rid of it here" | "step fatigue" | Sign-in adds steps (email/OTP) | Remove/rethink progress indicator |
| MOB-022 | UX improvement | Skip generic first step; go straight to training-year question | Extra generic step unnecessary since specialty known | Dive straight into "What training year are you in?" | Onboarding | UX, Engineer | "You don't need the first step…dive in with the question" | Not stated | Not stated | Cut the generic step |

### Theme: Home / dashboard

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-023 | Decision | "Portfolio" banned for home name; find alternative | Users' real portfolio is FourteenFish; guests have no portfolio yet | "Portfolio" off the cards. Candidates: "dashboard" (Doctor lukewarm), "diary" (rejected). Needs a distinct term | Home | Doctor, UX, Engineer | "Their portfolio is FourteenFish. This needs to be called something else"; "'Portfolio' is off the cards" | Domain-critical | Naming still open | Run naming exploration; pick non-"portfolio" term |
| MOB-024 | UX improvement | Different home message for guest vs logged-in | Guest ≠ owner of a portfolio | Guest: action-first "Start your first…/What clinical case did you have today?"; logged-in: possessive welcome | Home | UX | "in guest mode…'Start your first…'…for the logged-in account…nice" | Aim: get guests to log something | Depends on guest/auth state | Design two home states |
| MOB-025 | Content/terminology | Primary home CTA wording | "Start your reflection/entry" too lofty; "portfolio" triggers FourteenFish dread | Alternatives debated: "Start your reflection" (too narrow), "Start your entry" (too form-like), **"Talk about your case" / "Record your case"** (Doctor: "case is the right word") | Home | UX, Doctor, Engineer | "The minute people see 'portfolio' they'll associate it with…how painful FourteenFish is"; "'Case' is the right word" | Anti-FourteenFish friction | Ties to MOB-028/029 | Adopt "case"-based CTA; brainstorm lighter verb |
| MOB-026 | UX improvement | Rotating prompts under a fixed primary CTA | Should the main CTA text change each visit? | Keep primary CTA constant (core action); rotate 10–15 sub-prompts ("What challenged you?", "What did you find interesting?") | Home | UX, Engineer | "leading line should stay the same…prompts underneath can change" | "primary action in the app" | Copy cycles (not hard-coded) | Fix primary CTA; build prompt rotation set |
| MOB-027 | UX improvement | First-time "You're set up for general practice" confirmation | Reassure the app listened | Show once: "Here's how it works. You're set up for general practice" | Home (first time) | UX, Engineer | "it confirms that we've listened to you" | Not stated | First-run only | Add first-run confirmation banner |

### Theme: Chat / voice input

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-028 | UX improvement | Chat layout vs expected centered-mic start | UX expected a centred microphone start screen, got a chat layout | Reconcile expectation: distinct "start" affordance or make the input eye-catching | Chat/input | UX | "I was expecting the start screen with the microphone…wasn't expecting a chat layout" | Not stated | Ties to MOB-031 | Usability test the entry point |
| MOB-029 | Content/terminology | Clarify input accepts text + voice | "Talk" implies must speak | "Talk or type about it"; consider "Start writing your case"/"Present your patient" | Chat/input | UX | "The issue with 'talk' is that people immediately think they need to speak…'Talk or type about it'" | Not stated | Not stated | Add text+voice affordance and copy |
| MOB-030 | UI improvement | Remove mic icon from record button | Icon reads as "must record"; button ambiguous | "Record your case" without the icon | Chat/input | UX, Engineer | "'Record your case' without the icon is the best balance" | Not stated | Not stated | Remove icon; relabel |
| MOB-031 | UI improvement | Input/record button looks disabled | Eyes drawn to helper content, not the input; button looks disabled | Strengthen visual hierarchy so the input is the clear primary action; helper text secondary | Chat/input | UX | "The button actually looks disabled. My eyes need to be drawn to it" | Not stated | Not stated | Redesign input emphasis |
| MOB-032 | UX improvement | 3-minute recording countdown causes panic | Countdown creates stress mid-recording | Reconsider/remove visible limit; convey conversational multi-message model. Constraint: long single recordings risk loss on crash | Recording | UX, Engineer | "It creates panic…the countdown adds extra stress"; Engineer: "if…the app crashes, you lose that recording" | Panic/stress signal | Recording reliability, MOB-033 | Decide limit vs UX; if kept, hide countdown |
| MOB-033 | UX improvement | Deliver tips as first AI chat bubble | Tips block feels heavy; conversational model hard to grasp | First AI message: "Hey there, what do you want to talk about today?…Send as many messages as you need, by text or voice." Progressive disclosure | Chat/input | UX, Engineer | "This could be delivered in a conversation bubble…'Send as many messages as you need'" | "hardest thing…to get my head around" | Not stated | Convert tips to first AI message |
| MOB-034 | UX improvement | Remove pause button (misleading) | User hit pause assuming one-shot answer required | Remove pause button, at least for first messages | Recording | UX, Engineer | "The pause button makes me think I have to give you everything in one go"; "Actually, I'll remove the pause button" | Not stated | Not stated | Remove/defer pause control |
| MOB-035 | UI improvement | Two ticks for message status | One tick implies not delivered to AI | Show two ticks (WhatsApp semantics): sent vs processed-by-AI | Chat | UX, Engineer | "One tick makes me think it hasn't been delivered to the AI…should show two ticks" | Not stated | Status model definition | Adopt two-tick delivered/processed states |
| MOB-036 | UI improvement | Label transcribed voice text "Transcription" | Unclear that text is the transcription of speech | Add "Transcription" title — only for voice messages, not typed | Chat | UX, Engineer | "Can you add a title to that, like 'Transcription'?" | Not stated | Not stated | Add transcription label for voice |
| MOB-056 | Technical improvement | Clean filler words from transcription | Users say "uh/um" a lot | Strip fillers from cleaned content | Transcription | UX, Engineer | "People will use 'uh' and 'um' a lot, but I need to make sure they're cleaned out" | Not stated | Not stated | Verify filler-word cleaning |

### Theme: "Analysis" action & finished-detection

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-037 | Content/terminology | Replace "Start/Continue analysis" wording | "Analysis" too technical/jargon; user unsure what it means | Alternatives: "Continue chat" (favoured), "What's next?", "Take me to the next step", "Over to you". Avoid "I'm done" (implies leaving) | Chat | UX, Engineer | "'Continue analysis' is very technical"; "I like 'Continue chat' more" | Not stated | Depends on MOB-038 | Adopt "Continue chat"; test comprehension |
| MOB-038 | Open question | Detect user finished vs still adding | System can't tell one-shot voice from typed short bursts | **A:** single "Continue chat"; **B:** dual "Send and continue"/"Send and finish"; **C (deferred):** AI auto-detects "I've got enough" | Chat | UX, Engineer | "We need a way for the user to say 'I'm finished…Continue'"; "assuming everybody will use voice…some will send short bursts" | "still struggling…bothers me too" | AI capability; behaviour unknown | Prototype done-signal; instrument actual usage |

### Theme: Entry-type classification & confidence

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-039 | Decision | Move entry-type selection to start of chat | Type chosen after dumping info; users usually already know the type | Ask entry type first ("What type of entry is this?"); warms users up; easy decision. Don't auto-select | Chat start | Engineer, UX, Doctor | "I think I'll ask up front…This section should be at the beginning"; Doctor: "FourteenFish asks you to choose…" | "one less thing to worry about" | Architecture change (Engineer: next version) | Reorder flow: type-first |
| MOB-040 | UX improvement | Confidence percentages confusing | Percentages don't sum to 100; users may expect them to; not labelled as confidence | Remove percentages at classification stage; keep confidence later for capability tagging | Classification | UX, Engineer | "It would be unusual for percentages not to add up to 100%…confuse or worry people" | Not stated | Ties to MOB-058 | Remove % at type step |
| MOB-041 | UI improvement | Entry-type reasoning expander too small / not button-like | "Why I think it's this type" control too small; not obviously tappable | Keep first item expanded by default; make control obviously actionable. Reasoning here low-value | Classification | UX, Engineer | "the button is too small…keep the first one expanded" | Not stated | Not stated | Enlarge/label; expand-first pattern |
| MOB-042 | UX improvement | Show top 3 type suggestions not 5 | Too much to read | Show top 3 + "see more" | Classification | UX | "make it even shorter and just show the top three, plus…see more" | Not stated | Not stated | Reduce default list to 3 |
| MOB-043 | Feature request | Backlog: AI suggests alternative entry type | GPs struggle to find e.g. a significant/learning event | "This entry could also be a significant/learning event" (an entry can't be duplicated across categories). Doctor: usually you already know → low value | Classification | Engineer, Doctor | Engineer: "backlog idea: 'Did you know this might also work as…'"; Doctor: "probably not" | Deferred to backlog | Value uncertain | Park as backlog; validate demand |

### Theme: Loading / progress feedback

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-044 | UX improvement | Sequence "Thinking" states + limit to 2–3 | ~15 random phrases; serious product shouldn't feel random; too many to read in 5–15s | Ordered, progress-reflecting stages ("Message received → Reading → Preparing response"), 2–3 max. Use generic stages (avoid exposing pipeline) | Loading | UX, Engineer | "should reflect progress"; "Two or three would be fine"; "don't want to expose my internal architecture" | Not stated | No direct stage signal available | Define 2–3 generic ordered stages |

### Theme: Follow-up questions

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-045 | UX improvement | One follow-up question at a time (confirmed good) | Showing many questions caused users to lose track copy-pasting | Keep single-question flow; step-by-step focus | Follow-ups | UX, Engineer | "I showed 30 or 40 questions…lost track"; "Just focus on that and forget everything else" | Praised | Not stated | Retain pattern |
| MOB-046 | UX improvement | Don't show exact remaining-question count | Count inaccurate (one answer can cover several sections; big entries hit 12–13 → fatigue) | "A few more questions. Let's start here" — no number | Follow-ups | Engineer, UX | "that answer might cover three sections…seven questions become four"; "I don't think you need to put a number on it" | Fatigue risk on big entries | Not stated | Use vague count copy |
| MOB-047 | Content/terminology | Sequence hard-coded copy; UX review of 15 variants | ~15 randomised hard-coded messages repeat ("a few final questions" twice) → frustration | Add sequencing (not random); Engineer to send 15 texts for UX review; copy: "Take your time. Answer all at once, or one by one" | Follow-ups | Engineer, UX | "They've said 'a few final questions' twice…We need to build sequencing" | "Repetition could get frustrating" | Hard-coded messages | Review + sequence the 15 copy variants |

### Theme: Question typography & examples

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-048 | UI improvement | Bigger question text / hierarchy | Too much info in small space; question not prominent | Question = H1 (largest); UX-copy + question same size; hint slightly smaller. NHS pattern: section title / H1 question / hint | Follow-ups | UX, Engineer | "You need bigger text…The number-one priority is the question" | Not stated | Message-structure limits splitting | Apply type hierarchy |
| MOB-049 | Accessibility | Hint text colour-contrast may fail | Grey hint may fail contrast | Verify against WCAG/NHS contrast | Follow-ups | UX | "that text might not pass colour-contrast requirements" | Not stated | Not stated | Contrast audit |
| MOB-050 | UI improvement | Remove italics from hint text | Italics harder to read; grey+small already signals hint | Use regular style, not italic | Follow-ups | UX | "I wouldn't put anything in italics…instantly becomes harder to read" | Even NHS-DS-following text was "missed" in testing | Not stated | De-italicise hints |
| MOB-051 | UX improvement | Hide example answers under accordion; label "Example answer" | "More examples" looks like a hyperlink (fear of leaving page); examples add clutter | Accordion "See more examples" with arrow/magnifier; label visible one "Example answer"; alt: send examples as a chat message (hard with current architecture) | Follow-ups | UX, Engineer | "Hide it completely under 'See examples…'"; "'More examples' currently looks like a hyperlink" | Not stated | Architecture constraint | Convert to accordion; relabel |
| MOB-052 | Analytics | Track "More examples" clicks | No signal on example reliance or question quality | Track example opens; high usage may mean questions poorly framed | Follow-ups | UX, Engineer | "really interesting analytics measure…are you asking the right question?" | Not stated | Analytics tooling | Add event tracking |
| MOB-053 | UX improvement | Show examples for first ~5 entries then remove | Beginners need examples; experienced users don't | Gate examples to first ~5 entries (not training year — even an ST3 first-timer needs them) | Follow-ups | Engineer, Doctor, UX | "show the examples for the first five entries, then remove"; Doctor: "still their first time using the app" | Not stated | Needs MOB-052 data | Implement entry-count gating |

### Theme: User research / future

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-054 | User research | Map early (first-14-day) journey behaviour | Assumptions about behaviour change over time unvalidated | Map what users do most in first 14 days / first 5 entries; validate example-reliance decay | Cross-app | UX, Engineer | "map that user journey…first 14 days" | Not stated | Analytics (MOB-052) | Define early-journey research plan |
| MOB-055 | Feature request | Tone/intonation analysis (deferred) | Only words analysed, not tone | Future: analyse intonation | Recording | UX, Engineer | "Just the words. There's no tone analysis…interesting to add in the future" | "don't think I need it yet" | ML capability | Backlog |

### Theme: Capability tagging

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-057 | Feature request | Allow manually adding capabilities (deferred v2) | AI selects 5; user can't add missing ones | Add manual capability; user must write the justification (AI interaction is over by then). Deferred to next version | Capability tagging | Engineer, Doctor | "Is there an option…to add others…No, not yet, but I need to add that" | Deferred to next version | Justification authoring UX | Design manual-add for v2 |
| MOB-058 | UX improvement | Hide confidence+reasoning under "Why I suggested this" | "Why relevant" reasoning is long/variable; button cramped | Group confidence + reasoning under "Why I suggested this" (below, left-aligned), keep first expanded; here confidence *is* important (unlike type step) | Capability tagging | UX, Engineer | "Then you could say '90% confidence' and underneath show the specific reasoning" | Trust matters here | Not stated | Redesign reasoning disclosure |
| MOB-059 | Accessibility | Left-align controls | Right-side controls missed under heavy screen magnification | Keep controls left-aligned; avoid important right-hand controls | Capability tagging | UX | "using heavy screen magnification…having everything left-aligned is better" | Not stated | Not stated | Left-align actionable controls |
| MOB-060 | Open question | Capability selection limit of 3 not implemented | Users may over-select | Limit to 3, OR allow many and decide in FourteenFish (unresolved) | Capability tagging | Doctor, Engineer | "A limit of three…I haven't implemented that yet…people may select too many" | Not stated | Product decision | Decide limit vs unlimited |
| MOB-061 | UI improvement | Bigger touch targets on capability rows | Mobile thumb targets too small | Enlarge selection/expander targets; reasoning below (not split L/R small targets) | Capability tagging | UX, Engineer | "because this is a mobile app, everything needs to be bigger…enough space for the thumb" | Not stated | Ties to MOB-070 | Increase target sizes |
| MOB-077 | Risk or constraint | Hallucination in capability mapping | AI may mis-map | ~9/10 correct; can't be fully hallucination-free; AI adds reasoning | Capability tagging | Engineer | "Nine times out of 10 it won't hallucinate, but I can't make it entirely hallucination-free" | Not stated | Model limitation | Track error rate; user verification (MOB-064/065) |

### Theme: Entry review screen

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-062 | Content/terminology | "You've selected" + bullet points | "What you selected" less friendly | "You've selected" + bullet list | Review | UX, Engineer | "'What you selected' could say 'You've selected'…nice as bullet points" | "don't want the next experience to [suffer]" | Feasibility to check | Reword + bullets if feasible |
| MOB-063 | UI improvement | Dynamic completion message (minor) | "All done" same every time | Vary completion message | Review | UX, Engineer | "Is that the same every time…? Making it more dynamic could be better" | Minor / "not sure" | Not stated | Optional: vary copy |
| MOB-064 | UX improvement | Separate "Needs review" (action) from type tag | Two differently-purposed labels on one line | Move "Needs review" to top; keep "Clinical case review" as metadata tag | Review | UX | "'Needs review' is an action…could sit at the top…'Clinical case review' is the type…metadata" | Not stated | Not stated | Split the two labels |
| MOB-065 | UX improvement | Expand "Needs review" into guidance | "Needs review" too terse | Info box: "Your draft is ready. Please check it manually / All I need is a manual verification" | Review | UX | "Instead of just 'Needs review', say 'Your draft is ready…'" | Not stated | Not stated | Add guidance info box |
| MOB-066 | Decision | Section titles not editable | Should Description/Reflection/Learning-needs titles be editable? | Non-editable — fixed FourteenFish section names | Review | Doctor, UX | "you're not supposed to edit the section title…I wouldn't make that editable" | Domain rule | Not stated | Lock section titles |
| MOB-067 | UI improvement | Disable emojis in entries | Emoji could celebrate a serious case | Disable emoji input in entries | Review | UX, Engineer | "You don't want someone celebrating a serious case with an emoji…I should probably disable emojis" | Not stated | Not stated | Disable emoji entry |
| MOB-068 | Open question | Verify formatting/bullets paste cleanly into FourteenFish | Bullets/formatting may break on paste into FourteenFish | Investigate paste fidelity; avoid formatting errors | Review → FourteenFish | UX, Engineer | "can bullet points be copied cleanly into FourteenFish?…I need to check" | Not stated | FourteenFish paste behaviour | Test copy-paste into FourteenFish |
| MOB-069 | Bug | Pen/arrow icons too close | Mis-tap risk between edit and expand | Increase spacing; reconsider layout | Review (accordion rows) | UX | "The pen and the arrow are very close together" | Its importance stressed on recording | Ties to MOB-070 | Fix icon spacing |
| MOB-070 | Decision | Move accordion expander to left (NHS DS) | Expander placement inconsistent/less accessible | Put expander on left per NHS design system; since checkbox is left, place expander under the text | Review/capability rows | UX, Engineer | "They put the expander on the left…move the expander underneath with the text" | NHS-DS-backed | NHS design history reference | Reposition expander |
| MOB-071 | UI improvement | Dark/light colour mapping | Green looks like "Batman-villain," esp. dark mode | Map colours deliberately across dark/light | Review/global | UX | "The green here gives me Batman-villain vibes, especially in dark mode" | Not stated | Ties to MOB-002 | Define semantic colour tokens for both modes |
| MOB-076 | Content/terminology | Trim greeting copy | Extra words ("Thanks") add reading time | "I have a couple more questions to strengthen your portfolio entry" — drop "Thanks" | Follow-ups | UX | "I don't know if you need to say 'Thanks'…Every extra word adds…time" | "Every extra word adds…time" | Not stated | Trim message copy |

### Theme: PDP goals

| ID | Type | Actionable item | User problem | Proposed improvement / alternatives | Screen/journey | Stakeholders | Evidence | Priority signals | Dependencies/questions | Recommended next step |
|----|------|-----------------|--------------|-------------------------------------|----------------|--------------|----------|------------------|------------------------|-----------------------|
| MOB-072 | Decision | PDP goals mis-modeled — redesign (v2) | Goals generated per-case, but PDPs are strategic and span a 6-month review period; agreeing one per entry yields far too many | Redesign: after 7–8/10 entries, ask AI to identify strategic goals from all entries. Engineer concedes design mistake; v2 architecture change | PDP goals | Doctor, Engineer | "The scope of a goal shouldn't be one case. It should be based on all 10 cases"; "I made a mistake in this design" | Domain-critical | v2 architecture | Redesign PDP model for v2 |
| MOB-073 | UX improvement | This-version PDP framing fixes | Long goal text; unclear checkbox; unclear toggle meaning | "Goal 1/2" structure; present goal first then "Do you want to add this goal? Yes/No"; allow review-date; remove on/off toggle; frame "PDP goals based on this case" | PDP goals | UX, Doctor | "structure them as 'Goal 1', 'Goal 2'…'Do you want to add this goal?'"; "I don't think you need an on/off toggle" | Not stated | Interim before MOB-072 | Reframe current PDP screen |
| MOB-074 | Feature request | Link case to existing PDP goal / create new (v2) | No way to link a case to a broader existing goal | Two options: "create a new goal from this case" or "link this case to an existing goal"; possibly a separate Goals screen; AI could prompt "5 of your entries relate to goal X — link this one?" | PDP goals | Doctor, UX | "create a new goal from this case, or link the case to an existing goal" | "big change, but…a good point" | Depends on MOB-072 | Design link-to-goal flow for v2 |
| MOB-075 | Feature request | PDP goals uploaded to FourteenFish | Are PDP goals only in-app? | PDP goals should also go into FourteenFish | PDP goals | Doctor, Engineer | "They should also be entered into FourteenFish. Oh, they will be? Okay, cool" | Not stated | FourteenFish integration | Confirm PDP export path |

---

## 3. Detailed findings

Fields not restated where identical to the table above; below preserves nuance and disagreement. Minor items kept brief.

**MOB-001 — Remove desktop-only button / "Just Talk" mis-CTA.** *Type:* UI. The Engineer, three times, read the "Just Talk" comparison as the start CTA; something "looks like a button." UX: remove the desktop button. Need: an unambiguous single start action. Decision status: agreed to change; exact fix open. Next: audit intro controls.

**MOB-002 — Match device theme.** *Type:* UX. Mirror the user's phone light/dark setting; UX keeps hers light by day/dark by evening. Decision: agreed ("Oh yeah, I can actually"). Related: MOB-071.

**MOB-003 / MOB-004 / MOB-005 / MOB-006 — Intro carousel.** Content/UX. Clarify first-run-only; add a welcome greeting; rewrite three steps (replace "We'll do the paperwork" with "We'll ask you some questions"); remove duplicate Skip on step 3; reword "Your portfolio simplified" → "Building your portfolio, simplified" (risk users think important info is stripped). The dots/swipe progress tracker was praised. Decisions: remove Skip (agreed), rewording (agreed in principle).

**MOB-007 / MOB-008 / MOB-009 / MOB-010 / MOB-011 — Login & guest mode.** The central disagreement: Engineer wants friction-free guest entry ("people don't like sharing their email…avoid all that friction"); UX argues the primary action should be "Sign in to save your progress," with "Continue as guest" secondary, because losing entries would anger users. Engineer conceded ("Okay, that makes sense"). Guest mode retained for first 100–1,000 users then removed (decision). Persistent guest banner warning of data loss + sign-in CTA. Unresolved constraint: guest→existing-account merge is "more complicated" and not currently possible (MOB-010). Rename "Try the app" → "Continue as guest."

**MOB-012–MOB-019 — Consent / privacy.** First-run-only consent before continuing. UX flags GDPR likely needs an **explicit checkbox** ("By tapping Continue" deemed insufficient) — potentially a blocker. Add "I am a UK doctor in training." The "I will anonymise patient identifiers" consent is disputed: Doctor says the onus is always on the doctor and redaction is a secondary net; whether the consent is legally required is **unresolved** ("Claude gave me some reasons…I've forgotten"). Reword to be friendly, not threatening; voice lowers users' guard vs typing, so an optional in-record reminder was suggested, with a plan to test real behaviour. Put a policy/ToS TL;DR on the website page (not in-app). Remove flashing text; check text size. Content should match the website's one-sentence description (credibility) — needs a content guide (MOB-013).

**MOB-020–MOB-022 — Training year & steps.** Make the year question GP-specific now (year 1/2/3) while keeping generic templates for the ~5-months-out multi-specialty expansion. Remove/repurpose the progress bar (it manufactures "step fatigue" — felt like ~8 steps); skip the generic first step and open with the training-year question. Single-select interaction was praised.

**MOB-023–MOB-027 — Home.** **Decision: "portfolio" is banned** as the home name (users' real portfolio is FourteenFish; guests own nothing yet). "Dashboard" floated (Doctor lukewarm), "diary" rejected — naming still open. Guest vs logged-in need different messages; guests get an action-first prompt. Primary CTA: avoid FourteenFish-associated words ("painful"); Doctor endorses "case" — "Talk about your case" / "Record your case." Keep the primary CTA fixed and rotate sub-prompts (10–15). First-run confirmation "You're set up for general practice."

**MOB-028–MOB-036, MOB-056 — Chat/voice input.** UX expected a centred-microphone start, not a chat layout. "Talk" over-implies speaking → clarify "Talk or type," remove the mic icon. The input/record button "looks disabled" — needs visual primacy over helper text. The **3-minute countdown causes panic**; Engineer's rationale is crash-safety (a long recording is lost on crash) plus encouraging short bursts — reconsider showing the countdown. Deliver tips as the first AI bubble (progressive disclosure). Remove the pause button (users mistook it for "answer in one go"). Message status should use two ticks (sent vs AI-processed), not one. Label voice transcriptions "Transcription" (voice only). Strip "uh/um" fillers.

**MOB-037 / MOB-038 — "Analysis" and finished-detection.** "Start/Continue analysis" is jargon; Engineer prefers "Continue chat" (alternatives: "What's next?", "Take me to the next step", "Over to you"; avoid "I'm done" → implies leaving). Underlying **open problem:** the system can't reliably tell a one-shot voice answer from a series of typed bursts; behaviour is unknown. Alternatives: single "Continue chat"; dual "Send and continue"/"Send and finish"; or (deferred) AI auto-detecting sufficiency without nagging. This is the most-emphasised unresolved item.

**MOB-039–MOB-043 — Entry type & confidence.** **Decision:** move entry-type selection to the *start* of the chat — users usually already know the type, FourteenFish asks up front, and it warms them up; don't auto-select. Confidence percentages confuse (they don't sum to 100 and aren't labelled as confidence) → remove at this stage, retain confidence for capability tagging. The "why this type" expander is too small and not obviously tappable; show top 3 not 5. A backlog idea — AI suggesting an alternative entry type for GPs short of a category — was judged low value by the Doctor (you usually know the category; an entry can't be duplicated across categories).

**MOB-044 — Loading states.** Random cycling of ~15 phrases reads wrong for a "serious product"; make it an ordered, progress-reflecting 2–3-step sequence. Constraint: the true pipeline stage can't be exposed (competitive), so use generic stage names. 5–15s responses mean too many flashing messages can't be read.

**MOB-045–MOB-047, MOB-076 — Follow-up questions & copy.** One-question-at-a-time is confirmed (showing 30–40 questions caused users to lose track). Don't show an exact remaining count (one answer can satisfy multiple sections; big entries reach 12–13 questions → fatigue). The ~15 hard-coded messages must be **sequenced, not random** (they repeated "a few final questions"); Engineer will send the 15 variants for UX review. Trim greetings ("drop 'Thanks'").

**MOB-048–MOB-053 — Typography & examples.** The question must be the largest element (H1); UX copy, question, and hint currently render as one bubble with the question too small. Check hint colour contrast (possible failure); remove italics (harder to read; even NHS-DS-compliant hint text was missed in testing). Hide example answers behind an accordion "See more examples" (currently looks like a page-leaving hyperlink), labelling the visible one "Example answer." Track "More examples" clicks as an analytics/quality signal (high reliance may mean poorly framed questions). Gate examples to the first ~5 entries (by entry count, not training year — even an experienced ST3 first-timer needs them).

**MOB-054 / MOB-055 — Research / future.** Map early (first-14-day / first-5-entry) behaviour to validate the assumed decline in example reliance. Tone/intonation analysis is an acknowledged future idea, not needed yet.

**MOB-057–MOB-061, MOB-077 — Capability tagging.** AI selects 5; users can't yet add a missing capability — needed in v2, and a manually added capability would require the *user* to write the justification (AI interaction has ended). Group confidence + reasoning under "Why I suggested this," left-aligned, first expanded — here the confidence/reasoning **is** important (unlike the type step) because users must justify capabilities. Left-align controls for heavy screen-magnification users. A 3-capability limit is discussed but **not implemented** (alt: allow many, decide in FourteenFish) — unresolved. Bigger thumb targets. Hallucination is ~1/10 and cannot be fully eliminated (constraint).

**MOB-062–MOB-071 — Review screen.** "You've selected" + bullets (friendlier); optionally vary the "All done" message (minor). Separate "Needs review" (an action → top) from "Clinical case review" (metadata tag); expand "Needs review" into a guidance info box. **Decision:** section titles (Description/Reflection/Learning needs) are non-editable — fixed FourteenFish names. Disable emojis (serious cases). **Open:** verify bullets/formatting paste cleanly into FourteenFish. **Bug:** pen and arrow icons are too close (mis-tap). **Decision:** move the accordion expander to the left per NHS design system (checkbox stays left; expander moves under the text). Fix dark/light colour mapping (green reads "Batman-villain" in dark mode).

**MOB-072–MOB-075 — PDP goals.** The Doctor identified a structural error: PDP goals are **strategic and span a 6-month review period**, not per-case; agreeing to a suggested goal on every entry produces far too many. Engineer conceded ("I made a mistake in this design") and proposes generating goals from all entries after ~7–8/10 (v2 architecture change). Interim fixes for this version: "Goal 1/2" structure, present goal then "Do you want to add this goal? Yes/No," allow a review date, remove the on/off toggle, and reframe as "PDP goals based on this case." v2 should offer **create-new vs link-to-existing-goal** (AI could prompt "5 entries relate to goal X — link this one?"), possibly on a separate Goals screen. PDP goals should also upload to FourteenFish.

---

## 4. User-journey findings

**App installation & first launch.** *Problems:* theme default undecided; "Just Talk"/desktop button confusion; unclear the intro is first-run-only. *Improvements:* MOB-001, MOB-002, MOB-003. *Open:* which controls are desktop-only leftovers.

**Onboarding.** *Problems:* step fatigue from the progress bar (~8 perceived steps); generic training-year question feels not-for-GPs; carousel copy ("We'll do the paperwork") unclear. *Improvements:* MOB-004, MOB-005, MOB-006, MOB-020, MOB-021, MOB-022, MOB-027. *Evidence:* "It looks like there are eight steps." *Open:* full-progress vs no-progress indicator.

**Registration / login.** *Problems:* sign-in friction vs guest data-loss risk; guest→account merge impossible; "Try the app" wording; GDPR consent adequacy; disputed anonymisation consent. *Improvements/decisions:* MOB-007, MOB-008, MOB-009, MOB-011, MOB-012–MOB-019. *Open:* is the anonymisation consent legally required (MOB-017); merge path (MOB-010).

**Core product experience (record → questions → draft).** *Problems:* chat layout unexpected; "talk" implies voice-only; input looks disabled; 3-min countdown panic; pause button misleads; "analysis" jargon; can't tell when user is finished; confidence % confusion; loading messages random; question text too small; examples look like hyperlinks; capability reasoning cramped; review-screen tags conflated; emojis allowed; formatting-paste risk. *Improvements:* MOB-028–MOB-053, MOB-057–MOB-071, MOB-076–MOB-077. *Evidence:* "creates panic"; "'Continue analysis' is very technical." *Open:* finished-detection (MOB-038); FourteenFish paste fidelity (MOB-068); capability limit (MOB-060).

**Task completion (upload to FourteenFish).** *Problems:* draft must be manually verified; paste formatting into FourteenFish unverified; PDP goals mis-modeled. *Improvements:* MOB-064, MOB-065, MOB-068, MOB-072–MOB-075. *Open:* PDP redesign scope; PDP export.

**Profile & settings.** Only tangential (theme mirrors OS; "change it inside the app later" mentioned). Not substantively discussed.

*(Notifications, Search/discovery, Help/support, Re-engagement/retention were not discussed and are omitted.)*

---

## 5. Platform-specific findings

**iOS:** None. No item was explicitly scoped to iOS.

**Android:** None. No item was explicitly scoped to Android.

**Both platforms:** None explicitly stated. (Per the rule, "mobile app" alone does not justify "both.")

**Platform not stated:** **All items — MOB-001 through MOB-077.** The transcript never names iOS or Android or distinguishes device/OS behaviour. Even OS-theme mirroring (MOB-002) and "on their phone" references do not specify a platform. Every finding needs platform confirmation before platform-specific work is planned.

---

## 6. Bugs and technical issues

| ID | Issue | Platform | Screen/flow | User impact | Repro | Frequency | Severity | Device/OS/version | Evidence | Suspected cause (stated) | Missing info |
|----|-------|----------|-------------|-------------|-------|-----------|----------|-------------------|----------|--------------------------|--------------|
| MOB-069 | Pen (edit) and arrow (expand) icons too close together | Platform not stated | Review / accordion rows | Mis-tap between edit and expand | Not stated | Not stated | Not stated | Not stated | "The pen and the arrow are very close together" | Not stated | Repro steps, tap-target sizes |
| (constraint) recording loss on crash | Recording is lost if the app crashes mid-record | Platform not stated | Voice recording | Total loss of a long recording | Not stated | Not stated | Not stated (motivates the 3-min limit) | Not stated | "If you record for five minutes and the app crashes, you lose that recording" | In-memory recording, no incremental persistence (*Inferred*, not confirmed) | Whether partial saves exist; crash rate |
| MOB-035 | One-tick status implies message not delivered to AI | Platform not stated | Chat | User uncertainty whether message reached AI | Send a message | Not stated | Not stated | Not stated | "One tick makes me think it hasn't been delivered to the AI" | Status model shows send, not processed | Exact current status semantics |
| MOB-049 | Hint text may fail colour-contrast | Platform not stated | Follow-up questions | Low-vision users may miss hints | Not stated | Not stated | Not stated | Not stated | "might not pass colour-contrast requirements" | Grey-on-background hint styling | Measured contrast ratios |
| MOB-068 | Bullets/formatting may not paste cleanly into FourteenFish | Platform not stated | Review → FourteenFish | Formatting errors on paste | Copy entry, paste into FourteenFish | Not stated | Not stated | Not stated | "can bullet points be copied cleanly into FourteenFish?…I need to check" | Not stated | Actual paste-fidelity test results |

No reproduction steps, frequencies, severities, versions, or root causes beyond those explicitly stated have been invented.

---

## 7. Decisions already made

| ID | Decision | Platform | Screen/journey | Reason (if stated) | Owner (if stated) | Evidence | Dependencies | Required action |
|----|----------|----------|----------------|--------------------|-------------------|----------|--------------|-----------------|
| MOB-002 | Mirror the device's light/dark theme | Platform not stated | Global/first launch | Removes a decision for Engineer; matches user habit | Engineer | "Oh yeah, I can actually" | MOB-071 colour tokens | Implement OS-theme mirroring |
| MOB-005 | Remove duplicate "Skip" on intro step 3 | Platform not stated | Intro step 3 | Two buttons doing the same thing | Not stated | "Remove 'Skip'…Yeah. 100%." | None | Remove control |
| MOB-011 | Keep guest mode for first 100–1,000 users, remove later | Platform not stated | Login | Reduce early friction; remove once word-of-mouth grows | Engineer | "for the first 100 to 1,000 users…keep it…Then I'm going to remove guest mode completely" | None | Document staged decision + removal trigger |
| MOB-023 | "Portfolio" is banned as the home-screen name | Platform not stated | Home | Real portfolio is FourteenFish; guests own nothing | Doctor (raised), Engineer (accepted) | "'Portfolio' is off the cards" | Naming still open | Choose replacement term |
| MOB-034 | Remove the pause button (at least for first messages) | Platform not stated | Recording | It misled users into one-shot answers | Engineer | "Actually, I'll remove the pause button" | None | Remove/defer pause control |
| MOB-039 | Move entry-type selection to the start of the chat | Platform not stated | Chat start | Users know the type; FourteenFish asks first; warms users up | Engineer | "I think I'll ask up front…This section should be at the beginning" | Architecture change (Engineer: v2) | Reorder flow |
| MOB-037 | Prefer "Continue chat" over "analysis" wording | Platform not stated | Chat | "Analysis" too technical | Engineer | "I like 'Continue chat' more" | Depends on MOB-038 model | Adopt wording; validate |
| MOB-066 | Section titles (Description/Reflection/Learning needs) are non-editable | Platform not stated | Review | Fixed FourteenFish section names | Doctor (raised), Engineer/UX (accepted) | "I wouldn't make that editable" | None | Lock titles |
| MOB-070 | Move accordion expander to the left (NHS DS); checkbox left, expander under text | Platform not stated | Review/capability rows | NHS design system convention; accessibility | UX (raised), Engineer ("Okay. Nice, done") | "They put the expander on the left…move the expander underneath with the text" | Consistency across app | Reposition expander |

*Note:* MOB-008 (sign-in-primary), MOB-047 (sequence hard-coded copy), MOB-053 (examples for first ~5 entries), and MOB-072 (PDP redesign) reached strong verbal agreement but are recorded as strong directions rather than hard decisions, because each was left with follow-up work or a "next version" caveat rather than an unambiguous commit.

---

## 8. Open questions and follow-ups

**Product**
- MOB-038 — How to signal "finished" vs "still adding" (voice one-shot vs typed bursts)? Unresolved because real user behaviour is unknown. Owner: Engineer/Product.
- MOB-060 — Cap capabilities at 3, or allow many and decide in FourteenFish? Not decided. Owner: Product.
- MOB-023 — Final home-screen name (not "portfolio," "dashboard" lukewarm). Owner: Product/UX.
- MOB-043 — Whether to build "suggest an alternative entry type" (Doctor thinks low value). Owner: Product.

**UX & design**
- MOB-032 — Keep or remove the 3-minute countdown given the crash-safety rationale? Owner: Mobile UX / Engineering.
- MOB-028 — Reconcile the expected centred-mic start vs the chat layout (needs usability testing). Owner: Mobile UX.
- MOB-051 / MOB-058 — Final accordion pattern for examples and capability reasoning within the current architecture. Owner: UI Design.

**iOS engineering** — None raised specifically.

**Android engineering** — None raised specifically.

**Backend engineering**
- MOB-010 — Feasibility of merging guest entries into a prior account. Owner: Not clear (Engineer noted complexity).
- MOB-044 — Whether ordered progress stages can be surfaced without exposing the pipeline. Owner: Engineering.
- (Constraint) — Whether recordings can be incrementally persisted to survive a crash. Owner: Engineering.

**Analytics**
- MOB-052 / MOB-054 — Instrument "More examples" clicks and early-journey behaviour; tooling not yet in place. Owner: Analytics.

**User research**
- MOB-017 — Test whether users actually enter PII via voice before strengthening messaging. Owner: Research.
- MOB-054 — First-14-day behaviour mapping to validate example-reliance decay. Owner: Research.

**Privacy & security**
- MOB-014 — Is a "By tapping Continue" acceptance GDPR-sufficient, or is an explicit checkbox required? Owner: Not clear (legal input needed).
- MOB-017 — Is the "I will anonymise patient identifiers" consent legally required at all? Unresolved; Engineer forgot the earlier reasoning. Owner: Not clear (legal).
- MOB-068 — Confirm no formatting leakage when pasting into FourteenFish (data-integrity). Owner: Engineering.

---

## 9. Conflicting viewpoints and alternatives

**MOB-008 — Login: dive-in vs sign-in screen.** Shared problem: minimise friction without risking lost work. **A (Engineer):** dive straight in / guest-first — "people don't like sharing their email…avoid all that friction." **B (UX):** sign-in-primary — "the main action…should be 'Sign in'…'Continue as guest' should be secondary." *Status:* Engineer conceded to B ("Okay, that makes sense"), but guest mode still retained short-term (MOB-011).

**MOB-038 — Done-signal.** Shared problem: knowing when the user is finished. **A:** single "Continue chat." **B (UX):** dual "Send and continue" / "Send and finish." **C (deferred):** AI auto-detects sufficiency. Engineer's counter-concern: too much interruption ("don't want the AI to keep interrupting"). *Status:* undecided.

**MOB-017 — Anonymisation consent.** Shared problem: PII risk. **A (UX, initial):** strong "I will anonymise" statement/consent. **B (Doctor):** onus is on the doctor; redaction is a secondary net; consent may be unnecessary. **C (Engineer):** keep reminding users but reword friendly. *Status:* undecided (legal question).

**MOB-041 / MOB-058 — Show reasoning/confidence or not.** Shared problem: build appropriate AI trust without clutter. **A (UX):** hide reasoning/confidence at the *type* step (low value). **B (Engineer):** reasoning matters, but *later* at capability tagging (where users must justify). *Status:* converged — hide at type, show under an accordion at capabilities.

**MOB-032 — Recording limit.** Shared problem: balance long dumps vs loss risk and panic. **A (UX):** the countdown causes panic — reconsider/remove. **B (Engineer):** limit prevents catastrophic loss on crash and encourages short bursts. *Status:* undecided.

**MOB-053 — Example gating basis.** Shared problem: who needs examples. **A (Engineer, initial):** possibly by training year. **B (Doctor):** even an ST3 first-timer needs them → gate by entry count. *Status:* converged on entry-count (first ~5).

**Rejected ideas.** Making the app "portfolio" (MOB-023). Editable section titles (MOB-066). "Diary" as the home name. Emojis in entries (MOB-067, to be disabled).

**Deferred ideas.** AI-suggested alternative entry type (MOB-043). Manual capability add (MOB-057, v2). Tone/intonation analysis (MOB-055). AI auto "I've got enough" detection (part of MOB-038). PDP redesign and link-to-existing-goal (MOB-072/MOB-074, v2).

---

## 10. Prioritisation-ready backlog

Urgency is `Not stated` unless the transcript gave an explicit signal. Expected impact and estimated effort are `Not stated` throughout — the transcript provided no impact metrics or effort estimates. Owners are analytical routing suggestions only.

| ID | Platform | Theme | Title | Type | Evidence strength | Stated urgency | Expected impact | Estimated effort | Recommended owner |
|----|----------|-------|-------|------|-------------------|----------------|-----------------|------------------|-------------------|
| MOB-001 | Platform not stated | Intro | Remove desktop button / fix "Just Talk" CTA | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-002 | Platform not stated | Theme | Mirror device light/dark theme | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-003 | Platform not stated | Intro | First-run-only + welcome copy | Content/terminology | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-004 | Platform not stated | Intro | Rewrite 3-step carousel copy | Content/terminology | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-005 | Platform not stated | Intro | Remove duplicate Skip (step 3) | UX improvement | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-006 | Platform not stated | Intro | "Building your portfolio, simplified" | Content/terminology | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-007 | Platform not stated | Login | "Try the app" → "Continue as guest" | Content/terminology | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-008 | Platform not stated | Login | Sign-in-primary login screen | UX improvement | Strong | Not stated | Not stated | Not stated | Product |
| MOB-009 | Platform not stated | Login | Guest data-loss banner + CTA | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-010 | Platform not stated | Account | Guest→account merge | Risk or constraint | Moderate | Not stated | Not stated | Not stated | Backend Engineering |
| MOB-011 | Platform not stated | Login | Keep guest mode (first 100–1,000) | Decision | Strong | Not stated | Not stated | Not stated | Product |
| MOB-012 | Platform not stated | Consent | First-run consent gate | UX improvement | Moderate | Not stated | Not stated | Not stated | Product |
| MOB-013 | Platform not stated | Content | Website key-message consistency | Content/terminology | Moderate | Not stated | Not stated | Not stated | Product |
| MOB-014 | Platform not stated | Privacy | Explicit GDPR consent checkbox | Privacy or security | Strong | Not stated (possible blocker) | Not stated | Not stated | Security |
| MOB-015 | Platform not stated | Privacy | Policy/ToS TL;DR on website | Content/terminology | Moderate | Not stated | Not stated | Not stated | Product |
| MOB-016 | Platform not stated | Privacy | "UK doctor in training" checkbox | Privacy or security | Moderate | Not stated | Not stated | Not stated | Security |
| MOB-017 | Platform not stated | Privacy | Anonymisation consent — need + reword | Privacy or security | Strong | Not stated (possible blocker) | Not stated | Not stated | Security |
| MOB-018 | Platform not stated | Consent | Remove flashing text | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-019 | Platform not stated | Consent | Consent text-size review | Accessibility | Weak | Not stated | Not stated | Not stated | UI Design |
| MOB-020 | Platform not stated | Onboarding | GP-specific training-year question | Content/terminology | Strong | Not stated | Not stated | Not stated | Product |
| MOB-021 | Platform not stated | Onboarding | Remove/repurpose progress bar | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-022 | Platform not stated | Onboarding | Skip generic first step | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-023 | Platform not stated | Home | Ban "portfolio" naming | Decision | Strong | Not stated | Not stated | Not stated | Product |
| MOB-024 | Platform not stated | Home | Guest vs logged-in home message | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-025 | Platform not stated | Home | "Talk/Record your case" CTA | Content/terminology | Strong | Not stated | Not stated | Not stated | Product |
| MOB-026 | Platform not stated | Home | Fixed CTA + rotating prompts | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-027 | Platform not stated | Home | First-run "set up for GP" confirm | UX improvement | Weak | Not stated | Not stated | Not stated | Mobile UX |
| MOB-028 | Platform not stated | Chat | Chat vs centred-mic expectation | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-029 | Platform not stated | Chat | Clarify text + voice input | Content/terminology | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-030 | Platform not stated | Chat | Remove mic icon from record button | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-031 | Platform not stated | Chat | Input button looks disabled | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-032 | Platform not stated | Recording | Reconsider 3-min countdown | UX improvement | Strong | Not stated (panic/stress signal) | Not stated | Not stated | Mobile UX |
| MOB-033 | Platform not stated | Chat | Tips as first AI bubble | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-034 | Platform not stated | Recording | Remove pause button | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-035 | Platform not stated | Chat | Two-tick message status | UI improvement | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-036 | Platform not stated | Chat | Label "Transcription" (voice) | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-037 | Platform not stated | Chat | Replace "analysis" → "Continue chat" | Content/terminology | Strong | Not stated | Not stated | Not stated | Product |
| MOB-038 | Platform not stated | Chat | Finished-vs-adding detection | Open question | Strong | Not stated | Not stated | Not stated | Product |
| MOB-039 | Platform not stated | Classification | Entry-type selection first | Decision | Strong | Not stated | Not stated | Not stated | Product |
| MOB-040 | Platform not stated | Classification | Remove confusing confidence % | UX improvement | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-041 | Platform not stated | Classification | Type reasoning expander too small | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-042 | Platform not stated | Classification | Show top 3 not 5 | UX improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-043 | Platform not stated | Classification | AI alt entry-type suggestion | Feature request | Weak | Not stated | Not stated | Not stated | Product |
| MOB-044 | Platform not stated | Loading | Sequenced 2–3 progress states | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-045 | Platform not stated | Questions | One question at a time | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-046 | Platform not stated | Questions | No exact question count | UX improvement | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-047 | Platform not stated | Questions | Sequence hard-coded copy | Content/terminology | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-048 | Platform not stated | Questions | Bigger question text | UI improvement | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-049 | Platform not stated | Questions | Hint contrast check | Accessibility | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-050 | Platform not stated | Questions | Remove hint italics | UI improvement | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-051 | Platform not stated | Questions | Examples in accordion | UX improvement | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-052 | Platform not stated | Analytics | Track "More examples" clicks | Analytics | Moderate | Not stated | Not stated | Not stated | Analytics |
| MOB-053 | Platform not stated | Questions | Examples for first ~5 entries | UX improvement | Strong | Not stated | Not stated | Not stated | Product |
| MOB-054 | Platform not stated | Research | Map early journey behaviour | User research | Moderate | Not stated | Not stated | Not stated | Research |
| MOB-055 | Platform not stated | Future | Tone/intonation analysis | Feature request | Weak | Not stated | Not stated | Not stated | Product |
| MOB-056 | Platform not stated | Transcription | Clean filler words | Technical improvement | Moderate | Not stated | Not stated | Not stated | Backend Engineering |
| MOB-057 | Platform not stated | Capabilities | Manual capability add (v2) | Feature request | Strong | Not stated | Not stated | Not stated | Product |
| MOB-058 | Platform not stated | Capabilities | Reasoning/confidence accordion | UX improvement | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-059 | Platform not stated | Capabilities | Left-align controls (a11y) | Accessibility | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-060 | Platform not stated | Capabilities | 3-capability limit undecided | Open question | Moderate | Not stated | Not stated | Not stated | Product |
| MOB-061 | Platform not stated | Capabilities | Bigger thumb targets | Accessibility | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-062 | Platform not stated | Review | "You've selected" + bullets | Content/terminology | Weak | Not stated | Not stated | Not stated | UI Design |
| MOB-063 | Platform not stated | Review | Dynamic completion message | UI improvement | Weak | Not stated | Not stated | Not stated | UI Design |
| MOB-064 | Platform not stated | Review | Split "Needs review" vs type tag | UX improvement | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-065 | Platform not stated | Review | "Needs review" guidance box | UX improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-066 | Platform not stated | Review | Section titles non-editable | Decision | Strong | Not stated | Not stated | Not stated | Product |
| MOB-067 | Platform not stated | Review | Disable emojis | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-068 | Platform not stated | Review | FourteenFish paste fidelity | Open question | Moderate | Not stated | Not stated | Not stated | Backend Engineering |
| MOB-069 | Platform not stated | Review | Pen/arrow spacing | Bug | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-070 | Platform not stated | Review | Expander to left (NHS DS) | Decision | Strong | Not stated | Not stated | Not stated | UI Design |
| MOB-071 | Platform not stated | Theme | Dark/light colour mapping | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-072 | Platform not stated | PDP | PDP goals redesign (v2) | Decision | Strong | Not stated | Not stated | Not stated | Product |
| MOB-073 | Platform not stated | PDP | Interim PDP framing fixes | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-074 | Platform not stated | PDP | Link-to-existing-goal (v2) | Feature request | Strong | Not stated | Not stated | Not stated | Product |
| MOB-075 | Platform not stated | PDP | PDP goals → FourteenFish | Feature request | Moderate | Not stated | Not stated | Not stated | Backend Engineering |
| MOB-076 | Platform not stated | Questions | Trim greeting copy | Content/terminology | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-077 | Platform not stated | Capabilities | Hallucination risk | Risk or constraint | Moderate | Not stated | Not stated | Not stated | Backend Engineering |

---

**Coverage note.** All 77 consolidated items trace to specific transcript lines; duplicates were merged (e.g., the repeated "analysis"-wording discussion → MOB-037; repeated typography complaints → MOB-048/050). Distinct screens, user groups (guest vs logged-in; ST1 vs ST3), and underlying problems were kept separate. Off-topic passages (drinks, espresso beans, going out to eat) were excluded as non-actionable. Every inference is labelled; every gap is `Not stated`.
