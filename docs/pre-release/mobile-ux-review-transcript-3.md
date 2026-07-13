# Mobile UX & Product Review — Transcript 3

**Source:** `labelled_transcript-mobile-3.txt`
**Product:** Logit (voice/text → structured portfolio entries for UK GP training)
**Participants:** Engineer, UX Designer, Doctor
**Scope of this session:** PDP-goals screen (completing goals/actions, extending deadlines, status terminology, reflection), Profile page, guest→account upgrade, the AI-credits/usage-limits model, account creation & email/OTP verification, the homepage/dashboard, the review-period (ARCP capability-coverage) tracker, accessibility text-size behaviour, notifications/engagement, and brand tone of voice.
**Analyst:** Senior mobile product & UX analyst
**Date of analysis:** 2026-07-13

> **ID continuity note.** This is the third review transcript. Transcript 1 used MOB-001…MOB-077 and transcript 2 used MOB-078…MOB-103, so findings here are numbered from **MOB-104** onward. IDs are stable across all sections of *this* document.

> **Platform note.** The transcript never names iOS or Android, so **every item is `Platform not stated`**. Unlike transcript 2 (which hinted at a desktop surface), this session shows clear signs of a real on-device mobile build — "airplane mode" (L79), copy-from-notification OTP entry (L281), and the device **Accessibility → Display → text size** setting breaking the layout (L495–515). These indicate a mobile device but still do **not** distinguish iOS from Android, so no item is routed to a single platform on this evidence. Flagged as an open question (see §8).

---

## 1. Executive summary

**Main themes.** The session walked the *back half* of the product: finishing PDP goals and reflecting on them, the Profile/account-upgrade area, how usage is metered and communicated, account creation via email OTP, and the homepage/dashboard with its ARCP capability-coverage ("review period") tracker. Three product-level threads dominate: (a) **status terminology and the entry↔PDP status relationship** ("Started" vs "In progress" vs "Completed"); (b) **rethinking the usage/limits model** so it speaks in *entries* rather than *AI credits*, and dropping session/weekly-credit limits in favour of simple hard caps; and (c) **making the homepage scannable and the coverage tracker meaningful** (clickable capabilities, entries linked to review periods, celebratory 100% moment).

**Most important user problems.**
- Usage is expressed in "AI credits," which the UX Designer said "isn't relevant to me" — users can't translate credits into what they actually do (entries) (MOB-114).
- The two-tier limit model (per-session + weekly + credits) is hard to understand and adds tracking burden ("two things to track rather than one") (MOB-115).
- The PDP-goal status label "Started" doesn't match user mental models — committing to a goal ≠ actively doing it (MOB-106).
- The homepage is "very bland… quite textual" and hard to scan; recent entries and PDP goals compete for the same space (MOB-125, MOB-126).
- Large accessibility text sizes visibly break the layout ("you broke my app") (MOB-135).
- Existing-account users risk losing guest data because guest→existing-account merge isn't built (MOB-112).

**Most frequently mentioned improvements.** Talk in entries not credits; simplify to hard entry caps; make capability tiles clickable and link entries to review periods; add scannable entry cards with icons/imagery; opt-in motivational check-ins; a dedicated, celebratory reflection screen; voice input on every text field.

**Confirmed decisions (this session).**
- Rename the PDP-goal status **"Started" → "In progress"** (MOB-106).
- Split a PDP goal into a **short title + a description**, with the AI generating the short title (MOB-107).
- **Integrate voice input into every entry field** (reflection included) — Engineer: "something I will be doing" (MOB-110).
- After completing a PDP goal, **navigate back to the homepage/goal page** so it appears under "Completed" (MOB-111).
- **Stop showing AI credits; express usage as entries** (e.g. "X out of 10 entries created") (MOB-114).
- **Drop session limits and the weekly-credit model**; use simple hard entry caps — guest 5, user 10, pay to go beyond; weekly limits only apply on the paid tier (MOB-115).
- **Add a resend-code time expectation** to the "Didn't receive a code?" state (MOB-121).

**Major disagreements / alternatives.** No hostility; a few unresolved design tensions: whether the **name and verification-code steps share one screen** (Engineer reuses one component; UX Designer wants them split, name first) (MOB-120); whether **review-period dates should be user-selected or auto-populated** from a fixed training calendar (Engineer assumed variable; Doctor says Aug/Feb is fixed for all) (MOB-142); and the tone of **motivational/comparison nudges** (Doctor wary of pressure; resolved toward opt-in) (MOB-138, MOB-139).

**Bugs / reliability.** No functional bug was explicitly labelled this session, but large accessibility text sizes **broke the layout** — a real, reproduced rendering defect the Engineer acknowledged and deferred to "the next release" (MOB-135).

**Key risks / constraints / open questions.** Guest→existing-account merge not built (data-loss risk, MOB-112); users could **game hard caps with multiple accounts** to farm free entries/PDFs (deferred, MOB-117); "due soon" window undefined (MOB-127); review-period date source unresolved (MOB-142); and brand tone of voice undecided (MOB-141).

---

## 2. Consolidated mobile-app improvements

Grouped by theme. Every field uses `Not stated` where the transcript is silent.

### Theme: PDP goals — completion, deadlines & reflection

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-104 | Platform not stated | UI improvement | Make the disabled "Complete goal" button read as disabled | The disabled state looks like an actionable/secondary button, so users think they can tap it | Restyle to an unmistakably disabled state; distinguish from secondary actions | PDP goal — completing a goal once all actions done | UX Designer | L9–11: "that disabled button… still looks like you could action it… looks like a secondary action rather than a disabled action" | Not stated | Depends on button/style system | Define an explicit disabled visual token distinct from secondary |
| MOB-105 | Platform not stated | Feature request | "Extend / change review-by date" quick action on a PDP goal | Users typically push a deadline back, but there's no quick way to extend it | Add a "review by / extend" control opening a pop-up (e.g. +1/+2 weeks); alongside archive/delete/cancel | PDP goal — editing an active goal | Engineer, UX Designer | L17–21: "extending the deadline by one week or 2 weeks"; "usually people push it back" | Not stated | Mirrors the review-period "change dates" pattern (MOB-133) | Design one reusable "change dates" control shared by PDP goals and review periods |
| MOB-106 | Platform not stated | Content or terminology | Rename PDP-goal status "Started" → "In progress" | "Started" implies active work, but committing a goal to the PDP doesn't mean it's being worked on | Use "In progress" for the PDP goal; keep entry statuses "Needs review" → (mark done) → "Completed"; PDP goes "In progress" when a linked entry is marked done | PDP goal status; entry status mapping | Doctor, UX Designer, Engineer | L29–49: "change from 'Started' to 'In progress'"; "just because I've made it into a PDP doesn't mean it's in progress" | Not stated | Status shared between entry and PDP goal | Finalise the status vocabulary map across entry and PDP; update copy |
| MOB-107 | Platform not stated | UX improvement | Split a PDP goal into a short title + a description (AI-generated title) | Goal text is "already quite long" and "gets longer and longer," hard to read when tired | Short PDP title + separate PDP description; let the AI generate the short title (e.g. "Safety-netting for lower back pain") | PDP goal display across list/detail/homepage | UX Designer, Doctor, Engineer | L51–71: "PDP title and a PDP description"; "short title for the goal… the AI could do that" | Not stated | Feeds homepage entry-card scannability (MOB-126) | Define title vs description schema; spec the AI title-generation prompt |
| MOB-108 | Platform not stated | Feature request | Give PDP-goal reflection its own screen | Reflection is squeezed inline; "can get quite big" and currently "feels like I could skip that," like an end survey | Dedicated reflection screen; future AI-assisted interaction | PDP goal — reflecting after completion | Engineer, UX Designer, Doctor | L85–91: "Maybe it needs its own screen… the reflection can get quite big"; "feels like I could skip that" | Not stated | Related to voice input (MOB-110) and celebratory framing (MOB-109) | Prototype a standalone reflection screen; test perceived importance |
| MOB-109 | Platform not stated | UX improvement | Add celebratory framing before the reflection | The transition into reflection is flat; no acknowledgement of completion | Show "Amazing, well done" then "Now let's start your reflection / let's document how it went" | PDP goal — completion → reflection transition | UX Designer | L91–93: "Amazing, well done. Now let's start your reflection"; "Great work, great job" | Not stated | Sits on the MOB-108 screen | Design a celebratory interstitial; keep it skippable |
| MOB-110 | Platform not stated | Feature request | Voice input on every entry/text field (incl. reflection) | Fields are type-only today; earlier notes also couldn't be spoken | Integrate voice chat "wherever there is an entry field" | Reflection and all data-entry fields | Engineer, UX Designer | L93–97: "They can only write… wherever there is an entry field, I need to integrate voice chat" | Committed ("something I will be doing") | Cross-cutting; billing/credits impact noted (voice "will cost") | Plan voice-input rollout across fields; account for usage/cost |
| MOB-111 | Platform not stated | UX improvement | Auto-return to homepage after completing a PDP goal | After finishing goal actions the user isn't returned anywhere obvious to see it under "Completed" | Navigate back to homepage/goal page so the goal shows under "Completed" | PDP goal completion → navigation | UX Designer, Engineer | L99–105: "it needs to go back to… you should see that under 'Completed'"; "that screen should go back to here" | Not stated | Consistent with transcript-2 auto-return behaviour | Implement post-completion redirect; confirm destination |

