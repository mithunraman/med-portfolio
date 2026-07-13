# Web Landing-Page Review — Transcript 1 (LoggdIt homepage)

**Source:** `labelled_transcript-web-1.txt` (lines 1–379)
**Product:** LoggdIt — voice-first app that turns spoken/typed clinical cases into curriculum-mapped GP-training portfolio entries (reflections, capability tags, PDP suggestions), exported as a PDF for pasting into FourteenFish ("14Fish").
**Artefact under review:** Marketing landing page / homepage (with FAQ page) and, tangentially, the app UI.
**Participants:** UX Designer, Engineer (founder), Doctor. A few lines are labelled "Uncertain (likely Doctor)".
**Session scope:** Walkthrough of the homepage top-to-bottom — hero/headline, USP taglines, screenshot carousel, three-step "how it works", voice-first & privacy messaging, curriculum-coverage and PDP sections, testimonials, colour/branding, brand name, 14Fish differentiation, pricing, FAQ page, and imagery.
**Analyst:** Product/UX/CRO/content review
**Date:** 2026-07-13

**ID note:** This web review uses a fresh `LP-###` series (LP-001…LP-044). It is independent of the mobile reviews' `MOB-###` series (MOB-001…MOB-142) so the two workstreams never collide.

**Evidence note:** Line numbers below (e.g. `L33`) refer to the transcript. Quotations are kept short and verbatim; where wording is paraphrased it is marked as such. Any conclusion not stated by a participant is prefixed **Inferred:** and, per the brief, no priority/impact/effort/ownership has been invented.

---

## 1. Executive summary

**Main themes discussed**

1. **Hero / value proposition clarity** — the single biggest thread. The headline, the "beta" label, and "Speak your case" were all challenged as unclear; the group repeatedly circled the need for a short, scannable hero that states what you get, that it's fast, and that it's free (LP-001–LP-005, LP-021, LP-027, LP-028).
2. **Differentiation** — two anchors emerged: (a) it complements, and does not replace, 14Fish (LP-026); (b) it beats generic tools like Notion because it is *curriculum-mapped* and prompts you for the ~8 components of a "complete entry" and tags capabilities/PDP goals (LP-027).
3. **Trust & AI safety** — testimonials are currently fake and need replacing (LP-017); AI-usage, anti-hallucination measures, and RCGP-guideline alignment should be surfaced high on the page (LP-033); privacy/GDPR/PII/recording-retention copy needs to be clearer and better structured (LP-034–LP-037).
4. **Visual design & brand** — the green theme reads as "pharmacy", chosen with no rationale; a calming health-appropriate palette with proper primary/secondary/tertiary tokens is wanted (LP-022–LP-024). Brand-name spelling "LoggdIt" was debated (LP-025).
5. **Structure & scannability** — swipeable screenshot carousel with captions (LP-007/LP-008), collapse repetitive sections (LP-016), move testimonials up (LP-017), move FAQ onto its own scannable jump-link page (LP-030), and surface the time-saving stat and "free" status (LP-021, LP-038).
6. **Imagery & empathy** — add photos of people/lifestyle imagery and dial up empathy for tired trainees (LP-040, LP-041, LP-028).

**Most important problems identified**

- Users won't understand "beta" (L2/L5) and the hero headline doesn't make the outcome instantly clear (LP-001, LP-002).
- The page doesn't tell a scanner, in a few seconds, what the app is, that it's fast, and that it's free (LP-003, LP-005).
- Testimonials are fabricated — an integrity and trust risk if shipped as-is (LP-017).
- The value versus Notion / versus 14Fish is not explicit "up top" (LP-026, LP-027).

**Most frequently mentioned suggestions**

- Short scannable USP taglines/checkboxes ("free", "five minutes", "easy"), reused as a communication vehicle (raised several times: L3, L4, L162–L164, L177–L178, L193).
- Make screenshots swipeable with a benefit caption under each (L22–L26, L87, L141).
- Emphasise "you're in control / you edit everything" and the privacy/PII story (L52–L60, L311).

**Explicitly described as important / high-impact (participant language, not analyst inference)**

- The unique "increases your chance of passing ARCP" section — UX: "this feels like a really unique selling point… increasing your chances of passing your ARCP" (L85) and "this is really important" (L86).
- The logging-friction message — Engineer: "the bigger concern is the logging… that seems to be the biggest point of friction on Reddit" (L185, L188).
- A hero for non-readers — Engineer: "people won't [read]" (L179); UX: "you need a hero section for people who don't want to read the entire website" (L178).
- The "NHS-approved"-style validation tagline won an A/B test over testimonials, star ratings and download counts (L266–L269) — offered as an FYI, not a directive.

**Confirmed decisions** (see Section 4 for full evidence)

- Remove "at 11 p.m. on a Sunday" from the blank-reflection-box line (L33) — LP-009.
- Reframe "how it works" as **three steps** and stop repeating the five-minute claim (L46–L48) — LP-011.
- Remove "You set the deadline" from the PDP-suggestions copy (L69–L71) — LP-014.
- Remove the orange accent colour (L136) — LP-023.
- Keep the brand name **LoggdIt** as spelled (domain + company already registered) (L150–L155) — LP-025.
- Change the colour theme (away from the current green) across app and website (L125, L138) — LP-022 (new palette undecided).
- Add an FAQ about copy-pasting from the exported PDF (L293–L295) — LP-031.
- Add an FAQ about Android availability (L375–L377) — LP-032.
- Give AI-usage / anti-hallucination content a prominent, high position (L316–L318) — LP-033.
- Make GDPR its own "GDPR-compliant" section (L273–L274) — LP-034.
- Remove "Final pricing TBD" and surface "free while in beta" clearly (L306–L309) — LP-038.

**Major disagreements / competing proposals**

- Testimonial attribution: "GP" (Engineer) vs specific training grade "ST1/ST2" (Doctor) to signal audience understanding; and anonymous vs first-name attribution (L92–L104) — LP-018.
- Colour direction: green (pharmacy) vs blue (calming but NHS-associated) vs another calming palette (L124–L135) — LP-022.
- Whether external/RCGP accreditation is attainable or worth chasing — Doctor sceptical because it's AI-based; Engineer says RCGP guidelines encourage AI use (L165–L172) — LP-019.

**Important risks & constraints**

- **Integrity risk:** shipping fabricated testimonials (L89–L90) — LP-017.
- **Legal/consent:** testimonials need documented permission; possible conflict-of-interest declaration for a testimonial from a relative ("my wife's sister") (L105–L107) — LP-018.
- **Trademark caution:** naming "14Fish" on the page — Engineer worried they might object; Doctor believes there's no violation (L202–L203) — LP-026.
- **Regulatory context:** a Doctor's anecdote about a similar app being barred by a local ICB from *live* patient consultations (LoggdIt is reflection-only, not clinical record) (L336–L344) — background risk context for LP-033.
- **No production integration** with 14Fish yet — output is copy-paste from a PDF (L210–L212).

