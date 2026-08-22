// FROZEN on activation. Do not edit. Ship a new vN.M.ts for any change.
// This is the last permissible in-place edit: once the first real user
// acknowledges this document, any further change ships as v1.1.
import type { NoticeDocument } from '@acme/shared';

export const NOTICE_V1_0: NoticeDocument = {
  version: 'v1.0',
  requiresReAckFromPriorVersions: false,
  title: 'Before you start',
  subtitle: null,
  body: [
    {
      type: 'paragraph',
      text: 'Logdit turns your clinical experiences into portfolio entries. Speak or type - we transcribe, remove patient details, then draft each entry with AI.',
    },
    // App Store Guideline 5.1.2(i): the recipients must be NAMED, on this
    // screen, before permission is taken. "AI" on its own is the exact wording
    // the rejection objects to, and a link to the Privacy Policy does not cure
    // it. Kept to one sentence: Apple's test is who / what / what-for, and the
    // rest - US vs UK, EU endpoint, 24-hour deletion, the no-training and
    // purpose-limitation terms - is layer two, carried by Privacy Policy §6, §8
    // and §9. Naming a new AI sub-processor means editing this sentence.
    //
    // Placed BEFORE the health-data paragraph on purpose, so the Art 7(3)
    // withdrawal sentence stays immediately above the checkboxes.
    //
    // The two input modes have DIFFERENT recipients and the sentence must keep
    // saying so. A typed message never touches AssemblyAI - `processTextMessage`
    // goes straight to `redactCleanAndComplete` - so a blanket "your words go to
    // AssemblyAI and Microsoft" would describe processing that does not happen.
    // Naming a recipient who never receives the data is as wrong as omitting one
    // who does, and it gives away a real property of the pipeline: audio is seen
    // by exactly one provider and never reaches a language model.
    //
    // "remove patient details" must stay attached to MICROSOFT. Paragraph one
    // says patient details are removed but names no actor, so without this the
    // reader reasonably infers redaction happens before anything leaves us - and
    // it does not. Azure's redaction is the step that reads the UNREDACTED text,
    // which is exactly what Privacy Policy §9 declines to leave implicit. Note
    // the `registry.spec.ts` purposes test will NOT catch its removal: it joins
    // all paragraphs, and paragraph one satisfies the match on its own.
    {
      type: 'paragraph',
      text: 'Who your words are sent to: audio goes to AssemblyAI for transcription. Your text - typed or transcribed - then goes to Microsoft, which removes patient details and drafts your entry.',
    },
    // Deliberately short. Only two clauses are load-bearing, and neither may go:
    //   "contain health information" → the Art 9 "informed" limb, and the ICO's
    //                                  requirement that explicit consent
    //                                  "specify the NATURE of the special
    //                                  category data".
    //   "you can withdraw…"          → REQUIRED. Art 7(3): "Prior to giving
    //                                  consent, the data subject shall be
    //                                  informed" of the right to withdraw. It
    //                                  must appear BEFORE the checkbox, not only
    //                                  in the Privacy Policy.
    //
    // Cut on purpose: a second description of transcribe/redact/draft (the
    // paragraph above already gives it - and the test in `registry.spec.ts`
    // keeps it there), and a sentence explaining that the consent box stands
    // apart. The ICO requires the consent to BE separate, not that we narrate
    // its separateness, and the box below says "I explicitly consent…" in any
    // case. Everything further is layer two - see Privacy Policy §5.
    //
    // ALSO cut, 2026-08-22, and this one is a JUDGEMENT CALL rather than a
    // redundancy: the opening bridge, "Because your reflections describe real
    // clinical encounters…". It was the only line on the screen explaining WHY a
    // reflection is health data, which is the objection the `health_data_consent`
    // comment below records trainees actually raising ("this isn't about MY
    // health"). Both load-bearing clauses above survive without it, so the Art 9
    // and Art 7(3) positions are unchanged - what was traded was comprehension,
    // not compliance. Recorded here so a future reader does not restore it
    // assuming it was lost by accident. If trainee confusion about the health-data
    // framing ever shows up in support or research, this is the first thing to put
    // back.
    {
      type: 'paragraph',
      text: 'Your reflections contain health information, so we need your explicit consent to process them. You can withdraw at any time by deleting your account.',
    },
    {
      type: 'links',
      items: [
        { label: 'Privacy Policy', url: 'https://logdit.app/privacy' },
        { label: 'Terms of Service', url: 'https://logdit.app/terms' },
      ],
    },
  ],
  acknowledgements: [
    {
      id: 'patient_anon_duty',
      label: "I'll keep patients unidentifiable in what I record.",
      required: true,
    },
    // Art 9(2)(a) requires consent that is EXPLICIT, specific and informed, and
    // unbundled from any other agreement. Hence: the word "explicitly"; the data
    // category named in the label; the purposes carried by the paragraph above;
    // and a checkbox of its own, never merged with `accept_privacy_terms` below.
    // See DPIA A-1 / gate C-1.
    //
    // WHY `required: true` DOES NOT DEFEAT "FREELY GIVEN" (raised in review,
    // 2026-08-04, and answered here so it is not re-raised cold). Declining does
    // block use of the product - the CTA stays disabled and the API rejects a
    // partial set - but Art 7(4) is narrower than "consent must never be a
    // precondition":
    //
    //   - Its text reaches only consent to processing "that is NOT NECESSARY for
    //     the performance of that contract". Transcription, redaction and
    //     drafting ARE the service; there is no Logdit that omits them. This is
    //     not marketing bundled onto a signup.
    //   - It is a weighting factor ("utmost account shall be taken"), not a
    //     nullity rule. The factors that carry weight all point the same way: no
    //     power imbalance (we are not the trainee's employer, deanery or a public
    //     authority), no detriment beyond not using an optional tool, and a
    //     genuine alternative - writing the portfolio by hand, as they do today.
    //
    // Making this optional would be WORSE, not better: it yields either an
    // account that cannot do the one thing the app exists for, or consent theatre
    // where declining still admits the user and the processing happens anyway.
    //
    // The question that IS genuinely open is whether 9(2)(a) is the right
    // condition at all, versus 9(2)(g) + a DPA 2018 Sch 1 condition (which would
    // require an Appropriate Policy Document). Tracked as A-4 / gate C-9 and
    // routed to the ICO Advice Service. Note DEC-5: no solicitor has reviewed any
    // of this, so neither this comment nor a reviewer's objection settles it.
    {
      id: 'health_data_consent',
      // The label states WHAT WE DO and names health information. It does not
      // try to say whose health information it is, and that is deliberate.
      //
      // The ICO's test for EXPLICIT consent is three things: a clear written
      // statement, it must "specify the nature of the special category data",
      // and it must be separate from any other consent. Nature - i.e. that this
      // is health data. There is no requirement to scope the label by data
      // subject, and an earlier draft reading "my own health information" bought
      // no compliance while actively confusing the reader: a trainee reflecting
      // on a patient reasonably asks "but this isn't about MY health".
      //
      // Where the two populations genuinely differ is a matter for Privacy
      // Policy §5 and DPIA §4.2, which is the layer that carries the analysis.
      // A signup checkbox is layer one of a layered notice: it must be accurate,
      // and it must not over-claim, but it does not have to litigate.
      //
      // The PURPOSES ("transcribe, remove patient details, draft your entry")
      // live in the body paragraphs rather than here. That is the layered
      // notice working as intended - the detail sits immediately above the box
      // and is unavoidable before ticking it - but it does make this label
      // DEPENDENT on those paragraphs. If the body is ever trimmed further, the
      // purposes must survive somewhere the user reads before consenting, or
      // move back into the label.
      //
      // The parenthetical is for App Store Guideline 5.1.2(i), not the ICO. The
      // recipients paragraph above already discloses them, which is arguably
      // enough - but App Review reads checkboxes, and a box saying only "with
      // AI" is the phrasing that got build 12 rejected. Four words of insurance
      // against another round. Do not drop it for brevity; do keep it in step
      // with the paragraph above if the sub-processors ever change.
      label:
        'I explicitly consent to Logdit transcribing and analysing my reflections with AI, including any health information they contain.',
      required: true,
    },
    // Absorbs the former standalone `role_uk_trainee` box. The eligibility
    // warranty was already given by Terms cl. 1 ("you represent and warrant
    // that you... are registered or in training as a medical professional in
    // the United Kingdom"), so a separate box restated a promise the user makes
    // anyway. Merging is safe because neither limb is consent - and it makes the
    // Art 9 box above the only item on the screen that is not ordinary contract
    // mechanics, which is where its weight should sit.
    {
      id: 'accept_privacy_terms',
      label:
        'I am a UK doctor in training, and I have read and agree to the Privacy Policy and Terms of Service.',
      required: true,
    },
  ],
  ctaLabel: 'Continue',
  ctaDisclaimer: 'You must confirm the statements above to continue.',
} as const;