### Theme: Profile, account upgrade & usage/limits

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-112 | Platform not stated | Risk or constraint | Guest→account data transfer works; merge into an existing account is unbuilt | Guest data auto-transfers on upgrade, but if the user already has an account there's "no way to merge" — potential data loss | Build guest+existing-account merge (harder than the guest-upgrade path) | Guest → Create account | Engineer, UX Designer | L109–123: "transferred automatically… The only time they won't be transferred is if you already have an existing account… no way to merge" | Not stated | Backend account/data-merge logic | Scope the merge case; define behaviour/warning when it can't merge |
| MOB-113 | Platform not stated | Content or terminology | Reword "guest session" / "data not saved" messaging | Copy is system-centric ("guest session", "your data isn't being saved") | "You're currently in a temporary session. Create an account to keep your cases and track your progress"; specify "your reflections, cases and goals aren't being saved" | Profile / guest banner | UX Designer | L125–127: "temporary session… keep your cases and track your progress"; "reflections, cases and goals" | Not stated | None stated | Rewrite guest-state copy in user language |
| MOB-114 | Platform not stated | UX improvement | Express usage in entries, not AI credits | "Each AI action uses one credit" is meaningless to users; they can't map credits to work | Talk in entries (~10–20 credits/entry); show "X out of 10 entries created"; remove AI-credit language from the page | Profile / usage & upgrade | UX Designer, Engineer | L135–167, 239–243: "that isn't relevant to me"; "I'm not talking about AI credits at all… I'll just talk in terms of entries" | Not stated | Requires tracking entries not credits (MOB-115); voice cost complicates (MOB-110) | Redesign usage display around entries; keep credits internal |
| MOB-115 | Platform not stated | Decision | Simplify limits: hard entry caps; drop session & weekly-credit limits | Per-session + weekly + credit limits are confusing and penalise bursty use ("do it all on a Friday… two things to track") | Hard caps: guest 5, user 10, pay for the 11th; weekly limits apply only after paying; remove session limits | Usage/limits model (product-wide) | Engineer, UX Designer, Doctor | L183–231: "I'll get rid of the session limits… no concept of weekly limits anymore… as a guest you can create only 5… upgrade to create 10… 11th entry, then you need to pay" | Not stated | Backend metering change (track entries/week vs credits); interacts w/ gaming risk MOB-117 | Implement entry-based caps; finalise exact numbers |
| MOB-116 | Platform not stated | UX improvement | Emphasise account benefits (more usage) on the upgrade page | Upgrade value isn't framed around the concrete benefit (more entries) | Lead with usage: "10 entries a week vs 5" as the reason to create an account | Profile / upgrade prompt | UX Designer, Engineer | L151–153: "talk more about usage, because that's a benefit of getting an account… up to 10 entries a week versus 5" | Not stated | Depends on final limits (MOB-115) | Rewrite upgrade value proposition around entries |
| MOB-117 | Platform not stated | Risk or constraint | Multi-account gaming of free entry caps | Users could create extra accounts (2 emails) to farm free entries and export PDFs | Deferred — monitor once traction grows | Account creation / limits | UX Designer, Engineer, Doctor | L211–237: "you create 2 accounts… I'll keep transferring PDFs… I don't need to worry about it right now" | Deferred ("concern for the future") | Ties to limits model (MOB-115) | Revisit anti-abuse when user volume grows; no action now |
| MOB-118 | Platform not stated | UI improvement | Settings background too white / low contrast | Settings surface reads as white; "really hard to read" | Use off-white/off-grey even in light mode | Settings screen | UX Designer | L245–249: "Make sure it's not white… off-grey… It's really hard to read" | Not stated | Note: settings are "dummy screens for now" (L251) | Apply an off-white surface token; verify contrast |

### Theme: Account creation & email/OTP verification

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-119 | Platform not stated | Content or terminology | Replace "Verify your email" copy | "Verify your email to save it" reads as if already verifying and is unclear | "Enter your email to save your entries in progress" | Create account — email entry | UX Designer | L257–259: "I don't think that should say 'Verify'… 'Enter your email to save your entries in progress'" | Not stated | None stated | Update email-entry copy |
| MOB-120 | Platform not stated | UX improvement | Split name and verification-code onto separate screens (name first) | Name and OTP code share one screen, which feels "bizarre"; name should come first | Split steps: name (with email) first, then verification; Engineer reuses one component because returning users don't need a name | Create account — name + OTP | UX Designer, Engineer | L269–279: "name and code on the same screen… I would split them up… name should have been the first thing. I agree" | Not stated | Component reuse for returning-user path constrains the design | Design distinct new-user vs returning-user flows; resolve reuse |
| MOB-121 | Platform not stated | Content or terminology | Add a resend-code time expectation | "Didn't receive a code?" sets no expectation, so users hit resend repeatedly (could be a network issue) | Add "If you don't receive a code in the next 5 minutes…" guidance | Create account — OTP wait state | UX Designer, Engineer | L285–289: "is there a time expectation… I need to add that… people will keep hitting that" | Committed ("I need to add that") | None stated | Add resend timing copy; consider resend throttle |

### Theme: Profile identity & avatars

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-122 | Platform not stated | Feature request | Profile avatar: remove the initial "M" circle or offer avatar selection | Image upload isn't supported yet; the initial-circle avatar looks unfinished | Either drop the circle and show full name left-aligned, or offer selectable avatars; ties to a future community/discussion feature | Profile page | UX Designer, Engineer | L293–309: "get rid of that 'M'… Or can you choose an avatar… An avatar might be a nice thing to have" | Not stated | Future "discussion corner" feature context | Decide interim avatar treatment; scope avatar picker |

### Theme: Homepage / dashboard

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-123 | Platform not stated | Feature request | ARCP capability-coverage tracking on the homepage | Coverage tracking flagged as missing/incomplete; users need to see how many capabilities they've covered | Show the review-period coverage tracker (18/15/13 capabilities); "one thing I need to build" | Homepage — review period widget | Engineer, UX Designer | L323, L381–419: "one thing missing… tracking the ARCP coverage"; "that is one thing I need to build" | Not stated | Underpins MOB-128/129/134 | Build/complete the coverage tracker |
| MOB-124 | Platform not stated | UI improvement | Homepage primary CTA: conversation-bubble icon, larger | The main CTA uses a mic icon, duplicating the "voice" meaning used elsewhere; wants more weight | Use a conversation-bubble icon; make it bigger/carry more weight | Homepage — primary action | UX Designer, Engineer | L329–337: "just says 'voice'… conversation bubble instead of a mic… a bit bigger" | Not stated | None stated | Redesign primary CTA icon and sizing |
| MOB-125 | Platform not stated | UX improvement | Scannable "Recent entries" (5 + See all) vs PDP-goals space tension | Recent entries aren't easily scannable; showing them as a list pushes "PDP goals due soon" down | List/scannable view of last 5 entries + "See all"; balance against keeping PDP goals visible; richer cards (metadata, longer title, Dice-app style) | Homepage — recent entries | UX Designer, Engineer | L339–361: "Like a list view? …you can scan them. But then the PDP goals get pushed out" | Not stated | Depends on short AI titles (MOB-107) | Prototype list layout; resolve entries-vs-goals hierarchy |
| MOB-126 | Platform not stated | UI improvement | Add icons/imagery to entries for scannability | Homepage is "very bland… quite textual"; hard to scan | AI-picked icon per entry type / ARCP area or body part; concern most icons would be identical | Homepage — entry cards | UX Designer, Doctor, Engineer | L363–373: "add imagery… icons for the different ARCP areas… 90% of the icons will be the same" | Not stated | Needs an icon set / AI icon selection | Explore an icon system; validate differentiation |
| MOB-127 | Platform not stated | Open question | Define the "PDP goals due soon" window | "Due soon" is undefined; ordering is by nearest expiry but the window ("within a month?") is unconfirmed | Confirm the threshold (e.g. under a month) | Homepage — PDP goals due soon | UX Designer, Engineer | L375–377: "when you say 'due soon,' is that within a month? …I think it might be under a month" | Not stated | None stated | Define and document the "due soon" threshold |

### Theme: Review-period (capability-coverage) tracker

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-128 | Platform not stated | Feature request | Make capability tiles clickable (learn more + linked cases) | Capabilities aren't interactive; users can't learn what each is or which cases are linked | Make each capability clickable to see its meaning and the entries linked to it | Review-period tracker | Engineer, UX Designer | L407–423: "make them clickable so you can learn more… What cases are linked to it? That would be very useful" | Not stated | Depends on entry↔capability linking (MOB-134) | Design capability detail view with linked entries |
| MOB-129 | Platform not stated | UI improvement | Celebratory animation at 100% coverage | Hitting 100% is a milestone with no reward; it's "a celebratory thing" | Add a celebratory animation when coverage reaches 100% | Review-period tracker | UX Designer, Engineer | L419–425: "add an animation when it hits 100%—something celebratory… bring it to life" | Not stated | None stated | Design a 100% celebration moment |
| MOB-130 | Platform not stated | Content or terminology | Trust-building text: capabilities map to RCGP | While building trust, users may not know the capabilities relate to RCGP areas | Add brief text confirming capabilities map to RCGP; deferred ("later") since informed users recognise terms like "Fitness to practise" | Review-period tracker | UX Designer, Doctor | L425–435: "include a bit of text confirming that these relate to the RCGP areas… Okay, later" | Deferred | None stated | Add optional explanatory text later |
| MOB-131 | Platform not stated | UI improvement | Reconsider the "Coverage by domain" section | UX Designer feels the section isn't needed; users can "just dive in" | Consider removing "Coverage by domain" | Review-period tracker | UX Designer | L429: "I don't think you actually need that… you can just dive in" | Not stated | None stated | Validate whether the section adds value; remove if not |
| MOB-132 | Platform not stated | Content or terminology | Explain what a review period is / fix setup copy | The concept is unexplained; "See what capabilities your entries cover" reads as "very weird" wording | Clarify what a review period is; improve setup copy | Review-period setup | UX Designer, Engineer | L383–385: "I need to explain what a review period is… That wording is very weird" | Not stated | None stated | Rewrite review-period explainer and setup copy |
| MOB-133 | Platform not stated | UX improvement | Review-period management: Archive / Edit dates / "start next period" CTA | "Archive" wording is unclear; users may enter wrong dates and need to edit; ending a period needs a clearer action | Provide "Change dates" (like the PDP extend control) + a clearer "I'm done with this period / start next review period" CTA; place both at the bottom | Review-period management | UX Designer, Engineer | L439–463: "'Archive' doesn't sound…"; "I'm done with this review period… start my next review period"; "both of them at the bottom" | Not stated | Reuses the change-dates pattern (MOB-105) | Design review-period edit + completion actions |
| MOB-134 | Platform not stated | Feature request | Link entries to their review period and filter by period | Entries aren't linked to the period they belong to; multi-year users can't view a past period's entries | Link each entry to its review period; add a drop-down to select current/past periods and filter entries accordingly | Review period ↔ entries; filtering | UX Designer, Engineer | L465–491: "link each entry listed here to the period it's from… a drop-down… shows you all your old ones… only the entries from that period" | "important as people move through the different years" | Backend linking + filter | Implement entry↔period linking and a period filter |