**Dependencies**

- Real testimonials depend on recruiting real trainees/GPs and securing consent (LP-017/LP-018).
- Colour-token work depends on choosing a palette first (LP-022 → LP-024).
- Brand-name hyphen experiment is gated by the already-purchased domain and registered company (LP-025).

**Most consequential unresolved questions**

- What are the 2–3 key hero messages, and the catchy ARCP tagline? (L177–L178, L182–L183) — LP-003/LP-004.
- Which colour palette replaces green? (L127–L135) — LP-022.
- How explicitly should the page position LoggdIt relative to 14Fish and Notion? (L201, L246–L249) — LP-026/LP-027.

---

## 2. Consolidated landing-page improvements

### Theme A — Hero, value proposition & headline

| ID | Status | Type | Actionable item | Problem or need | Proposed improvement | Page section or journey | Audience or device | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | ------ | ---- | --------------- | --------------- | -------------------- | ----------------------- | ------------------ | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| LP-001 | Proposed | Content or copy | Replace/clarify the "beta" label in the hero | Users won't know what "beta" means; it isn't communicating value | Drop or explain "beta"; use the space for scannable value ("is it free? how easy is the download?") | Hero | UK GP trainees | UX Designer | "I don't think users will understand what 'beta' means" (L2, L5) | Not stated | Interacts with LP-005, LP-038 | Validate whether "beta"/"free" belongs in hero; A/B if traffic allows |
| LP-002 | Proposed | Content or copy | Rewrite hero headline; drop "Speak your case" | Headline doesn't make the outcome instantly clear; "Speak your case" isn't the number-one thing | Proposed (UX): "Get a portfolio entry mapped to the curriculum in five minutes" / "Get a curriculum-mapped portfolio entry in **just** five minutes" | Hero headline | GP trainees | UX Designer, Engineer | "'Speak your case' isn't adding value" (L198); "include 'just'" (L198) | Not stated | Depends on LP-004 (ARCP tagline), LP-005 | Draft 2–3 headline variants for validation |
| LP-003 | Confirmed (need) / Proposed (form) | UX improvement | Add a concise hero for non-readers with checkboxes + primary CTA | Most visitors won't read the whole page; need "your app in a few sentences" | Short hero: 2–3 key messages as checkboxes + a "Get started" button | Hero | Quick scanners | UX Designer, Engineer | "you need a hero section for people who don't want to read the entire website" (L178); Engineer: "people won't [read]" (L179); "a 'Get started' button" (L193) | Engineer agreed people won't read (L179–L180) | Needs LP-004/LP-005 message selection | Wireframe hero: headline + 3 checkboxes + CTA |
| LP-004 | Open | Content or copy | Create a catchy "ARCP-ready" tagline | No crisp phrase captures the core promise | Candidates raised: "Making you ARCP-ready", "Hassle-free ARCP" | Hero | GP trainees | Engineer, Doctor | "'Hassle-free ARCP', maybe" (L191); "It should be a catchy phrase" (L192) | Called out as needed ("I need to figure out what the key word is", L182) | Wording undecided; check if "ARCP" is understood by cold visitors | Copywriting workshop to lock the tagline |
| LP-005 | Proposed | Content or copy | Add 2–3 scannable USP taglines / checkboxes | Users scan rather than read; key USPs (free, 5 minutes, easy) aren't surfaced as scannable chips | Reusable "tagline" chips (à la a tested "Five-minute quiz"/"Completely free" pattern) placed near hero | Hero / top of page | Scanners | UX Designer | "people will scan these things" (L4); external example "tested so well… straight to 'Start quiz'" (L162–L164) | UX cites strong test performance of the pattern elsewhere (L163) | Which 2–3 messages? (LP-004) | Decide the 2–3 messages, then design the chip row |
| LP-021 | Proposed | Content or copy | Surface the time-saving stat prominently | The "45–60 minutes down to 5 minutes" saving is buried/"floaty" | Elevate the timesaver into a prominent supporting message | Hero / benefits | GP trainees | UX Designer | "a really nice timesaver… 45 to 60 minutes down to five minutes… This feels a bit floaty" (L110) | Not stated | Confirm the real time figures | Place the stat as a supporting hero proof point |
| LP-027 | Proposed | Content or copy | Make the "why not just Notion" differentiation explicit up top | Value vs generic note tools (Notion) isn't clear; risk users ask "what does this give me over Notion?" | State the curriculum-mapped AI advantage: prompts for the ~8 components of a complete entry, capability tags, PDP suggestions | Value prop / benefits | GP trainees | UX Designer, Engineer | "What is this giving me over Notion? … the reflection, capability tagging, and PDP suggestions" (L246); "curriculum-mapped AI… asks the right questions" (L241) | Discussed at length (L235–L249) | Overlaps LP-026, LP-028 | Write a differentiation block near the top |
| LP-028 | Proposed | Content or copy | Reframe core value as easy daily in-the-moment capture ("intelligent diary") with empathy | Hero over-indexes on "speak your case"; real value is quick daily capture for tired trainees | Reframe hero around capturing thoughts day-by-day, "a diary but a little more intelligent", with empathy for busy trainees | Hero / value prop | GP trainees | UX Designer, Engineer | "an easy way to capture your thoughts… like a quick diary" (L250); "like a diary, but a little more intelligent" (L251); "dial up the empathy" (L262) | Not stated | Overlaps LP-002, LP-027 | Rewrite hero narrative with empathy angle |

### Theme B — Structure, sections & navigation

