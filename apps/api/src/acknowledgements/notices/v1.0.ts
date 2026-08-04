// FROZEN on activation. Do not edit. Ship a new vN.M.ts for any change.
//
// EXCEPTION, 2026-08-04: amended in place to (a) add the Art 9(2)(a) explicit
// consent item (`health_data_consent`) and its supporting paragraph, and (b)
// fold the former `role_uk_trainee` box into `accept_privacy_terms`, taking the
// screen from four required boxes to three. Fewer boxes is the safer position,
// not merely the tidier one: a lone consent item among three mandatory
// contract-mechanics boxes reads as a formality, and both the ICO and EDPB treat
// consent fatigue as a threat to the QUALITY of consent. The freeze
// rule exists to protect acknowledgement rows already given as evidence, and no
// PRODUCTION row has ever been written — the app is not live. Dev rows exist but
// are not evidence of anything. `requiresReAckFromPriorVersions` is therefore
// moot rather than wrong. This is the last permissible in-place edit: once the
// first real user acknowledges this document, any further change ships as v1.1.
import type { NoticeDocument } from '@acme/shared';

export const NOTICE_V1_0: NoticeDocument = {
  version: 'v1.0',
  requiresReAckFromPriorVersions: false,
  title: 'Before you start',
  subtitle: null,
  body: [
    {
      type: 'paragraph',
      text: 'Logdit helps UK trainee doctors turn clinical experiences into portfolio entries. We transcribe your recording, automatically remove patient details, then use AI to draft each entry.',
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
    // paragraph above already gives it — and the test in `registry.spec.ts`
    // keeps it there), and a sentence explaining that the consent box stands
    // apart. The ICO requires the consent to BE separate, not that we narrate
    // its separateness, and the box below says "I explicitly consent…" in any
    // case. Everything further is layer two — see Privacy Policy §5.
    {
      type: 'paragraph',
      text: 'Because your reflections describe real clinical encounters, they contain health information — and your explicit consent is needed to process it. You can withdraw at any time by deleting your account.',
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
    // block use of the product — the CTA stays disabled and the API rejects a
    // partial set — but Art 7(4) is narrower than "consent must never be a
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
    //     genuine alternative — writing the portfolio by hand, as they do today.
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
      // and it must be separate from any other consent. Nature — i.e. that this
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
      // live in the first body paragraph rather than here. That is the layered
      // notice working as intended — the detail sits immediately above the box
      // and is unavoidable before ticking it — but it does make this label
      // DEPENDENT on that paragraph. If the body is ever trimmed further, the
      // purposes must survive somewhere the user reads before consenting, or
      // move back into the label.
      label:
        'I explicitly consent to Logdit transcribing and analysing my reflections with AI, including any health information they contain.',
      required: true,
    },
    // Absorbs the former standalone `role_uk_trainee` box. The eligibility
    // warranty was already given by Terms cl. 1 ("you represent and warrant
    // that you... are registered or in training as a medical professional in
    // the United Kingdom"), so a separate box restated a promise the user makes
    // anyway. Merging is safe because neither limb is consent — and it makes the
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