### Theme: Accessibility

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-135 | Platform not stated | Accessibility | Layout breaks at large accessibility text sizes | Increasing the device text size (Accessibility → Display) visibly broke the app | Support dynamic/large text sizes without breaking layout | App-wide, triggered via OS text-size setting | UX Designer, Engineer | L495–515: "make it super big… you broke my app… For the next release, you can work on it. You need to" | Deferred to "next release"; UX Designer: "You need to" | Requires responsive/scalable layouts; also a rendering defect (see §6) | Audit layouts against large text sizes; fix scaling |

### Theme: Notifications, engagement & brand

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-136 | Platform not stated | Feature request | Due-date notifications | No notifications exist; users forget as deadlines approach | Notify users as portfolio/PDP dates get closer; not now | Notifications (app-wide) | Engineer, UX Designer | L519–521: "no notifications yet… start notifying people when dates get closer, but not right now" | Deferred ("not right now") | Notification permissions/infra | Plan a notification system post-MVP |
| MOB-137 | Platform not stated | Feature request | Opt-in motivational check-ins / reminders ("Help me stay on track") | Users don't think to log entries or feel it's too much; some want nudges to manage time | Ask at signup whether the user wants regular check-ins; let them pick days/frequency (Runna-style day selection); a "Help me stay on track" module unlocking nudges/alerts | Onboarding + re-engagement | UX Designer, Doctor, Engineer | L523–559: "ask people… when they want to get notified… 'Help me stay on track' module… Remind me on Thursdays and Wednesdays" | Not stated | Depends on notifications (MOB-136); user preference capture | Design an opt-in reminders preference flow |
| MOB-138 | Platform not stated | Feature request | Social-proof / comparison nudges (opt-in, careful tone) | Comparison messaging ("doctors created 2.5–3 entries this week; you're at 0/1") can motivate or increase anxiety | Show progress and peer comparison, but only if the user opts in; frame positively | Re-engagement / dashboard | Engineer, UX Designer, Doctor | L529–557: "You're lagging behind… I don't want an app telling me I'm not putting enough entries in… leave that in the user's hands" | Not stated (risk flagged) | Depends on analytics for averages; opt-in gating | Prototype opt-in comparison; test for anxiety/backlash |
| MOB-139 | Platform not stated | Feature request | Gamification module (points, stars) | Some users respond well to gamified behaviour-change, others don't | A gamification/behaviour-change module as an unlockable set of features | Engagement (app-wide) | UX Designer, Doctor | L553–557: "points and stars—the whole gamification… some people respond really well to that, and some people don't" | Exploratory | Ties to opt-in module (MOB-137) | Explore gamification as optional module later |
| MOB-140 | Platform not stated | Feature request | Communication/content calendar aligned to training year & deanery | Comms could align to fixed UK training milestones (Aug/Feb periods, exams in May) | Build a content calendar around the training year rather than asking each user | Re-engagement / comms strategy | UX Designer, Doctor, Engineer | L561–573: "stay in line with the UK programme… build the content calendar out… exams are in May" | Not stated | Depends on whether periods are fixed (MOB-142) | Confirm fixed dates; build a comms calendar |
| MOB-141 | Platform not stated | User research | Define brand tone of voice / communication style | The app's "voice" (authoritarian vs mentor vs buddy) and brand aren't defined; affects colours | Decide tone using the Nielsen Norman tone-of-voice framework; align colours/brand | Brand / comms (app-wide) | UX Designer, Engineer | L575–589: "How would the app talk to you? What's the brand?… Nielsen Norman has a really good article on tone of voice" | Not stated | Informs colour/brand decisions | Run a tone-of-voice workshop; document brand voice |

### Theme: Review-period configuration (open)

| ID | Platform | Type | Actionable item | User problem | Proposed improvement or alternatives | Screen or journey | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | -------- | ---- | --------------- | ------------ | ------------------------------------ | ----------------- | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| MOB-142 | Platform not stated | Open question | Auto-populate review-period dates vs user selection | Engineer assumed everyone's period differs (users must select); Doctor says dates are fixed (Aug/Feb) for all trainees, so selection may be unnecessary | Either keep manual date entry, or pre-fill from a standard training calendar; may vary by deanery (unconfirmed) | Review-period setup | Engineer, Doctor | L405 vs L565–573: "They need to select it because everybody's period is different" vs "August, February… all the trainees will have the same" | Not stated | Depends on whether periods vary by deanery | Verify deanery date rules; decide manual vs auto dates |

---

## 3. Detailed findings

#### MOB-104 — Make the disabled "Complete goal" button read as disabled
- **Theme:** PDP goals — completion
- **Type:** UI improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The disabled "Complete goal" button "still looks like you could action it" and reads as a secondary rather than disabled action.
- **Underlying user need:** Clear signalling of which actions are currently available.
- **Proposed improvement or alternatives:** Restyle to an unmistakable disabled state, distinct from secondary buttons.
- **Expected outcome:** Not stated (Inferred: fewer taps on unavailable actions).
- **Screen, flow, or journey:** PDP goal — completing a goal once all actions are ticked.
- **Stakeholders:** UX Designer.
- **Supporting evidence:** L9–11.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Button/style system.
- **Decision status:** Observed problem; no decision.
- **Unresolved questions:** Final disabled-state styling.
- **Recommended next step:** Define an explicit disabled visual token separate from secondary.

#### MOB-105 — "Extend / change review-by date" quick action on a PDP goal
- **Theme:** PDP goals — deadlines
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** No quick way to move a PDP goal deadline; users typically push it back, not forward.
- **Underlying user need:** Easily reschedule a goal when it slips.
- **Proposed improvement or alternatives:** "Review by / extend" control opening a pop-up (e.g. +1/+2 weeks); shown alongside archive/delete/cancel.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** PDP goal — editing an active goal.
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L17–21.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Mirrors the review-period "change dates" pattern (MOB-133).
- **Decision status:** Proposed.
- **Unresolved questions:** Preset increments vs custom date.
- **Recommended next step:** Design one reusable "change dates" control shared by PDP goals and review periods.

#### MOB-106 — Rename PDP-goal status "Started" → "In progress"
- **Theme:** PDP goals — status terminology
- **Type:** Content or terminology
- **Platform:** Platform not stated
- **Current problem or observation:** "Started" implies active work; committing a goal to the PDP doesn't mean it's being worked on.
- **Underlying user need:** Status labels that match the user's actual state.
- **Proposed improvement or alternatives:** Use "In progress" for the PDP goal. Entry statuses: "Needs review" → (mark done) → "Completed"; the linked PDP goal moves to "In progress" when an entry is marked done.
- **Expected outcome:** Terminology consistent across entries and PDP goals.
- **Screen, flow, or journey:** PDP goal status; entry↔PDP status mapping.
- **Stakeholders:** Doctor, UX Designer, Engineer.
- **Supporting evidence:** L29–49.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Shared status logic between entry and PDP goal.
- **Decision status:** Agreed (terminology) — "In progress rather than Started… That sounds good."
- **Unresolved questions:** Exact wording for the entry-level "In progress" vs "Completed" edge (some back-and-forth at L37–45).
- **Recommended next step:** Finalise the status vocabulary map across entry and PDP; update copy.

#### MOB-107 — Split a PDP goal into a short title + a description (AI-generated title)
- **Theme:** PDP goals — content model
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** Goal text is "already quite long" and grows; heavy to read, especially when users are tired.
- **Underlying user need:** Quickly recognise a goal at a glance.
- **Proposed improvement or alternatives:** A short PDP title plus a separate description; the AI generates the short title (example: "Safety-netting for lower back pain").
- **Expected outcome:** Neater display that "fits really neatly" across screens.
- **Screen, flow, or journey:** PDP goal display across list/detail and homepage.
- **Stakeholders:** UX Designer, Doctor, Engineer.
- **Supporting evidence:** L51–71.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** AI title generation; feeds homepage card scannability (MOB-126).
- **Decision status:** Agreed in principle ("there'll be a PDP title and a PDP description").
- **Unresolved questions:** AI vs user authoring of the title.
- **Recommended next step:** Define title/description schema; spec the AI title-generation prompt.

#### MOB-108 — Give PDP-goal reflection its own screen
- **Theme:** PDP goals — reflection
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Reflection is inline and can be large; it currently "feels like I could skip that," like an end-of-survey ask.
- **Underlying user need:** Space and prompting to reflect properly on a goal.
- **Proposed improvement or alternatives:** A dedicated reflection screen; future AI-assisted reflection interaction.
- **Expected outcome:** Not stated (Inferred: higher-quality, less-skippable reflections).
- **Screen, flow, or journey:** PDP goal — reflecting after completion.
- **Stakeholders:** Engineer, UX Designer, Doctor.
- **Supporting evidence:** L85–91.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Relates to voice input (MOB-110) and celebratory framing (MOB-109).
- **Decision status:** Proposed ("Maybe it needs its own screen").
- **Unresolved questions:** Whether/when the AI-assisted reflection is built.
- **Recommended next step:** Prototype a standalone reflection screen; test perceived importance.

#### MOB-109 — Add celebratory framing before the reflection
- **Theme:** PDP goals — reflection
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The transition into reflection is flat and doesn't acknowledge the achievement.
- **Underlying user need:** Feel recognised for completing a goal before being asked to reflect.
- **Proposed improvement or alternatives:** "Amazing, well done" then "Now let's start your reflection / let's document how it went."
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** PDP goal — completion → reflection transition.
- **Stakeholders:** UX Designer.
- **Supporting evidence:** L91–93.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Sits on the MOB-108 screen.
- **Decision status:** Proposed.
- **Unresolved questions:** None stated.
- **Recommended next step:** Design a skippable celebratory interstitial.