| ID | Status | Type | Actionable item | Problem or need | Proposed improvement | Page section or journey | Audience or device | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | ------ | ---- | --------------- | --------------- | -------------------- | ----------------------- | ------------------ | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| LP-007 | Proposed | UX improvement | Make the screenshots a swipeable carousel with clear affordance | Static screenshots; swipeability not obvious | Convert to a swipe carousel and signal that it swipes | Screenshots section | Not stated | Engineer, UX Designer | Engineer: "maybe this should be a carousel" (L22); UX: "make it clear that it's swipeable" (L24); "definitely make that swipeable" (L87) | Repeated across L22–L141 | Carousel a11y/keyboard support (see LP-008) | Build swipe carousel with visible affordance |
| LP-008 | Proposed | Content or copy | Add a benefit caption under each screenshot | Screenshots don't state the benefit; also poor for screen-reader users | One aligned tagline per screenshot (e.g. "Probing questions mapped to the curriculum") | Screenshots section | Screen-reader users (secondary a11y) | UX Designer | "underneath, it could say… hammer home those key messages" (L25–L26); "if somebody's using a visual screen reader, they've got a nice little description" (L26) | Not stated | Depends on LP-007 | Write one caption per screenshot |
| LP-016 | Open | UX improvement | Collapse the two repetitive "record & review" sections | Two adjacent sections repeat "record and review"; the unique ARCP-value section deserves more spotlight | Merge the repetitive content; expand the "increases your chance of passing ARCP" section | Mid-page content sections | Not stated | Engineer, UX Designer | Engineer: "they're a bit repetitive… maybe I could just combine this into one" (L83); UX: "this is really important, and this is less so" (L86) | UX flags the ARCP section as "really important" (L86) | Which section leads? | Restructure into one process section + one value section |
| LP-030 | Proposed | UX improvement | Move FAQ onto its own scannable page with jump links | FAQ is in expandable accordions; harder to scan; Q&A format also good against web/AI scraping concerns | Dedicated FAQ page, heading/text format, with in-page jump links to sections | FAQ | Not stated | UX Designer | "move it to that page and out of the expandable sections" (L279); "little jump links for navigation" (L284); "good for AI… people are concerned about websites being scraped" (L279) | Not stated | Secondary: SEO benefit | Build FAQ page with anchor navigation |
| LP-042 | Proposed | User research | Heuristic-evaluate homepage + app against the 10 usability heuristics | No structured usability baseline | Appraise both homepage and app against Nielsen's 10 heuristics; UX suggests feeding into Claude for a review | Whole site + app | Not stated | UX Designer | "Appraise your homepage against these 10 heuristics, and also your app" (L371); "feed this into Claude and ask it to review" (L374) | "the bread and butter of good design" (L371) | UX notes she is "not a UI designer" (L373) | Run a heuristic pass on homepage and app |

### Theme C — "How it works" & benefit copy

| ID | Status | Type | Actionable item | Problem or need | Proposed improvement | Page section or journey | Audience or device | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | ------ | ---- | --------------- | --------------- | -------------------- | ----------------------- | ------------------ | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| LP-009 | Confirmed (removal) / Proposed (rewrite) | Content or copy | Rework the "blank reflection box" copy | "No more blank reflection box at 11 p.m. on a Sunday" reads as AI-generated and the time phrase misleads | Remove "at 11 p.m. on a Sunday"; lead with "start speaking… let LoggdIt do the work"; keep "No more blank reflection box" as secondary | Benefit section | GP trainees (Reddit pain point) | UX Designer, Engineer | Engineer: "I'm removing the 11 p.m. on a Sunday" (L33); UX proposed wording (L37–L38) | Engineer references recurring Reddit complaint (L29–L30) | Final wording TBD | Finalise the reworked line |
| LP-010 | Proposed | Content or copy | Change "Track" to "Track your progress" | "Track" is terse; "Track your gaps" feels negative | Use "Track your progress" (positive framing) | Three-step / tracking section | GP trainees | UX Designer | "'Track your progress' might be more of a…" (L43–L45) | Not stated | None | Update the label |
| LP-011 | Confirmed | Content or copy | Frame the process as "Just three steps" and stop repeating five minutes | Five-minute claim repeated; three-step framing is more appealing | "Just three steps to one complete entry"; drop the repeated five-minute mention here | How-it-works | GP trainees | UX Designer, Engineer | UX: "'Just three steps' is quite appealing" (L46); Engineer: "we've already specified the five minutes… no point in repeating it" (L47) | Not stated | None | Rework section header to three steps |
| LP-012 | Proposed | Content or copy | Emphasise "you're in control / you edit everything" in the voice-first section | Users worry about what's captured in a stream of thought and where the data goes | Add a prominent control/edit reassurance ("you edit anything you'd word differently — you're in control") | Voice-first section | Privacy-concerned users | UX Designer, Engineer | "some people get worried about recordings" (L54); "you edit anything… you're in control" (L53); "that needed more of a spotlight" (L56) | UX says it "needed more of a spotlight" (L56) | Pairs with LP-036, LP-039 | Add control/edit reassurance copy |
| LP-013 | Proposed | Content or copy | Remove "coverage dashboard" jargon; show the dashboard visually | "coverage dashboard" is undefined jargon | Replace with "so you can see exactly where you stand"; show the actual dashboard image | Curriculum-coverage section | GP trainees | UX Designer | "I don't know what a coverage dashboard is" (L64); "you should show the coverage dashboard" (L65) | Not stated | Needs a dashboard screenshot | Simplify copy + add visual |
| LP-014 | Confirmed | Content or copy | Remove "You set the deadline" from PDP-suggestions copy | Deadlines aren't the user's struggle; identifying meaningful PDP goals from real cases is | Cut the deadline line; stress goals are relevant and drawn from *your* cases, not generic | PDP-suggestions section | GP trainees | Engineer, UX Designer | Engineer: "Setting deadlines is not the selling point" (L69); UX: "I would get rid of that" (L71) | Not stated | Reword to convey "relevant, not generic" (L73–L77) | Rewrite PDP block |
| LP-045 | Deferred | Feature request | Support starting an entry then pausing and continuing later | Trainees may have no time between patients; need to start and resume | Allow beginning a conversation and continuing after getting home | Product capability referenced in messaging | GP trainees | Engineer | "We can maybe start the conversation so that they can continue after they come back home" (L14) | Not stated | App capability, not just copy | Confirm whether resume exists; reflect in copy |

### Theme D — Trust, social proof & AI safety

