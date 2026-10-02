import { MessageRole, SampleCaseDefinition } from '@acme/shared';
import { GpEntryType } from '../gp.entry-types';

/**
 * First-run worked example: a Clinical Case Review and the conversation that
 * produced it. Served publicly and cached, so the case must stay FICTIONAL — it
 * was generated from the scripted case in `docs/cases/case1.md`, not a real
 * consultation. Text is verbatim from that run; only display content is kept.
 *
 * The final capability-selection exchange is omitted: the entry already shows the
 * confirmed capabilities, and its "Selected: …" text would hard-code capability
 * names that `capabilities` resolves from config.
 */
export const GP_SAMPLE_CASE: SampleCaseDefinition = {
  entryType: GpEntryType.CLINICAL_CASE_REVIEW,
  title: '78F - fall, postural hypotension',
  sections: [
    {
      sectionId: 'brief_description',
      text: 'A 78-year-old woman presented after a fall at home two days ago, with dizziness on standing. She had no loss of consciousness, head injury, chest pain, or palpitations. Her history includes hypertension and osteoarthritis, and I had started tamsulosin three weeks ago. Examination showed a bruise on the hip, normal neurology, and a lying and standing BP drop from 142 to 118 systolic with dizziness; ECG was normal. I was fairly happy this was postural hypotension from the combination of ramipril and tamsulosin, rather than a mechanical trip or cardiac cause. I stopped the tamsulosin, kept the ramipril with advice to hold it if lightheaded, gave postural advice, referred to the community falls team, and booked a two-week review. At review the standing BP had improved (only 8-point drop), she had no further falls, and the falls team had installed grab rails — the resolution pretty much confirmed the drug as the cause.',
    },
    {
      sectionId: 'reflection',
      text: 'Looking back, the thing I did well was actually bothering to do the lying and standing BP. At the end of the day, it would have been easy to just call it a trip and move on, and I nearly did. What I would change is, honestly, I should have thought about the postural drop when I started the tamsulosin three weeks earlier, in someone her age already on an antihypertensive. I sort of added it without weighing the falls risk. So the real gap was the prescribing decision, not the fall.',
    },
    {
      sectionId: 'learning',
      text: 'The learning point for me is prescribing in older patients. I want to be more systematic about checking falls and postural BP risk before starting things like alpha-blockers in the elderly. I am going to read up on the STOPP/START criteria, and I will set myself a rule to do a lying-and-standing BP whenever I start or add an antihypertensive in anyone over 65.',
    },
  ],
  capabilities: [
    {
      code: 'C-01',
      evidence:
        'I should have thought about the postural drop when I started the tamsulosin three weeks earlier, in someone her age already on an antihypertensive. I sort of added it without weighing the falls risk. So the real gap was the prescribing decision, not the fall.',
      justification:
        'I recognised that my prescribing decision was the real gap, acknowledging that I added tamsulosin without weighing the falls risk in an older patient already on an antihypertensive, which demonstrates recognising limits of my competence and a need to improve my prescribing in older patients.',
    },
    {
      code: 'C-04',
      evidence:
        "I did a lying and standing BP though, and that's where it was: 142 lying, dropped to about 118 systolic on standing, and she felt dizzy with it. Heart sounds normal. ECG was sinus rhythm, nothing acute.",
      justification:
        'I performed a lying and standing blood pressure and interpreted the result — a drop from 142 to 118 systolic with dizziness — to identify postural hypotension, which is interpreting clinical data to inform the diagnosis.',
    },
    {
      code: 'C-06',
      evidence:
        "I was fairly happy this was postural hypotension, most likely the combination of her ramipril and the tamsulosin I'd added, rather than a mechanical trip or anything cardiac.",
      justification:
        'I reasoned toward the diagnosis of postural hypotension by weighing the differentials — mechanical trip, cardiac event — and linking it to the recent addition of tamsulosin alongside her ramipril, which shows my reasoning toward a diagnosis and how I handled diagnostic uncertainty.',
    },
  ],
  conversation: [
    {
      role: MessageRole.USER,
      text: "Right, last one of the day.\n\n78-year-old lady came in with her daughter. She’d had a fall at home two days ago. No loss of consciousness, no head injury; she just sort of went down in the kitchen. She felt a bit dizzy when she stood up from a chair, apparently. No chest pain, no palpitations beforehand, no tongue-biting or incontinence, so it didn't really sound like a seizure or a cardiac collapse.\n\nShe’s normally pretty independent and does her own shopping. Past history: hypertension, bit of osteoarthritis, and, ah, I'd actually started her on tamsulosin about three weeks ago for some urinary symptoms.",
    },
    {
      role: MessageRole.USER,
      text: "On examination she was alright really. No injuries apart from a bruise on the hip. Neuro normal. Gait a bit cautious but okay.\n\nI did a lying and standing BP though, and that's where it was: 142 lying, dropped to about 118 systolic on standing, and she felt dizzy with it. Heart sounds normal. ECG was sinus rhythm, nothing acute.\n\nI was fairly happy this was postural hypotension, most likely the combination of her ramipril and the tamsulosin I'd added, rather than a mechanical trip or anything cardiac.",
    },
    {
      role: MessageRole.ASSISTANT,
      text: "Strong work. Let's sharpen what remains so your entry stands out.",
      question:
        "You've described the assessment well — what management plan did you put in place for her postural hypotension?",
    },
    {
      role: MessageRole.USER,
      text: "I stopped the tamsulosin. That was the most recent change and the likely culprit.\n\nKept the ramipril for now, but told her to hold it if she felt lightheaded, and said I'd review the whole medication list. Gave her advice about standing up slowly, getting up from bed in stages, and keeping her fluids up.\n\nReferred her to the community falls team for a proper assessment, and booked a review in two weeks to recheck the lying and standing BP. Safety-netted too—come back sooner or ring 111 if any more falls, blackouts, or chest pain.",
    },
    {
      role: MessageRole.ASSISTANT,
      text: 'This is coming together well — just rounding out a few areas now.',
      question:
        "You've described a solid plan — did she come back for the two-week review, and how was she doing then?",
    },
    {
      role: MessageRole.USER,
      text: "She came back for the two-week review. The standing BP had come up, only dropped about 8 points that time, and no dizziness with it. She'd had no further falls.\n\nThe falls team had been out and put a couple of grab rails in at home. It settled once the tamsulosin was out of the picture, which pretty much confirmed it was the drug.",
    },
    {
      role: MessageRole.ASSISTANT,
      text: "The picture is nearly complete — let's fill the last gaps.",
      question:
        'Looking back at this case, what do you think went well and what might you approach differently next time, and why?',
    },
    {
      role: MessageRole.USER,
      text: "Looking back, the thing I did well was actually bothering to do the lying and standing BP. At the end of the day, it'd have been easy to just call it a trip and move on, and I nearly did.\n\nWhat I'd change is, honestly, I should have thought about the postural drop when I started the tamsulosin three weeks earlier, in someone her age already on an antihypertensive. I sort of added it without weighing the falls risk. So the real gap was the prescribing decision, not the fall.",
    },
    {
      role: MessageRole.ASSISTANT,
      text: "Strong work. Let's sharpen what remains so your entry stands out.",
      question:
        'You mentioned the real gap was the prescribing decision when you added tamsulosin — what specific learning need does that highlight for you, and what will you do to address it?',
    },
    {
      role: MessageRole.USER,
      text: "The learning point for me is prescribing in older patients. I want to be more systematic about checking falls and postural BP risk before starting things like alpha-blockers in the elderly.\n\nI'm going to read up on the STOPP/START criteria, and I'll set myself a rule to do a lying-and-standing BP whenever I start or add an antihypertensive in anyone over 65.",
    },
  ],
};