#### MOB-110 — Voice input on every entry/text field (incl. reflection)
- **Theme:** Data entry
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Fields are type-only; earlier notes also could not be spoken.
- **Underlying user need:** Capture content by voice, consistent with the app's voice-first premise.
- **Proposed improvement or alternatives:** Integrate voice chat "wherever there is an entry field."
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Reflection and all data-entry fields.
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L93–97.
- **Priority or urgency signals:** Committed — "something I will be doing."
- **Dependencies or technical constraints:** Cross-cutting; voice "will cost," affecting the usage/credits model (MOB-114/115).
- **Decision status:** Confirmed intent.
- **Unresolved questions:** Rollout order across fields; billing impact.
- **Recommended next step:** Plan voice-input rollout and account for usage cost.

#### MOB-111 — Auto-return to homepage after completing a PDP goal
- **Theme:** PDP goals — navigation
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** After finishing goal actions, the user isn't returned to a place showing the goal under "Completed."
- **Underlying user need:** Confirmation the goal is done and visible.
- **Proposed improvement or alternatives:** Navigate back to homepage/goal page so it appears under "Completed."
- **Expected outcome:** User sees the completed goal in context.
- **Screen, flow, or journey:** PDP goal completion → navigation.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L99–105.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Consistent with transcript-2 auto-return behaviour.
- **Decision status:** Agreed ("that screen should go back to here… makes sense").
- **Unresolved questions:** Homepage vs goal page as the exact destination.
- **Recommended next step:** Implement post-completion redirect; confirm destination.

#### MOB-112 — Guest→account transfer works; existing-account merge is unbuilt
- **Theme:** Account management
- **Type:** Risk or constraint
- **Platform:** Platform not stated
- **Current problem or observation:** Guest data auto-transfers when upgrading a guest account, but if the user already has an account there's "no way to merge" the two.
- **Underlying user need:** Not lose reflections/cases/goals when creating or linking an account.
- **Proposed improvement or alternatives:** Build guest+existing-account merge (acknowledged harder than guest upgrade).
- **Expected outcome:** No data loss across account paths.
- **Screen, flow, or journey:** Guest → Create account.
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L109–123.
- **Priority or urgency signals:** Not stated ("a bit tricky, but it can be built").
- **Dependencies or technical constraints:** Backend account/data-merge logic.
- **Decision status:** Constraint acknowledged; merge not yet built.
- **Unresolved questions:** Behaviour/warning when a merge isn't possible.
- **Recommended next step:** Scope the merge case; define fallback behaviour and user warning.

#### MOB-113 — Reword "guest session" / "data not saved" messaging
- **Theme:** Account management
- **Type:** Content or terminology
- **Platform:** Platform not stated
- **Current problem or observation:** Copy is system-centric ("guest session", "your data isn't being saved").
- **Underlying user need:** Understand, in plain terms, what's at stake and what to do.
- **Proposed improvement or alternatives:** "You're currently in a temporary session. Create an account to keep your cases and track your progress"; specify "your reflections, cases and goals aren't being saved."
- **Expected outcome:** Clearer, more motivating prompt to create an account.
- **Screen, flow, or journey:** Profile / guest banner.
- **Stakeholders:** UX Designer.
- **Supporting evidence:** L125–127.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Proposed.
- **Unresolved questions:** None stated.
- **Recommended next step:** Rewrite guest-state copy in user language.

#### MOB-114 — Express usage in entries, not AI credits
- **Theme:** Usage & limits
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** "Each AI action uses one credit" is meaningless to users ("that isn't relevant to me"); credits don't map to work.
- **Underlying user need:** Understand remaining usage in terms of what they do — entries.
- **Proposed improvement or alternatives:** Talk in entries (~10–20 credits/entry), show "X out of 10 entries created," and remove AI-credit language from the page.
- **Expected outcome:** "Easier to understand" usage; keep the progress bar but express it as entries.
- **Screen, flow, or journey:** Profile / usage & upgrade.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L135–167, L239–243.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Requires tracking entries (MOB-115); voice cost complicates per-entry accounting (MOB-110).
- **Decision status:** Confirmed intent — "I'm not talking about AI credits at all… I'll just talk in terms of entries."
- **Unresolved questions:** How to reconcile variable per-entry credit cost with a fixed entry count.
- **Recommended next step:** Redesign the usage display around entries; keep credits internal.

#### MOB-115 — Simplify limits to hard entry caps; drop session & weekly-credit limits
- **Theme:** Usage & limits
- **Type:** Decision
- **Platform:** Platform not stated
- **Current problem or observation:** Layered per-session + weekly + credit limits are confusing and penalise bursty use (e.g. logging everything on a Friday); "two things to track rather than one."
- **Underlying user need:** A simple, predictable cap.
- **Proposed improvement or alternatives:** Hard caps — guest 5 entries, user 10, pay for the 11th; weekly limits apply only after paying; remove session limits and the weekly-credit concept.
- **Expected outcome:** Simpler mental model; no penalty for bursty logging.
- **Screen, flow, or journey:** Usage/limits model (product-wide).
- **Stakeholders:** Engineer, UX Designer, Doctor.
- **Supporting evidence:** L183–231 ("no concept of weekly limits anymore… guest… only 5… upgrade… 10… 11th entry, then you need to pay").
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Backend metering change (track entries, not credits); interacts with the gaming risk (MOB-117).
- **Decision status:** Decision — model changed in-session ("I'll get rid of the session limits… no concept of weekly limits anymore").
- **Unresolved questions:** Final exact numbers (5/10/15/20 all mentioned); paid-tier weekly cap.
- **Recommended next step:** Implement entry-based caps; finalise the numbers.

#### MOB-116 — Emphasise account benefits (more usage) on the upgrade page
- **Theme:** Usage & limits
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The upgrade prompt doesn't frame the concrete benefit — more entries.
- **Underlying user need:** A clear reason to create an account.
- **Proposed improvement or alternatives:** Lead with usage: "10 entries a week vs 5."
- **Expected outcome:** Stronger upgrade motivation.
- **Screen, flow, or journey:** Profile / upgrade prompt.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L151–153.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Depends on the final limits (MOB-115).
- **Decision status:** Proposed.
- **Unresolved questions:** None stated.
- **Recommended next step:** Rewrite the upgrade value proposition around entries.

#### MOB-117 — Multi-account gaming of free entry caps
- **Theme:** Usage & limits
- **Type:** Risk or constraint
- **Platform:** Platform not stated
- **Current problem or observation:** Users could create multiple accounts (using extra emails) to farm free entries and export PDFs, evading caps.
- **Underlying user need:** N/A (abuse vector, not a user need).
- **Proposed improvement or alternatives:** No action now; monitor as traction grows.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Account creation / limits.
- **Stakeholders:** UX Designer, Engineer, Doctor.
- **Supporting evidence:** L211–237.
- **Priority or urgency signals:** Deferred ("concern for the future… don't need to worry about it right now").
- **Dependencies or technical constraints:** Tied to the limits model (MOB-115).
- **Decision status:** Deferred.
- **Unresolved questions:** What anti-abuse controls to add later.
- **Recommended next step:** Revisit anti-abuse once user volume grows.

#### MOB-118 — Settings background too white / low contrast
- **Theme:** Visual design
- **Type:** UI improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The Settings surface reads as white and is "really hard to read."
- **Underlying user need:** Legible surfaces in light mode.
- **Proposed improvement or alternatives:** Off-white/off-grey surface even in light mode.
- **Expected outcome:** Improved legibility.
- **Screen, flow, or journey:** Settings screen (noted as a dummy screen for now).
- **Stakeholders:** UX Designer.
- **Supporting evidence:** L245–249.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Settings screens are placeholders (L251).
- **Decision status:** Proposed.
- **Unresolved questions:** None stated.
- **Recommended next step:** Apply an off-white surface token; verify contrast.

#### MOB-119 — Replace "Verify your email" copy
- **Theme:** Account creation
- **Type:** Content or terminology
- **Platform:** Platform not stated
- **Current problem or observation:** "Verify your email to save it" reads as if verification is already happening and is unclear.
- **Underlying user need:** Understand what to enter and why.
- **Proposed improvement or alternatives:** "Enter your email to save your entries in progress."
- **Expected outcome:** Clearer email-entry step.
- **Screen, flow, or journey:** Create account — email entry.
- **Stakeholders:** UX Designer.
- **Supporting evidence:** L257–259.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Proposed.
- **Unresolved questions:** None stated.
- **Recommended next step:** Update the email-entry copy.

#### MOB-120 — Split name and verification-code onto separate screens (name first)
- **Theme:** Account creation
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** Name and OTP code share one screen, which feels "bizarre"; the name should come first.
- **Underlying user need:** A logical, uncluttered sign-up sequence.
- **Proposed improvement or alternatives:** Split into name (with email) first, then verification. Engineer reuses a single component because returning users don't need a name; UX Designer would split them and assume most first-version users are new.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Create account — name + OTP.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L269–279.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Component reuse for the returning-user path constrains the split.
- **Decision status:** Leaning toward split ("I agree") but not resolved against the reuse constraint.
- **Unresolved questions:** How to serve new-user vs returning-user paths without duplicating components.
- **Recommended next step:** Design distinct new-user vs returning-user flows; resolve reuse.

#### MOB-121 — Add a resend-code time expectation
- **Theme:** Account creation
- **Type:** Content or terminology
- **Platform:** Platform not stated
- **Current problem or observation:** "Didn't receive a code?" sets no time expectation, so users hit resend repeatedly (could be a network issue).
- **Underlying user need:** Know how long to wait before retrying.
- **Proposed improvement or alternatives:** Add "If you don't receive a code in the next 5 minutes…" guidance.
- **Expected outcome:** Fewer premature resend attempts.
- **Screen, flow, or journey:** Create account — OTP wait state.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L285–289.
- **Priority or urgency signals:** Committed ("I need to add that").
- **Dependencies or technical constraints:** None stated (Inferred: consider a resend throttle).
- **Decision status:** Confirmed intent.
- **Unresolved questions:** None stated.
- **Recommended next step:** Add resend-timing copy; consider a resend throttle.