| ID | Status | Type | Actionable item | Problem or need | Proposed improvement | Page section or journey | Audience or device | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | ------ | ---- | --------------- | --------------- | -------------------- | ----------------------- | ------------------ | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| LP-017 | Confirmed (need) | Risk or constraint | Replace fake testimonials with real, consented ones; move them up | Current testimonials are fabricated; also positioned too low | Recruit real trainee/GP testimonials (target ~3 on different themes); move the block above the how-it-works section | Testimonials | GP trainees | Engineer, UX Designer, Doctor | "those are fake right now" (L89); "you need one… I'd get a testimonial" (L90); "push your quotes up above this section" (L88) | Called "such a key thing for people" (L91) | Needs real users + consent (LP-018) | Source and stand up real testimonials before launch |
| LP-018 | Open | Content or copy | Decide testimonial attribution and handle consent/COI | How to attribute (grade vs "GP", named vs anonymous); consent + conflict-of-interest for a relative | Doctor: use specific grade (ST1/ST2) to signal audience knowledge; UX: first name + "GP" humanises; document consent; consider COI declaration | Testimonials | GP trainees | Doctor, UX Designer, Engineer | Doctor: "using the ST shows that you know the audience" (L98); UX: "A name… humanises it" (L102); "document where you've got them from" (L105); "this is my wife's sister" (L106) | Not stated | Legal: consent + COI (L105–L107) | Agree attribution format + consent process |
| LP-019 | Deferred | Content or copy | Add third-party validation / accreditation-style messaging | New product lacks trust signals; an "NHS-approved"-style tagline tested strongest elsewhere | Explore a validation line (not falsely "RCGP-approved"); consider "gets you ready for your ARCP" framing instead | Trust section | GP trainees | UX Designer, Engineer, Doctor | A/B test "'NHS-approved' … won over testimonials, star reviews and download numbers" (L266–L269); "not 'RCGP-approved', but 'gets you ready for your ARCP'" (L175) | UX flags the winning A/B result (L267) | No accreditation exists; RCGP approval doubtful for AI (L167) | Decide an honest validation message; revisit accreditation later |
| LP-020 | Observed | Analytics or experimentation | Note: star ratings did not lift click-through in prior tests | Prior A/B tests showed star ratings didn't increase click-through | Treat star ratings with caution as a social-proof mechanism | Social proof | App audiences (external context) | UX Designer | "star ratings… didn't increase click-through on some of our app products" (L264–L265) | Not stated | External finding; may not transfer | Keep as evidence when choosing social-proof format |
| LP-033 | Confirmed (elevate) | Content or copy | Elevate AI-usage & anti-hallucination content; link RCGP AI guidance | Trainers/supervisors may distrust AI; users fear hallucinations and "doing it wrong" | Put AI-usage + anti-hallucination measures high up; add "Can I use AI?"; summarise + link RCGP guidelines on AI use | FAQ / trust (high on page) | AI-sceptical trainees, supervisors | Engineer, UX Designer, Doctor | Engineer: "it should be the first item… strict anti-hallucination measures" (L316–L317); "add a link: 'Read the RCGP guidelines on AI usage'" (L322) | Engineer: "should be the first item" (L316) | Depends on accurate RCGP guideline summary | Draft AI-safety block + guideline summary, place high |

### Theme E — Privacy, data & compliance content

| ID | Status | Type | Actionable item | Problem or need | Proposed improvement | Page section or journey | Audience or device | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | ------ | ---- | --------------- | --------------- | -------------------- | ----------------------- | ------------------ | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| LP-034 | Confirmed | Content or copy | Split GDPR into its own "GDPR-compliant" section | GDPR point is bundled with other confidentiality copy; users search for the keyword | Give GDPR its own section headed "GDPR-compliant" | Privacy/trust section | Not stated | Engineer, UX Designer | Engineer: "the GDPR point… could be its own section… 'GDPR-compliant'" (L273); UX: "Brilliant… People will be looking for that keyword" (L274–L275) | Not stated | Secondary SEO benefit | Create the GDPR section |
| LP-035 | Proposed | Content or copy | Clarify/simplify PII-redaction wording and grouping | "automatic redaction pass" is unclear; PII point sits apart from confidentiality | Say "our algorithm replaces patient identifiers"; move the PII point into the confidentiality section | Privacy/trust section | Not stated | UX Designer | "Could you just say, 'Our algorithm replaces…'?" (L302); "I'd move PII into here" (L276) | Not stated | Confirm accurate technical description | Rewrite + regroup PII copy |
| LP-036 | Proposed | Content or copy | State plainly "We don't use your data to train our AI" | Data-training concerns; current copy less direct | Add a direct, plain-language line | Privacy/trust section | Not stated | UX Designer | "'We don't use your data to train our AI.' Just be really direct" (L278) | Not stated | Must be factually accurate | Add the statement (verify it's true) |
| LP-037 | Observed (keep) | Content or copy | Keep encrypted UK-region storage + 72-hour auto-delete copy | Recording-retention reassurance already reads well | Retain "audio stored encrypted in UK-region cloud… deleted after 72 hours" | FAQ / privacy | Not stated | UX Designer | "'Audio is stored encrypted in UK-region cloud…' … 'deleted after 72 hours.' Nice" (L303–L304) | Not stated | Ensure claim matches implementation | No change; verify accuracy |
| LP-039 | Proposed | Content or copy | Reinforce ownership/sign-off ("you own & write your reflections") + version history | Users need reassurance they still author and sign off their reflections | Confirm the user signs off everything, pair with the "You're in control" message; mention version history | FAQ / trust | Not stated | UX Designer | "'You sign off on what goes into your portfolio…' … pair that with the 'You're in control' message" (L310–L311) | Not stated | Pairs with LP-012 | Add ownership FAQ + link to control message |

### Theme F — Visual design & branding

| ID | Status | Type | Actionable item | Problem or need | Proposed improvement | Page section or journey | Audience or device | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | ------ | ---- | --------------- | --------------- | -------------------- | ----------------------- | ------------------ | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| LP-022 | Confirmed (change) / Open (palette) | Visual design | Rethink the colour palette away from green | Green reads as "pharmacy"; chosen with no rationale | Choose a calming, health-appropriate palette (blue = NHS/health in UK, but that's an association to weigh); define primary/secondary/tertiary with accessibility rationale | Whole site + app | GP trainees | UX Designer, Engineer, Doctor | UX: "this green gives me pharmacy vibes" (L127); Engineer: "it's random… completely open to changing" (L125); Engineer: "So I have to change that too" (L138) | Not stated | Palette undecided; blue↔NHS tension (L128–L131) | Run a colour-theory/palette exercise |
| LP-023 | Confirmed | Visual design | Remove the orange accent colour | Orange is "really recessive" | Remove orange from the palette | Whole site | Not stated | Engineer, UX Designer | Engineer: "That's really recessive. I want to remove that" (L136) | Not stated | Part of LP-022 palette work | Drop orange in the new palette |
| LP-024 | Proposed | Technical improvement | Adopt design tokens for colour | Colours are hardcoded; no token system | Introduce design tokens to manage colour across app + website | Design system | Not stated | UX Designer, Engineer | "Have you used design tokens?" (L139); "a much simpler way to talk to techies about colour usage" (L140) | Not stated | Depends on LP-022 palette | Define colour tokens once palette is set |
| LP-025 | Confirmed (keep) / Deferred (hyphen) | Decision | Keep the brand name "LoggdIt" as spelled | "LoggdIt" (L-O-G-G-D) may confuse non-native English speakers | Keep the name (domain + company registered); optionally trial a hyphen "Logg-It" then drop it once people say "logged it"; kept generic (not GP-specific) for future specialties | Brand | International/ESL users | Engineer, UX Designer | Engineer: "Even the company is registered as that" (L152); "split this into 'Logg-It' until people… then remove the hyphen" (L154); UX: "the name is good… clever" (L155) | Not stated | Domain/company already registered | Decide on hyphen experiment separately |
| LP-040 | Proposed | Content or copy | Soften the "Who built this" copy to an empathetic tone | "We can't fix everything wrong" reads negative, as if disparaging the status quo | Rewrite positively: "we're here to support you… we know portfolio admin can be challenging" | About / "Who built this" | GP trainees | UX Designer | "I would be a little nicer there… Make it more positive" (L313); "Speak from the heart" (L314) | Not stated | None | Rewrite the section warmly |
| LP-041 | Proposed | Visual design | Add images of people / lifestyle imagery for relatability | No images of people; less empathy/relatability | Add a hero or section image (e.g. trainee on the sofa in the evening speaking into the app), age ~25–34; testimonial avatars; possibly 50/50 image layout; stock imagery | Hero / testimonials / getting-started | GP trainees (mid-20s–30s) | UX Designer, Doctor | "using people creates a little more empathy" (L353); "sitting on the sofa… at night, speaking into the app" (L356); age "25 to 34" (L365) | Not stated | Sourcing stock imagery; not decided | Source candidate imagery; test in hero |

### Theme G — Positioning, scope & 14Fish relationship

| ID | Status | Type | Actionable item | Problem or need | Proposed improvement | Page section or journey | Audience or device | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | ------ | ---- | --------------- | --------------- | -------------------- | ----------------------- | ------------------ | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| LP-026 | Proposed | Content or copy | Clarify LoggdIt complements (does not replace) 14Fish | Users may fear duplicate work or think it replaces 14Fish | State it works in parallel with 14Fish; the export mirrors 14Fish sections for copy-paste; possibly place in FAQ | Value prop / FAQ | GP trainees | UX Designer, Engineer, Doctor | UX: "do we need to say something about working in tandem with 14Fish?" (L201); "mapped to 14Fish" (L245) | Not stated | Trademark caution — may 14Fish object? (L202); Doctor: "I don't think you're violating anything" (L203) | Add a "works alongside 14Fish" explainer; check trademark risk |
| LP-029 | Proposed | Content or copy | Clarify current GP/RCGP-only scope; keep "email your specialty"; cut investor content | Scope (GP-only) unclear; expansion/business content (IMT, psychiatry) reads as investor-facing, not user-facing | State "currently general practice — RCGP only", keep the "email us with your specialty" invitation, remove the multi-specialty expansion pitch | Scope / footer | GP trainees | UX Designer | "make it really clear that… it's only for general practice" (L298); "keep the invitation to email you with their specialty" (L299) | Not stated | None | Add scope statement; move expansion copy off the landing page |

### Theme H — Pricing

| ID | Status | Type | Actionable item | Problem or need | Proposed improvement | Page section or journey | Audience or device | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | ------ | ---- | --------------- | --------------- | -------------------- | ----------------------- | ------------------ | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| LP-038 | Confirmed | Content or copy | Surface "free while in beta" at the top; remove "Final pricing TBD"; add no-auto-charge reassurance | "Free" status buried; "Final pricing TBD" is vague and low-trust | Put "free for now / free while in beta, no card required, no trial timer" near the top; remove "Final pricing TBD"; promise advance notice and never auto-charge | Pricing / hero | GP trainees | UX Designer, Engineer | "if it's free for now, I would probably put that at the top" (L304); "we'd remove 'Final pricing TBD.' Definitely" (L309); "we'll never auto-charge you" (L308) | Not stated | None | Rewrite pricing block; elevate "free" to hero |

### Theme I — FAQ additions & product-detail content

| ID | Status | Type | Actionable item | Problem or need | Proposed improvement | Page section or journey | Audience or device | Stakeholders | Evidence | Priority signals | Dependencies or questions | Recommended next step |
| -- | ------ | ---- | --------------- | --------------- | -------------------- | ----------------------- | ------------------ | ------------ | -------- | ---------------- | ------------------------- | --------------------- |
| LP-031 | Confirmed | Content or copy | Add FAQ: copy-pasting from the exported PDF | Some PDFs contain image-text that can't be copied; users may worry paste won't work | Add an FAQ reassuring users they can copy from the PDF and paste into Word/anywhere | FAQ | GP trainees using 14Fish | UX Designer, Engineer, Doctor | UX: "copying and pasting from a PDF can be challenging… add that as an FAQ" (L285, L292); Engineer: "I'll add that" (L295) | UX: "you don't want it to be a reason they don't use the product" (L293) | Ensure the real export is copy-selectable text, not an image | Write the FAQ; verify PDF text is selectable |
| LP-032 | Confirmed | Content or copy | Add FAQ: Android availability | Android not yet available; only needs addressing low on the page | Add an Android FAQ; iOS-first, "wanted feedback from iOS first" | FAQ | Android users | Engineer, UX Designer | "add a question about Android" (L375); "Android isn't available yet… you just need it down here" (L376) | Not stated | None | Add Android FAQ entry |
| LP-043 | Deferred | Feature request | Future: trainer collaboration/advice on raw thoughts before upload | Trainees want a safe space to refine raw thoughts before the official portfolio; a trainer could advise in that step | Explore a future feature where a trainer reviews/advises on the in-between draft | Product roadmap (not landing copy) | Trainees + trainers | UX Designer, Engineer | UX: "great future product piece… collaborate with a trainer" (L61); Engineer: "I'll make a note of that" (L61) | Not stated | Future scope | Log as roadmap idea |
| LP-015 | Proposed | UI improvement | Stop reusing the tick icon across different sections | The same tick icon is used for "Track" and elsewhere, blurring meaning | Differentiate icons (e.g. a light bulb) so each section reads distinctly | Icons across sections | Not stated | UX Designer | "you've used the tick icon for 'Track'… steer away from using that same tick icon… Maybe a light bulb" (L80–L82) | Not stated | Depends on LP-042 UI pass | Audit and diversify section icons |
| LP-044 | Observed (positive) | Content or copy | Keep the font choice | Font praised as clear | No change; retain current font | Typography | Not stated | UX Designer | "I quite like the font… It's clear" (L348–L349) | Not stated | None | No action; retain |

---

## 3. Content and messaging changes

**Value proposition**
- **LP-027 / LP-028** — Section: value prop/hero. Current issue: value vs Notion/generic notes and the "daily intelligent diary" angle aren't explicit. Proposed (UX/Engineer): lead on curriculum-mapped prompting for the ~8 components of a complete entry, capability tags and PDP suggestions; frame as "a diary but a little more intelligent" (L246, L241, L250–L251). Status: Proposed. Unresolved: how prominently to name Notion/14Fish.

**Headlines**
- **LP-002** — Hero headline. Current issue: "Speak your case…" doesn't convey the outcome and isn't the number-one thing. Proposed wording (UX): "Get a curriculum-mapped portfolio entry in **just** five minutes" (L198). Status: Proposed (not confirmed).
- **LP-004** — Hero tagline. Proposed candidates: "Making you ARCP-ready", "Hassle-free ARCP" (L183, L191). Status: Open — wording undecided.
- **LP-001** — "beta" label. Proposed: remove/explain; use the space for value (L2–L5). Status: Proposed.

**Supporting copy**
- **LP-009** — Blank-reflection-box line. Confirmed removal of "at 11 p.m. on a Sunday" (L33). Proposed rewrite (UX, not confirmed): "Don't get caught up in making it perfect; start speaking. Speak freely and let LoggdIt do the work" with "No more blank reflection box" as a secondary line (L37–L38).
- **LP-010** — "Track" → "Track your progress" (L43–L45). Status: Proposed.
- **LP-013** — Remove "coverage dashboard" jargon → "so you can see exactly where you stand" (L64). Status: Proposed.
- **LP-014** — Remove "You set the deadline" (L69–L71). Status: Confirmed. Reword to convey "relevant, not generic" PDP goals (L73–L77) — wording Open.
- **LP-021** — Elevate the "45–60 min → 5 min" timesaver (L110). Status: Proposed.
- **LP-040** — Soften "Who built this / we can't fix everything wrong" to a supportive tone (L313–L314). Status: Proposed.

**Calls to action**
- **LP-003** — Add a "Get started" button in a concise hero (L193). Status: need Confirmed, form Proposed.

**Terminology**
- **LP-013** "coverage dashboard"; **LP-004/LP-033** "ARCP", "capability tags", "PDP" — the group confirmed "capability tags" and "PDP (personal development plan)" are known terms to the audience (L16–L17); "coverage dashboard" is not (L64). Status: mixed (Observed/Proposed).

**Product / service explanation**
- **LP-026** — Add "works alongside 14Fish" explainer; the export mirrors 14Fish's sections for copy-paste (there is no live integration yet) (L201–L212, L245). Status: Proposed.
- **LP-029** — State current GP/RCGP-only scope; keep "email us with your specialty" (L298–L300). Status: Proposed.
- **LP-045** — If start-then-resume is a real capability, reflect it in copy (L14). Status: Deferred.

**Audience-specific messaging**
- **LP-018** — Testimonial grade specificity (ST1/ST2) signals audience understanding (L98). Status: Open.
- **LP-028** — Empathy for tired, busy trainees (L262). Status: Proposed.

**Trust-building content**
- **LP-017** real testimonials; **LP-019** validation/accreditation-style messaging; **LP-033** AI-safety + RCGP-guideline link; **LP-039** ownership/sign-off. Status: see Section 2.

**Pricing / commercial information**
- **LP-038** — "Free while in beta, no card required, no trial timer"; remove "Final pricing TBD"; "we'll give advance notice and never auto-charge you" (L306–L309). Status: Confirmed (direction); exact wording Proposed.

**Form labels, instructions, error messages**
- Not stated. No forms (beyond an implied email-us invitation and CTA) were discussed in detail.

**SEO-related content**
- **LP-034** — "GDPR-compliant" heading as a searched keyword (L274–L275).
- **LP-030** — FAQ jump-link page also framed as good against scraping/AI (L279). Status: Proposed. Secondary SEO benefit; no explicit keyword/meta work was discussed.

---

## 4. Decisions already made

- **LP-009 — Remove "at 11 p.m. on a Sunday."** Reason: the time phrase misleads and the line reads too "AI". Section: blank-reflection-box benefit. Decision-maker: Engineer (UX agreeing). Evidence: "I'm removing the 11 p.m. on a Sunday" (L33). Required action: edit the line. Deadline: Not stated.
- **LP-011 — Frame the process as "three steps" and stop repeating "five minutes."** Reason: five minutes already stated above; "three steps" is more appealing. Agreeing stakeholders: UX + Engineer. Evidence: "no point in repeating it" (L47). Required action: rework the section header.
- **LP-014 — Remove "You set the deadline" from PDP copy.** Reason: deadlines aren't the selling point; identifying meaningful PDP goals is. Decision-maker: Engineer (UX: "I would get rid of that", L71). Evidence: L69–L71. Required action: rewrite the PDP block.
- **LP-023 — Remove the orange accent colour.** Reason: "really recessive." Decision-maker: Engineer. Evidence: "I want to remove that" (L136). Dependency: part of the LP-022 palette rework.
- **LP-022 — Change the colour theme away from green (palette TBD).** Reason: green reads "pharmacy"; chosen at random. Agreeing stakeholders: Engineer + UX. Evidence: "completely open to changing the colour theme" (L125); "So I have to change that too" (L138). Note: *that a change will happen* is confirmed; *which palette* is Open (LP-022 in Section 6).
- **LP-025 — Keep the brand name "LoggdIt" as spelled.** Reason: domain purchased and company registered under it; the name is considered clever/clear. Decision-maker: Engineer (UX agreeing). Evidence: "Even the company is registered as that" (L152); "We keep it that way" (L153). Note: a hyphen experiment ("Logg-It") is Deferred, not decided.
- **LP-031 — Add an FAQ about copy-pasting from the exported PDF.** Reason: some PDFs contain non-copyable image-text; avoid it becoming a reason not to use the product. Decision-maker: Engineer ("I'll add that", L295). Dependency: verify the export is selectable text.
- **LP-032 — Add an FAQ about Android availability.** Reason: iOS-first; Android not yet available; only needs to sit low on the page. Agreeing stakeholders: UX + Engineer. Evidence: L375–L377.
- **LP-033 — Give AI-usage / anti-hallucination content a prominent, high position.** Reason: trainers/supervisors may distrust AI; users fear hallucinations. Decision-maker: Engineer ("it should be the first item", L316). Required action: draft and place the AI-safety block; optionally link a summarised RCGP AI guideline.
- **LP-034 — Make GDPR its own "GDPR-compliant" section.** Reason: users search that keyword. Agreeing stakeholders: Engineer + UX ("Brilliant", L274). Required action: create the section.
- **LP-038 — Remove "Final pricing TBD" and surface "free while in beta" clearly.** Reason: vague, low-trust; free status should be prominent. Agreeing stakeholders: UX + Engineer. Evidence: "we'd remove 'Final pricing TBD.' Definitely" (L309); "It is free for now" (L305). Required action: rewrite the pricing block.

*(All other items in Section 2 are Proposed, Open, Observed, or Deferred and are deliberately excluded here.)*

---

## 5. Open questions and follow-up actions

**Product**
- **LP-045** — Does start-then-resume actually exist, and should it be a headline capability? Raised by Engineer (L14). Suggested owner: Product. Dependency: app capability.
- **LP-043** — Should trainer collaboration on pre-upload drafts be roadmapped? Raised by UX (L61). Owner: Product. Deferred.
- **LP-016** — Which of the two record/review sections leads after merging? Raised by Engineer/UX (L83–L86). Owner: Not clear.

**UX and design**
- **LP-003 / LP-005** — What are the final 2–3 hero messages and checkbox chips? Raised by UX/Engineer (L177–L178). Owner: UX Design + Content.
- **LP-041** — Do we want lifestyle imagery of people, and where? Raised by UX (L352–L356). Owner: UX/UI Design.
- **LP-015** — Which icons replace the reused tick? Raised by UX (L80–L82). Owner: UI Design.
- **LP-042** — Run the 10-heuristics appraisal on homepage + app. Raised by UX (L371–L374). Owner: UX Design (UX notes she's "not a UI designer", L373).

**Content and marketing**
- **LP-004** — Lock the catchy ARCP tagline. Raised by Engineer/Doctor (L182–L192). Owner: Content/Marketing.
- **LP-002** — Choose the final hero headline variant. Owner: Content.
- **LP-026 / LP-027** — How explicit should positioning vs 14Fish and Notion be, and where? Raised by UX (L201, L246). Owner: Content/Product.

**Engineering**
- **LP-024** — Adopt colour design tokens once a palette is set. Raised by UX (L139–L140). Owner: Engineering. Dependency: LP-022.
- **LP-031** — Verify the exported PDF is selectable text, not an image. Owner: Engineering.
- **LP-037** — Verify the "UK-region encrypted, deleted after 72 hours" claim matches implementation. Owner: Engineering.

**Analytics**
- **LP-020** — Carry forward the prior learning that star ratings didn't lift click-through when choosing a social-proof format. Raised by UX (L264–L265). Owner: Analytics/Marketing.
- No event-tracking or funnel instrumentation was specified. **Inferred:** tracking requirements are Not stated.

**User research**
- **LP-005 / LP-027** — UX cautioned "we haven't done extensive research… you'll know more from Reddit" (L249). Owner: Research. Follow-up: validate hero messages with real trainees.
- **LP-042** — Heuristic evaluation (also a research/QA action).

**Legal, privacy, or compliance**
- **LP-018** — Testimonial consent documentation + possible conflict-of-interest declaration (relative). Raised by UX/Engineer (L105–L107). Owner: Legal/Compliance.
- **LP-026** — Trademark risk of naming "14Fish." Engineer unsure; Doctor believes no violation (L202–L203). Owner: Legal.
- **LP-036 / LP-037** — Data-training and retention claims must be factually accurate before publishing. Owner: Legal + Engineering.
- **Regulatory context (background):** Doctor's anecdote that a local ICB barred a similar AI app from *live* consultations; LoggdIt is reflection-only, not a clinical record (L336–L344). Owner: Not clear.

**Cross-functional**
- **LP-017** — Sourcing real testimonials touches Marketing (recruit), Legal (consent), Product (approve). Owner: Cross-functional.
- **LP-019** — Deciding an honest validation/accreditation message spans Content, Product, and Compliance.

---

## 6. Conflicting viewpoints and alternatives

**LP-018 — Testimonial attribution**
- Shared problem: how to attribute testimonials credibly and legally.
- Option A: label simply "GP" — Engineer: "I can just put 'GP', right?" (L93, L100).
- Option B: use a specific training grade (ST1/ST2) to signal audience understanding — Doctor: "using the ST shows that you know the audience" (L98).
- Alternative (attribution style): anonymous vs first-name — UX: "A name… humanises it… first name and 'GP'" (L102–L103).
- Resolution: Undecided (leaning toward specific + first-name, not confirmed). Info needed: real testimonials + consent, and a COI decision on the relative (L106).

**LP-022 — Colour direction**
- Shared problem: green feels "pharmacy" and lacks rationale; need a calming, health-appropriate palette.
- Option A: blue — Doctor: "Blue in this country represents health… the NHS" (L128); calming (L130).
- Counter to A: blue over-associates with the NHS — UX: "then you're linking to the NHS… it depends what type of blue" (L131).
- Option B: keep a green-family but reconsidered — UX: "I don't think green is a bad choice… feels very calming" (L129).
- Resolution: Confirmed that colours will change (LP-022 decision); specific palette Undecided. Info needed: a colour-theory/token exercise and accessibility checks (L132–L133).

**LP-025 — Brand-name spelling**
- Shared problem: "LoggdIt" (L-O-G-G-D) may confuse ESL users.
- Option A: spell it "Logged It" / add a hyphen "Logg-It" — UX pedantry (L145); Engineer's hyphen idea (L154).
- Option B: keep "LoggdIt" — domain and company already registered (L150–L152); modelled on "Reddit"/"read it" (L147–L148).
- Resolution: Confirmed to keep "LoggdIt"; the hyphen experiment is Deferred.

**LP-019 — External/RCGP accreditation attainability**
- Shared problem: a new product needs a trust/validation signal.
- Option A (sceptical): RCGP won't endorse because it's AI-based — Doctor: "I feel like they would say no because it's AI-based" (L167).
- Option B (optimistic): RCGP guidelines *encourage* AI use (just not AI writing your reflections); traction could earn approval later — Engineer (L168–L172).
- Resolution: Deferred; no accreditation exists. Alternative honest framing proposed: "gets you ready for your ARCP" rather than "RCGP-approved" (L175). Info needed: a reading of current RCGP guidance (feeds LP-033).

**LP-026 — Naming "14Fish" on the page**
- Shared problem: clarify the relationship without legal exposure.
- Concern (Engineer): 14Fish might object to use of their name (L202).
- Counter (Doctor/UX): "I don't think you're violating anything… you're just saying how it works" (L203–L204).
- Resolution: Undecided; legal check suggested.

**LP-016 — Merge repetitive sections**
- Shared problem: two adjacent sections both cover "record and review."
- Raised by Engineer ("maybe I could just combine this into one", L83); UX agrees the ARCP-value section matters more (L86). Resolution: Undecided how to restructure.

**Ideas rejected:** None were explicitly rejected in the transcript.
**Ideas deferred:** LP-019 (accreditation), LP-025 hyphen experiment, LP-043 (trainer collaboration), LP-045 (start-then-resume in copy), LP-041 imagery (raised as "a decision" for later).

---

## 7. Prioritisation-ready backlog

| ID | Theme | Title | Status | Type | Evidence strength | Stated urgency | Expected impact | Estimated effort | Recommended owner |
| -- | ----- | ----- | ------ | ---- | ----------------- | -------------- | --------------- | ---------------- | ----------------- |
| LP-001 | Hero/value prop | Replace/clarify "beta" label | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-002 | Hero/value prop | Rewrite hero headline; drop "Speak your case" | Proposed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-003 | Structure | Concise hero for scanners + checkboxes + CTA | Proposed | UX improvement | Strong | Not stated | Not stated | Not stated | UX Design |
| LP-004 | Hero/value prop | Catchy "ARCP-ready" tagline | Open | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-005 | Hero/value prop | 2–3 scannable USP taglines/checkboxes | Proposed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-006 | Accessibility | Colour-contrast check on pulled-out USP text | Open | Accessibility | Moderate | Not stated | Not stated | Not stated | UI Design |
| LP-007 | Structure | Swipeable screenshot carousel with affordance | Proposed | UX improvement | Strong | Not stated | Not stated | Not stated | UX Design |
| LP-008 | Structure | Benefit caption under each screenshot | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-009 | How-it-works copy | Rework blank-reflection-box line | Confirmed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-010 | How-it-works copy | "Track" → "Track your progress" | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-011 | How-it-works copy | Frame as "Just three steps" | Confirmed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-012 | Trust/privacy | Emphasise "you're in control / edit everything" | Proposed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-013 | How-it-works copy | Remove "coverage dashboard" jargon; show visual | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-014 | How-it-works copy | Remove "You set the deadline" from PDP copy | Confirmed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-015 | Visual design | Stop reusing the tick icon | Proposed | UI improvement | Weak | Not stated | Not stated | Not stated | UI Design |
| LP-016 | Structure | Merge repetitive record/review sections | Open | UX improvement | Moderate | Not stated | Not stated | Not stated | UX Design |
| LP-017 | Trust/social proof | Replace fake testimonials; move up | Confirmed (need) | Risk or constraint | Strong | Not stated | Not stated | Not stated | Marketing |
| LP-018 | Trust/social proof | Testimonial attribution + consent/COI | Open | Content or copy | Moderate | Not stated | Not stated | Not stated | Legal or Compliance |
| LP-019 | Trust/social proof | Validation/accreditation-style messaging | Deferred | Content or copy | Moderate | Not stated | Not stated | Not stated | Cross-functional |
| LP-020 | Analytics | Star ratings didn't lift click-through (learning) | Observed | Analytics or experimentation | Moderate | Not stated | Not stated | Not stated | Analytics |
| LP-021 | Hero/value prop | Surface the time-saving stat | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-022 | Visual design | Rethink palette away from green | Confirmed (change) | Visual design | Strong | Not stated | Not stated | Not stated | UI Design |
| LP-023 | Visual design | Remove orange accent | Confirmed | Visual design | Strong | Not stated | Not stated | Not stated | UI Design |
| LP-024 | Visual design | Adopt colour design tokens | Proposed | Technical improvement | Weak | Not stated | Not stated | Not stated | Engineering |
| LP-025 | Branding | Keep brand name "LoggdIt" | Confirmed | Decision | Strong | Not stated | Not stated | Not stated | Product |
| LP-026 | Positioning | Clarify complements (not replaces) 14Fish | Proposed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-027 | Positioning | Explicit differentiation vs Notion | Proposed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-028 | Hero/value prop | Reframe as easy daily capture ("intelligent diary") | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-029 | Positioning | Clarify GP/RCGP-only scope; cut investor copy | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-030 | Structure | FAQ on its own scannable jump-link page | Proposed | UX improvement | Moderate | Not stated | Not stated | Not stated | UX Design |
| LP-031 | FAQ | Add PDF copy-paste FAQ | Confirmed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-032 | FAQ | Add Android-availability FAQ | Confirmed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-033 | Trust/AI safety | Elevate AI-usage & anti-hallucination content | Confirmed (elevate) | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-034 | Privacy | GDPR its own "GDPR-compliant" section | Confirmed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-035 | Privacy | Clarify/simplify PII-redaction wording | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-036 | Privacy | State "we don't train AI on your data" plainly | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-037 | Privacy | Keep encrypted UK-region + 72h delete copy | Observed | Content or copy | Moderate | Not stated | Not stated | Not stated | Engineering |
| LP-038 | Pricing | Surface "free while in beta"; drop "TBD" | Confirmed | Content or copy | Strong | Not stated | Not stated | Not stated | Content |
| LP-039 | Trust | Reinforce ownership/sign-off + version history | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-040 | Branding/tone | Soften "Who built this" tone | Proposed | Content or copy | Moderate | Not stated | Not stated | Not stated | Content |
| LP-041 | Visual design | Add images of people / lifestyle imagery | Proposed | Visual design | Moderate | Not stated | Not stated | Not stated | UI Design |
| LP-042 | Research/QA | Heuristic eval of homepage + app | Proposed | User research | Moderate | Not stated | Not stated | Not stated | UX Design |
| LP-043 | Roadmap | Future trainer collaboration on drafts | Deferred | Feature request | Weak | Not stated | Not stated | Not stated | Product |
| LP-044 | Typography | Keep the current font | Observed | Content or copy | Weak | Not stated | Not stated | Not stated | UI Design |
| LP-045 | Product | Start-then-resume an entry (reflect in copy) | Deferred | Feature request | Weak | Not stated | Not stated | Not stated | Product |

---

## Coverage note

- Full transcript reviewed: lines 1–379.
- 45 consolidated items (LP-001…LP-045).
- 11 confirmed decisions (Section 4): LP-009, LP-011, LP-014, LP-022 (change only), LP-023, LP-025, LP-031, LP-032, LP-033, LP-034, LP-038.
- No ideas were explicitly rejected. Deferred: LP-019, LP-025 (hyphen), LP-041 (as "a decision"), LP-043, LP-045.
- Priority, expected impact, and estimated effort are almost entirely "Not stated" — the transcript contained no urgency/impact/effort quantification, so none was invented, per the brief.
- No forms, page-speed/performance, cross-browser, or event-tracking topics were substantively discussed; those areas are "Not stated."
- Audience is UK GP trainees (~10–12k in training, per Engineer, L158–L159), age band roughly 25–34 (Doctor, L365). Device specifics (desktop vs mobile breakpoints) were not called out except that the page targets an iOS app audience with Android deferred.