#### MOB-122 — Profile avatar: remove the "M" circle or offer avatar selection
- **Theme:** Profile identity
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Image upload isn't supported yet; the initial-letter circle ("M") looks unfinished.
- **Underlying user need:** A personal, polished profile.
- **Proposed improvement or alternatives:** Either drop the circle and show the full name left-aligned, or offer selectable avatars; ties to a future community/discussion feature.
- **Expected outcome:** "Jazz it up a bit"; optional personalisation.
- **Screen, flow, or journey:** Profile page.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L293–309.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Future "discussion corner" feature context.
- **Decision status:** Proposed ("Let me check if I can use some avatars").
- **Unresolved questions:** Avatar set vs image upload.
- **Recommended next step:** Decide the interim avatar treatment; scope an avatar picker.

#### MOB-123 — ARCP capability-coverage tracking on the homepage
- **Theme:** Homepage / coverage
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Coverage tracking was flagged as missing/incomplete; parts of the interactive tracker are "one thing I need to build."
- **Underlying user need:** See progress toward covering all required capabilities.
- **Proposed improvement or alternatives:** Show the review-period coverage tracker (≈13–18 capabilities) with % covered.
- **Expected outcome:** Users gauge ARCP readiness ("you are at 20%… 30%… done").
- **Screen, flow, or journey:** Homepage — review-period widget.
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L323, L381–419.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Underpins MOB-128/129/134.
- **Decision status:** Acknowledged as needed/partly unbuilt.
- **Unresolved questions:** Which screen(s) it lives on (homepage confirmed; Profile mention ambiguous).
- **Recommended next step:** Build/complete the coverage tracker.

#### MOB-124 — Homepage primary CTA: conversation-bubble icon, larger
- **Theme:** Homepage / dashboard
- **Type:** UI improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The main CTA uses a mic icon, duplicating the "voice" meaning used elsewhere; it should carry more weight.
- **Underlying user need:** A clear, prominent primary action distinct from in-flow mic controls.
- **Proposed improvement or alternatives:** Use a conversation-bubble icon; make it bigger.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Homepage — primary action.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L329–337.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Proposed ("a conversation bubble instead of a mic").
- **Unresolved questions:** Final icon and size.
- **Recommended next step:** Redesign the primary CTA icon and sizing.

#### MOB-125 — Scannable "Recent entries" (5 + See all) vs PDP-goals space
- **Theme:** Homepage / dashboard
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** Recent entries aren't easily scannable; making them a list pushes "PDP goals due soon" down the page.
- **Underlying user need:** Quickly scan recent work without losing sight of upcoming goals.
- **Proposed improvement or alternatives:** List view of the last 5 entries + "See all"; richer cards (metadata/when created, longer AI title, "Dice-app" style); balance against keeping PDP goals visible.
- **Expected outcome:** Easier scanning of recent entries.
- **Screen, flow, or journey:** Homepage — recent entries.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L339–361.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Depends on short AI titles (MOB-107).
- **Decision status:** Under discussion; hierarchy trade-off unresolved.
- **Unresolved questions:** How many entries (3 vs 5) and how to balance vs PDP goals.
- **Recommended next step:** Prototype the list layout; resolve the entries-vs-goals hierarchy.

#### MOB-126 — Add icons/imagery to entries for scannability
- **Theme:** Homepage / dashboard
- **Type:** UI improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The homepage is "very bland… quite textual" and hard to scan.
- **Underlying user need:** Visual anchors to scan entries faster.
- **Proposed improvement or alternatives:** AI-picked icon per entry type / ARCP area / body part; concern that ~90% of icons would be identical (most are clinical case reviews).
- **Expected outcome:** More life and easier scanning.
- **Screen, flow, or journey:** Homepage — entry cards.
- **Stakeholders:** UX Designer, Doctor, Engineer.
- **Supporting evidence:** L363–373.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Needs an icon set / AI icon selection.
- **Decision status:** Proposed ("I can check with Claude… good icons").
- **Unresolved questions:** How to keep icons differentiated given most entries are the same type.
- **Recommended next step:** Explore an icon system; validate differentiation.

#### MOB-127 — Define the "PDP goals due soon" window
- **Theme:** Homepage / dashboard
- **Type:** Open question
- **Platform:** Platform not stated
- **Current problem or observation:** "Due soon" is undefined; items are ordered by nearest expiry but the threshold is unconfirmed.
- **Underlying user need:** Predictable, meaningful "due soon" grouping.
- **Proposed improvement or alternatives:** Confirm the window (e.g. under a month).
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Homepage — PDP goals due soon.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L375–377.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Open question.
- **Unresolved questions:** The exact threshold.
- **Recommended next step:** Define and document the "due soon" threshold.

#### MOB-128 — Make capability tiles clickable (learn more + linked cases)
- **Theme:** Review-period tracker
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Capability tiles aren't interactive; users can't learn what each is or which cases are linked.
- **Underlying user need:** Understand each capability and see the entries covering it.
- **Proposed improvement or alternatives:** Make each capability clickable to view its meaning and linked entries.
- **Expected outcome:** "Very useful"; users see number/identity of entries per capability.
- **Screen, flow, or journey:** Review-period tracker.
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L407–423 (also noted "suggested earlier").
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Depends on entry↔capability linking (MOB-134).
- **Decision status:** Agreed as needed ("that is one thing I need to build").
- **Unresolved questions:** Detail-view content.
- **Recommended next step:** Design a capability detail view with linked entries.

#### MOB-129 — Celebratory animation at 100% coverage
- **Theme:** Review-period tracker
- **Type:** UI improvement
- **Platform:** Platform not stated
- **Current problem or observation:** Reaching 100% coverage is a milestone with no reward; it's meant to be "a celebratory thing."
- **Underlying user need:** Feel rewarded for completing coverage.
- **Proposed improvement or alternatives:** Add a celebratory animation at 100%.
- **Expected outcome:** "Bring it to life."
- **Screen, flow, or journey:** Review-period tracker.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L419–425.
- **Priority or urgency signals:** Not stated ("a real opportunity").
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Proposed.
- **Unresolved questions:** None stated.
- **Recommended next step:** Design a 100% celebration moment.

#### MOB-130 — Trust-building text: capabilities map to RCGP
- **Theme:** Review-period tracker
- **Type:** Content or terminology
- **Platform:** Platform not stated
- **Current problem or observation:** Users may not know the capabilities relate to RCGP areas while trust is still being established.
- **Underlying user need:** Confidence the tracker reflects official curriculum areas.
- **Proposed improvement or alternatives:** Add brief text confirming the capabilities map to RCGP areas.
- **Expected outcome:** Builds trust for less-informed users.
- **Screen, flow, or journey:** Review-period tracker.
- **Stakeholders:** UX Designer, Doctor.
- **Supporting evidence:** L425–435 (informed users recognise terms like "Fitness to practise").
- **Priority or urgency signals:** Deferred ("Okay, later").
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Deferred.
- **Unresolved questions:** Whether it's needed given the target audience.
- **Recommended next step:** Add optional explanatory text later.

#### MOB-131 — Reconsider the "Coverage by domain" section
- **Theme:** Review-period tracker
- **Type:** UI improvement
- **Platform:** Platform not stated
- **Current problem or observation:** The UX Designer feels "Coverage by domain" isn't needed; users can "just dive in."
- **Underlying user need:** A tracker free of low-value sections.
- **Proposed improvement or alternatives:** Consider removing the section.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Review-period tracker.
- **Stakeholders:** UX Designer.
- **Supporting evidence:** L429.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Proposed (removal candidate; not confirmed).
- **Unresolved questions:** Whether any users rely on it.
- **Recommended next step:** Validate value; remove if unused.

#### MOB-132 — Explain what a review period is / fix setup copy
- **Theme:** Review-period tracker
- **Type:** Content or terminology
- **Platform:** Platform not stated
- **Current problem or observation:** The review-period concept is unexplained; "See what capabilities your entries cover" reads as "very weird."
- **Underlying user need:** Understand what a review period is and how to set it up.
- **Proposed improvement or alternatives:** Clarify the concept and rewrite the setup copy.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Review-period setup.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L383–385.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** None stated.
- **Decision status:** Acknowledged ("I need to explain what a review period is").
- **Unresolved questions:** Final wording.
- **Recommended next step:** Rewrite the review-period explainer and setup copy.

#### MOB-133 — Review-period management: Archive / Edit dates / "start next period" CTA
- **Theme:** Review-period management
- **Type:** UX improvement
- **Platform:** Platform not stated
- **Current problem or observation:** "Archive" wording is unclear; users may enter wrong dates and need to edit; ending a period lacks a clear action.
- **Underlying user need:** Correct mistakes and cleanly end/start review periods.
- **Proposed improvement or alternatives:** A "Change dates" control (like the PDP extend pattern) plus a clearer "I'm done with this period / start my next review period" CTA; place both at the bottom.
- **Expected outcome:** Clearer period lifecycle management.
- **Screen, flow, or journey:** Review-period management.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L439–463.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Reuses the change-dates pattern (MOB-105).
- **Decision status:** Proposed / converging (edit + archive both wanted).
- **Unresolved questions:** Final labels (Archive vs "I'm done").
- **Recommended next step:** Design review-period edit + completion actions.

#### MOB-134 — Link entries to their review period and filter by period
- **Theme:** Review-period management
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Entries aren't linked to the period they belong to; multi-year users can't view a past period's entries (currently "No" access).
- **Underlying user need:** Revisit and filter entries by the review period they belong to over multiple years.
- **Proposed improvement or alternatives:** Link each entry to its review period; add a drop-down to pick current/past periods and filter entries.
- **Expected outcome:** "Important as people move through the different years."
- **Screen, flow, or journey:** Review period ↔ entries; filtering.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L465–491.
- **Priority or urgency signals:** "important"; Engineer: "needed for sure… not that difficult to build."
- **Dependencies or technical constraints:** Backend entry↔period linking + filter UI.
- **Decision status:** Agreed as needed.
- **Unresolved questions:** Where the period filter lives.
- **Recommended next step:** Implement entry↔period linking and a period filter.

#### MOB-135 — Layout breaks at large accessibility text sizes
- **Theme:** Accessibility
- **Type:** Accessibility
- **Platform:** Platform not stated
- **Current problem or observation:** Increasing the device text size (Accessibility → Display) visibly broke the app ("you broke my app"); "there is some struggling there. It's already big."
- **Underlying user need:** Usable layouts at larger text sizes for low-vision users.
- **Proposed improvement or alternatives:** Support dynamic/large text without breaking layout.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** App-wide, triggered via the OS text-size setting.
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L495–515.
- **Priority or urgency signals:** UX Designer: "You need to"; Engineer defers to "the next release."
- **Dependencies or technical constraints:** Responsive/scalable layouts; a real rendering defect (see §6).
- **Decision status:** Deferred to next release.
- **Unresolved questions:** Which screens break and how badly.
- **Recommended next step:** Audit layouts against large text sizes; fix scaling.

#### MOB-136 — Due-date notifications
- **Theme:** Notifications
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** No notifications exist; users forget as deadlines approach.
- **Underlying user need:** Timely reminders before dates are due.
- **Proposed improvement or alternatives:** Notify users as portfolio/PDP dates get closer.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Notifications (app-wide).
- **Stakeholders:** Engineer, UX Designer.
- **Supporting evidence:** L519–521.
- **Priority or urgency signals:** Deferred ("not right now").
- **Dependencies or technical constraints:** Notification permissions/infrastructure.
- **Decision status:** Deferred.
- **Unresolved questions:** Timing/frequency.
- **Recommended next step:** Plan a notification system post-MVP.

#### MOB-137 — Opt-in motivational check-ins / reminders ("Help me stay on track")
- **Theme:** Engagement & retention
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Users don't think to log entries or find it too much; some want structured nudges.
- **Underlying user need:** Support to build a logging habit on their own terms.
- **Proposed improvement or alternatives:** Ask at signup whether they want regular check-ins; let them pick days/frequency (Runna-style day selection); a "Help me stay on track" module unlocking nudges/alerts.
- **Expected outcome:** Better time management and consistency.
- **Screen, flow, or journey:** Onboarding + re-engagement.
- **Stakeholders:** UX Designer, Doctor, Engineer.
- **Supporting evidence:** L523–559.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Depends on notifications (MOB-136); preference capture at signup.
- **Decision status:** Proposed.
- **Unresolved questions:** Frequency options; where preferences are set.
- **Recommended next step:** Design an opt-in reminders preference flow.

#### MOB-138 — Social-proof / comparison nudges (opt-in, careful tone)
- **Theme:** Engagement & retention
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Comparison messaging ("doctors created 2.5–3 entries this week; you're at 0/1") can motivate some but raise anxiety for others.
- **Underlying user need:** Motivation without pressure or judgement.
- **Proposed improvement or alternatives:** Show progress/peer comparison only if opted in; frame positively; "leave that in the user's hands."
- **Expected outcome:** Motivates the users who want it without alienating others.
- **Screen, flow, or journey:** Re-engagement / dashboard.
- **Stakeholders:** Engineer, UX Designer, Doctor.
- **Supporting evidence:** L529–557 (Doctor: "I don't want an app telling me I'm not putting enough entries in").
- **Priority or urgency signals:** Not stated (risk flagged).
- **Dependencies or technical constraints:** Needs analytics for peer averages; opt-in gating.
- **Decision status:** Proposed; tone/opt-in guardrails agreed.
- **Unresolved questions:** How averages are computed and displayed.
- **Recommended next step:** Prototype opt-in comparison; test for anxiety/backlash.

#### MOB-139 — Gamification module (points, stars)
- **Theme:** Engagement & retention
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Some users respond well to gamified behaviour-change, others don't.
- **Underlying user need:** Optional motivation mechanics.
- **Proposed improvement or alternatives:** A gamification/behaviour-change module (points, stars) as an unlockable feature set.
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Engagement (app-wide).
- **Stakeholders:** UX Designer, Doctor.
- **Supporting evidence:** L553–557.
- **Priority or urgency signals:** Exploratory.
- **Dependencies or technical constraints:** Ties to the opt-in module (MOB-137).
- **Decision status:** Exploratory.
- **Unresolved questions:** Scope of mechanics.
- **Recommended next step:** Explore gamification as an optional module later.

#### MOB-140 — Communication/content calendar aligned to training year & deanery
- **Theme:** Engagement & retention
- **Type:** Feature request
- **Platform:** Platform not stated
- **Current problem or observation:** Comms could align to fixed UK training milestones (Aug/Feb review periods, exams in May) rather than ad-hoc prompts.
- **Underlying user need:** Reminders that match the real training calendar.
- **Proposed improvement or alternatives:** Build a content calendar around the training year and key milestones.
- **Expected outcome:** "Really cool" milestone-aware comms.
- **Screen, flow, or journey:** Re-engagement / comms strategy.
- **Stakeholders:** UX Designer, Doctor, Engineer.
- **Supporting evidence:** L561–573.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Depends on whether periods are fixed (MOB-142).
- **Decision status:** Proposed.
- **Unresolved questions:** Deanery variation.
- **Recommended next step:** Confirm fixed dates; build a comms calendar.

#### MOB-141 — Define brand tone of voice / communication style
- **Theme:** Brand & comms
- **Type:** User research
- **Platform:** Platform not stated
- **Current problem or observation:** The app's voice (authoritarian vs mentor vs buddy) and brand aren't defined, and this affects colour choices.
- **Underlying user need:** A consistent, appropriate voice users can relate to.
- **Proposed improvement or alternatives:** Decide tone using the Nielsen Norman tone-of-voice framework; align colours/brand accordingly.
- **Expected outcome:** A coherent brand that "shapes a lot" of design decisions.
- **Screen, flow, or journey:** Brand / comms (app-wide).
- **Stakeholders:** UX Designer, Engineer.
- **Supporting evidence:** L575–589.
- **Priority or urgency signals:** Not stated ("a lot to think about… ongoing process").
- **Dependencies or technical constraints:** Informs colour/brand decisions.
- **Decision status:** Proposed.
- **Unresolved questions:** Chosen tone position.
- **Recommended next step:** Run a tone-of-voice workshop; document brand voice.

#### MOB-142 — Auto-populate review-period dates vs user selection
- **Theme:** Review-period configuration
- **Type:** Open question
- **Platform:** Platform not stated
- **Current problem or observation:** The Engineer assumed each user's period differs (so users must select dates), while the Doctor says the period is fixed (Aug/Feb) for all trainees — implying selection may be unnecessary.
- **Underlying user need:** Correct period dates with minimal manual effort.
- **Proposed improvement or alternatives:** Keep manual date entry, or pre-fill from a standard training calendar; may vary by deanery (unconfirmed).
- **Expected outcome:** Not stated.
- **Screen, flow, or journey:** Review-period setup.
- **Stakeholders:** Engineer, Doctor.
- **Supporting evidence:** L405 vs L565–573.
- **Priority or urgency signals:** Not stated.
- **Dependencies or technical constraints:** Depends on whether periods vary by deanery.
- **Decision status:** Undecided (conflicting assumptions).
- **Unresolved questions:** Do start/end dates vary by deanery or LTFT status?
- **Recommended next step:** Verify deanery date rules; decide manual vs auto dates.

---

## 4. User-journey findings

### Onboarding
- **Main user problems:** Usage/limits and account benefits are communicated in system terms (credits) rather than user terms (entries); motivational preferences aren't captured.
- **Proposed improvements/alternatives:** Ask about motivational check-ins at signup (MOB-137); frame benefits as entries (MOB-114, MOB-116).
- **Relevant IDs:** MOB-114, MOB-116, MOB-137.
- **Supporting evidence:** L135–167, L523–559.
- **Outstanding questions:** Which preferences are captured at signup vs later.

### Registration or login (account creation & OTP)
- **Main user problems:** Confusing "Verify your email" copy; name and code crammed on one screen; no resend-code time expectation; existing-account merge unbuilt.
- **Proposed improvements/alternatives:** Reword email step (MOB-119); split name/code screens (MOB-120); add resend timing (MOB-121); build account merge (MOB-112).
- **Relevant IDs:** MOB-112, MOB-119, MOB-120, MOB-121.
- **Supporting evidence:** L109–123, L257–289.
- **Outstanding questions:** New-user vs returning-user flow separation; merge behaviour.

### Core product experience (PDP goals, reflection, entries)
- **Main user problems:** Disabled button ambiguity; no quick deadline extend; misleading "Started" status; long goal text; skippable inline reflection; type-only fields; no return-to-context after completion.
- **Proposed improvements/alternatives:** MOB-104, MOB-105, MOB-106, MOB-107, MOB-108, MOB-109, MOB-110, MOB-111.
- **Relevant IDs:** MOB-104–MOB-111.
- **Supporting evidence:** L7–105.
- **Outstanding questions:** Status vocabulary edges; AI title authoring.

### Search or discovery (homepage scanning & coverage)
- **Main user problems:** Bland, textual homepage; recent entries not scannable and competing with PDP goals; capabilities not clickable; entries not linked to review periods; past-period entries inaccessible.
- **Proposed improvements/alternatives:** MOB-124, MOB-125, MOB-126, MOB-128, MOB-134.
- **Relevant IDs:** MOB-123–MOB-134.
- **Supporting evidence:** L329–491.
- **Outstanding questions:** "Due soon" window (MOB-127); whether "Coverage by domain" stays (MOB-131).

### Profile and settings
- **Main user problems:** Unfinished initial-avatar; low-contrast settings surface; guest-state copy is system-centric.
- **Proposed improvements/alternatives:** MOB-113, MOB-118, MOB-122.
- **Relevant IDs:** MOB-113, MOB-118, MOB-122.
- **Supporting evidence:** L125–129, L245–309.
- **Outstanding questions:** Avatar approach; settings are placeholders.

### Notifications
- **Main user problems:** No notifications exist yet; opportunity for opt-in reminders and milestone comms.
- **Proposed improvements/alternatives:** MOB-136, MOB-137, MOB-140.
- **Relevant IDs:** MOB-136, MOB-137, MOB-140.
- **Supporting evidence:** L519–573.
- **Outstanding questions:** Permission/infra timing; deanery date variation.

### Re-engagement and retention
- **Main user problems:** Users forget to log; motivation styles differ (nudges help some, pressure others).
- **Proposed improvements/alternatives:** Opt-in check-ins (MOB-137); careful, opt-in comparison (MOB-138); optional gamification (MOB-139); brand tone definition (MOB-141).
- **Relevant IDs:** MOB-137, MOB-138, MOB-139, MOB-141.
- **Supporting evidence:** L523–589.
- **Outstanding questions:** How comparisons are computed; chosen tone.

### Task completion (usage limits)
- **Main user problems:** Layered session/weekly/credit limits are hard to track; caps could be gamed via multiple accounts.
- **Proposed improvements/alternatives:** Hard entry caps (MOB-115); entry-based language (MOB-114); monitor abuse (MOB-117).
- **Relevant IDs:** MOB-114, MOB-115, MOB-117.
- **Supporting evidence:** L133–243.
- **Outstanding questions:** Final numbers; anti-abuse.

*(App installation/first launch, Help and support: not discussed — omitted.)*

---

## 5. Platform-specific findings

#### iOS
- None. No item was attributed specifically to iOS.

#### Android
- None. No item was attributed specifically to Android.

#### Both platforms
- None explicitly stated. (MOB-135's OS text-size setting and MOB-136's notifications exist on both iOS and Android, but the transcript never states a platform, so they are listed under *Platform not stated*.)

#### Platform not stated
- **MOB-104 – MOB-142 (all items):** The transcript never names iOS or Android. On-device signals (airplane mode L79, OTP copy L281, Accessibility → Display text size L495–515) confirm a mobile device but do not distinguish the OS. Route none to a single-platform team on this evidence.

---

## 6. Bugs and technical issues

**MOB-135 — Layout breaks at large accessibility text sizes**
- **Item ID:** MOB-135
- **Issue:** Increasing the device text size breaks the app's layout.
- **Platform:** Platform not stated (triggered via the OS Accessibility → Display text-size setting).
- **Affected screen or flow:** App-wide (observed live during the walkthrough).
- **User impact:** Low-vision users who enlarge text encounter a broken/unusable layout.
- **Reproduction details:** Open device Accessibility → Display, increase text size to a large/maximum value, return to the app (Engineer killed and reopened the app to re-test). — as stated.
- **Frequency:** Not stated (reproduced once in-session).
- **Severity:** Not stated (Engineer: "I'm going to struggle with that"; UX Designer: "You need to").
- **Device, OS version, or app version:** Not stated.
- **Supporting evidence:** L495–515.
- **Suspected cause:** Not stated (Inferred, not asserted: non-scalable/fixed layouts).
- **Missing information required for investigation:** Device/OS, which screens break, at what text-size threshold, and screenshots.

*No other functional defect was explicitly identified this session. (Guest→existing-account merge, MOB-112, is a missing capability/constraint rather than a defect and is tracked as a risk.)*

---

## 7. Decisions already made

**MOB-106 — Rename PDP-goal status "Started" → "In progress"**
- **Decision:** Use "In progress" instead of "Started" for PDP goals; align with entry statuses.
- **Platform:** Platform not stated.
- **Screen/journey:** PDP goal status.
- **Reason:** Committing a goal ≠ actively working on it; "In progress" fits the other terminology.
- **Decision-maker/owner:** Consensus (Doctor proposed, UX Designer + Engineer agreed).
- **Supporting evidence:** L29–49.
- **Dependencies:** Shared entry↔PDP status logic.
- **Required action:** Update status labels and mapping.

**MOB-107 — Split PDP goal into a short title + description (AI title)**
- **Decision:** A PDP goal has a short title plus a description; the AI generates the short title.
- **Platform:** Platform not stated.
- **Screen/journey:** PDP goal content model.
- **Reason:** Goal text is too long to read comfortably.
- **Decision-maker/owner:** Consensus.
- **Supporting evidence:** L51–71.
- **Dependencies:** AI title generation.
- **Required action:** Define schema; spec the title prompt.

**MOB-110 — Voice input on every entry field**
- **Decision:** Integrate voice input wherever there's an entry field.
- **Platform:** Platform not stated.
- **Screen/journey:** All data-entry fields incl. reflection.
- **Reason:** Fields are type-only; voice is core to the product.
- **Decision-maker/owner:** Engineer ("something I will be doing").
- **Supporting evidence:** L93–97.
- **Dependencies:** Usage/cost accounting (voice "will cost").
- **Required action:** Plan voice rollout across fields.

**MOB-111 — Auto-return to homepage after completing a PDP goal**
- **Decision:** Navigate back to the homepage/goal page after completion so it appears under "Completed."
- **Platform:** Platform not stated.
- **Screen/journey:** PDP goal completion → navigation.
- **Reason:** User should see the completed goal in context.
- **Decision-maker/owner:** Consensus (UX Designer + Engineer).
- **Supporting evidence:** L99–105.
- **Dependencies:** None stated.
- **Required action:** Implement the post-completion redirect.

**MOB-114 — Express usage as entries, not AI credits**
- **Decision:** Remove AI-credit language from the page; communicate usage in entries (e.g. "X out of 10 entries created").
- **Platform:** Platform not stated.
- **Screen/journey:** Profile / usage.
- **Reason:** Credits are meaningless to users.
- **Decision-maker/owner:** Engineer ("I'm not talking about AI credits at all… I'll just talk in terms of entries"), with UX Designer.
- **Supporting evidence:** L135–167, L239–243.
- **Dependencies:** Entry-based tracking (MOB-115).
- **Required action:** Redesign usage display around entries.

**MOB-115 — Hard entry caps; drop session & weekly-credit limits**
- **Decision:** Remove session limits and the weekly-credit model; use hard entry caps (guest 5, user 10, pay beyond); weekly limits apply only on the paid tier.
- **Platform:** Platform not stated.
- **Screen/journey:** Usage/limits model.
- **Reason:** Simpler to understand; avoids penalising bursty use.
- **Decision-maker/owner:** Engineer, after discussion with UX Designer/Doctor.
- **Supporting evidence:** L183–231.
- **Dependencies:** Backend metering change; anti-abuse (MOB-117).
- **Required action:** Implement entry-based caps; finalise exact numbers.

**MOB-121 — Add a resend-code time expectation**
- **Decision:** Add guidance on how long to wait for the OTP (e.g. "next 5 minutes").
- **Platform:** Platform not stated.
- **Screen/journey:** Create account — OTP wait state.
- **Reason:** Stops users from hammering resend.
- **Decision-maker/owner:** Engineer ("I need to add that").
- **Supporting evidence:** L285–289.
- **Dependencies:** None stated.
- **Required action:** Add resend-timing copy.

*(Deferred, not decisions: MOB-117 anti-abuse, MOB-130 RCGP trust text, MOB-135 large-text fix, MOB-136 notifications — all explicitly pushed to later/next release.)*

---

## 8. Open questions and follow-ups

### Product
- **MOB-115** — Final exact entry caps (5/10/15/20 all floated) and the paid-tier weekly limit. *Unresolved:* numbers not settled. *Owner:* Not clear (Engineer leading).
- **MOB-117** — What anti-abuse controls to add against multi-account farming. *Unresolved:* deferred to future traction. *Owner:* Not clear.
- **MOB-127** — Define the "PDP goals due soon" window. *Unresolved:* threshold unconfirmed. *Owner:* Not clear.
- **MOB-140 / MOB-142** — Whether review-period dates are fixed nationally or vary by deanery/LTFT (drives auto-calendar). *Unresolved:* conflicting assumptions. *Dependency:* deanery rules.

### UX and design
- **MOB-120** — How to serve new-user vs returning-user account flows without duplicating the shared component. *Unresolved:* reuse vs split trade-off. *Owner:* UX Designer + Engineer.
- **MOB-125** — Recent-entries list layout vs keeping PDP goals visible (and 3 vs 5 entries). *Unresolved:* hierarchy trade-off.
- **MOB-131** — Whether "Coverage by domain" stays. *Unresolved:* value unvalidated.
- **MOB-133** — Final labels for review-period Archive/Edit/"start next period." *Unresolved:* wording.
- **MOB-141** — Chosen brand tone of voice (drives colours). *Unresolved:* not decided.

### iOS engineering
- No iOS-specific follow-ups (platform never identified). See cross-cutting item below.

### Android engineering
- No Android-specific follow-ups (platform never identified). See cross-cutting item below.

### Cross-cutting (platform unresolved)
- **All items** — Confirm the target platform(s). *Unresolved:* transcript never names iOS/Android; MOB-135 (OS text-size) and MOB-136 (notifications) will need per-platform handling once identified.

### Backend engineering
- **MOB-112** — Build guest+existing-account merge and define fallback when merge isn't possible. *Unresolved:* "no way to merge" today.
- **MOB-115** — Re-platform metering from credits to entries-per-week. *Dependency:* limits decision.
- **MOB-134** — Entry↔review-period linking and period filtering. *Owner:* Engineer ("needed for sure").

### Analytics
- **MOB-138** — How to compute/display peer averages ("doctors created 2.5–3 entries this week"). *Unresolved:* data source and presentation.

### User research
- **MOB-138 / MOB-139** — Validate motivational/comparison and gamification tactics for anxiety vs motivation across user types. *Unresolved:* effect differs by person.
- **MOB-141** — Tone-of-voice exploration (Nielsen Norman framework).

### Privacy and security
- **MOB-117** — Multi-account abuse to farm free entries/PDFs. *Unresolved:* deferred; no controls defined.
- **MOB-112** — Ensure account merge doesn't cross-expose data between accounts. *Unresolved:* merge design pending. *(Inferred consideration; not raised as a privacy point in-session.)*

---

## 9. Conflicting viewpoints and alternatives

**MOB-120 — Name + verification-code on one screen**
- **Shared problem:** Where to place name vs OTP in account creation.
- **Proposal A:** Keep one shared component/screen — returning users don't need a name (Engineer).
- **Proposal B:** Split the steps, name first, assuming most first-version users are new (UX Designer).
- **Stakeholders:** Engineer (A), UX Designer (B).
- **Decision status:** Leaning B ("I agree") but unresolved against the reuse constraint.
- **Evidence:** L269–279.

**MOB-142 — Review-period dates: user-selected vs auto**
- **Shared problem:** How review-period start/end dates are set.
- **Proposal A:** Users select, because "everybody's period is different" (Engineer).
- **Proposal B:** Dates are fixed (Aug/Feb) for all trainees, so build a calendar instead of asking (Doctor).
- **Stakeholders:** Engineer (A), Doctor (B).
- **Decision status:** Undecided; deanery/LTFT variation unconfirmed.
- **Evidence:** L405 vs L565–573.

**MOB-138 — Comparison/pressure nudges**
- **Shared problem:** How to motivate logging without harming users.
- **Proposal A:** Peer-comparison / "you're lagging behind" messaging (Engineer floated).
- **Proposal B:** Avoid pressure — "I don't want an app telling me I'm not putting enough entries in"; make it opt-in and positive (Doctor).
- **Stakeholders:** Engineer (A), Doctor (B), UX Designer (mediating → opt-in).
- **Decision status:** Converged on opt-in/optional; exact mechanics undecided.
- **Evidence:** L529–557.

**MOB-125 — Recent entries vs PDP goals for homepage space**
- **Shared problem:** Limited homepage real estate.
- **Proposal A:** Show recent entries as a scannable list (UX Designer).
- **Proposal B:** Concern that this pushes "PDP goals due soon" out of view (Engineer).
- **Stakeholders:** UX Designer (A), Engineer (B).
- **Decision status:** Undecided ("it's a good point").
- **Evidence:** L343–349.

**MOB-131 — "Coverage by domain" section**
- **Shared problem:** Whether the section earns its place.
- **Proposal A:** Remove it — users can "just dive in" (UX Designer).
- **Proposal B:** (Implicit) keep as-is.
- **Stakeholders:** UX Designer (A).
- **Decision status:** Undecided (removal candidate).
- **Evidence:** L429.

**MOB-133 — "Archive" vs "I'm done with this period"**
- **Shared problem:** Labelling the end-of-review-period action.
- **Proposal A:** "Archive" (current).
- **Proposal B:** A clearer CTA like "I'm done with this period / start my next review period," plus a separate "Change dates" (UX Designer).
- **Stakeholders:** UX Designer, Engineer.
- **Decision status:** Undecided labels; both edit + end actions wanted.
- **Evidence:** L439–463.

**Deferred ideas:** MOB-117 (anti-abuse), MOB-130 (RCGP trust text), MOB-135 (large-text fix → next release), MOB-136 (notifications → "not right now"), MOB-139 (gamification → exploratory).

**Rejected ideas:** None explicitly rejected this session.

---

## 10. Prioritisation-ready backlog

| ID | Platform | Theme | Title | Type | Evidence strength | Stated urgency | Expected impact | Estimated effort | Recommended owner |
| -- | -------- | ----- | ----- | ---- | ----------------- | -------------- | --------------- | ---------------- | ----------------- |
| MOB-104 | Platform not stated | PDP goals | Disabled "Complete goal" button doesn't look disabled | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-105 | Platform not stated | PDP goals | Extend/change review-by date quick action | Feature request | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-106 | Platform not stated | PDP goals | Rename status "Started" → "In progress" | Content or terminology | Strong | Not stated | Not stated | Not stated | Product |
| MOB-107 | Platform not stated | PDP goals | Short PDP title + description (AI title) | UX improvement | Strong | Not stated | Not stated | Not stated | Product |
| MOB-108 | Platform not stated | PDP goals | Reflection gets its own screen | Feature request | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-109 | Platform not stated | PDP goals | Celebratory framing before reflection | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-110 | Platform not stated | Data entry | Voice input on every field | Feature request | Strong | Not stated | Not stated | Not stated | Backend Engineering |
| MOB-111 | Platform not stated | PDP goals | Auto-return to homepage after completion | UX improvement | Strong | Not stated | Not stated | Not stated | Mobile UX |
| MOB-112 | Platform not stated | Account mgmt | Guest→existing-account merge unbuilt | Risk or constraint | Moderate | Not stated | Not stated | Not stated ("can be built") | Backend Engineering |
| MOB-113 | Platform not stated | Account mgmt | Reword guest/temporary-session copy | Content or terminology | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-114 | Platform not stated | Usage & limits | Express usage in entries not credits | UX improvement | Strong | Not stated | "easier to understand" | Not stated | Product |
| MOB-115 | Platform not stated | Usage & limits | Hard entry caps; drop session/weekly-credit limits | Decision | Strong | Not stated | Not stated | "change the entire system" | Product |
| MOB-116 | Platform not stated | Usage & limits | Emphasise account benefits (more usage) | UX improvement | Moderate | Not stated | Not stated | Not stated | Product |
| MOB-117 | Platform not stated | Usage & limits | Multi-account gaming risk | Risk or constraint | Moderate | Not stated (deferred) | Not stated | Not stated | Security |
| MOB-118 | Platform not stated | Visual design | Settings background too white / low contrast | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-119 | Platform not stated | Account creation | Replace "Verify your email" copy | Content or terminology | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-120 | Platform not stated | Account creation | Split name & code screens (name first) | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-121 | Platform not stated | Account creation | Add resend-code time expectation | Content or terminology | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-122 | Platform not stated | Profile identity | Avatar: remove "M" circle or offer avatars | Feature request | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-123 | Platform not stated | Homepage/coverage | ARCP coverage tracking on homepage | Feature request | Moderate | Not stated | Not stated | Not stated | Product |
| MOB-124 | Platform not stated | Homepage | Primary CTA: conversation-bubble icon, larger | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-125 | Platform not stated | Homepage | Scannable recent entries vs PDP-goals space | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-126 | Platform not stated | Homepage | Icons/imagery on entries for scannability | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-127 | Platform not stated | Homepage | Define "due soon" window | Open question | Weak | Not stated | Not stated | Not stated | Product |
| MOB-128 | Platform not stated | Review-period tracker | Clickable capability tiles (+ linked cases) | Feature request | Strong | Not stated | "very useful" | Not stated | Mobile UX |
| MOB-129 | Platform not stated | Review-period tracker | Celebratory animation at 100% coverage | UI improvement | Moderate | Not stated | Not stated | Not stated | UI Design |
| MOB-130 | Platform not stated | Review-period tracker | RCGP trust-building text | Content or terminology | Weak | Not stated (deferred) | Not stated | Not stated | Mobile UX |
| MOB-131 | Platform not stated | Review-period tracker | Reconsider "Coverage by domain" section | UI improvement | Weak | Not stated | Not stated | Not stated | UI Design |
| MOB-132 | Platform not stated | Review-period tracker | Explain review period / fix setup copy | Content or terminology | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-133 | Platform not stated | Review-period mgmt | Archive/Edit/"start next period" actions | UX improvement | Moderate | Not stated | Not stated | Not stated | Mobile UX |
| MOB-134 | Platform not stated | Review-period mgmt | Link entries to period + filter by period | Feature request | Strong | "important" | Not stated | "not that difficult to build" | Backend Engineering |
| MOB-135 | Platform not stated | Accessibility | Layout breaks at large text sizes | Accessibility | Strong | Deferred ("next release"; "You need to") | Not stated | Not stated | Mobile UX |
| MOB-136 | Platform not stated | Notifications | Due-date notifications | Feature request | Moderate | Not stated (deferred) | Not stated | Not stated | Product |
| MOB-137 | Platform not stated | Engagement | Opt-in check-ins ("Help me stay on track") | Feature request | Strong | Not stated | Not stated | Not stated | Product |
| MOB-138 | Platform not stated | Engagement | Opt-in social-proof/comparison nudges | Feature request | Moderate | Not stated | Not stated | Not stated | Research |
| MOB-139 | Platform not stated | Engagement | Gamification module (points/stars) | Feature request | Weak | Not stated (exploratory) | Not stated | Not stated | Product |
| MOB-140 | Platform not stated | Engagement | Comms calendar aligned to training year | Feature request | Moderate | Not stated | Not stated | Not stated | Product |
| MOB-141 | Platform not stated | Brand & comms | Define brand tone of voice | User research | Moderate | Not stated | "shape a lot of your…" | Not stated ("ongoing process") | Research |
| MOB-142 | Platform not stated | Review-period config | Auto-populate period dates vs user selection | Open question | Moderate | Not stated | Not stated | Not stated | Product |

---

### Coverage note
- The **entire transcript (lines 1–592)** was reviewed.
- **39 consolidated actionable items** were extracted: **MOB-104 – MOB-142**, continuing the sequence after transcript 1 (MOB-001–MOB-077) and transcript 2 (MOB-078–MOB-103).
- **7 confirmed decisions** (§7): MOB-106, MOB-107, MOB-110, MOB-111, MOB-114, MOB-115, MOB-121.
- **1 reproduced defect** (§6): MOB-135 (layout breaks at large accessibility text sizes) — deferred to the next release.
- **Platform:** every item is `Platform not stated`; on-device signals confirm mobile but never distinguish iOS from Android (flagged §5 and §8).
- Positive/observational moments not converted into backlog items (e.g. praise for the OTP copy-from-notification and the "we sent a code to X" confirmation at L281–283, and the confirmed sign-out confirmation dialog at L315–321) are noted here rather than as actionable findings.
