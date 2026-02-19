# Cleaning Stage — Sample Inputs

Paste any transcript below directly into the cleaning stage input.
Each simulates AssemblyAI output after PII redaction (placeholders are intentional).

---

## 1 · GP — T2DM, Hypertension, New Exertional Chest Pain

**What makes it tough:** mangled drug names (`met four men`, `ram ee prill`, `bis oh pro lol`, `ator vast a tin`), spoken BP, spoken HbA1c letters, spoken eGFR, `U and Es`, self-correction mid-sentence, clinical abbreviations ACS / LDL / ST must be preserved.

```
um so today I'm seeing [PERSON_NAME] who is a um fifty four year old female uh [DATE_OF_BIRTH] and uh NHS number is [HEALTHCARE_NUMBER]. She she she's come in today because um her her um met four men was increased at the last appointment and she's been having GI symptoms since. So uh current medications include met four men five hundred - wait sorry, let me redo that - it's met four men MR five hundred milligrams twice daily, uh ram ee prill ten milligrams, uh bis oh pro lol two point five milligrams um and uh ator vast a tin twenty milligrams. On examination um blood pressure was one thirty eight over eighty six, pulse was uh seventy two regular. Um her H B A one C from last month was seven point eight percent, uh eee GFR was fifty two, and uh urea was six point one. There's there's also been some intermittent chest pain which which she describes as sort of a pressure-like discomfort um radiating to the the left arm um on exertion, which resolved resolved with rest. I think we need to um rule out ACS so I've done an EC G today which was was normal sinus rhythm with no acute ST changes. Um so basically the plan is to keep the met four men MR as is and and also refer to cardiology urgently given the exertional chest pain with left arm radiation. I'm I'm also going to increase the ator vast a tin from twenty to forty milligrams given her current LDL of three point two. Um and uh can we book a stress EC G? Uh also want repeat U and Es and and lipid profile in six weeks.
```

---

## 2 · Respiratory — COPD Exacerbation

**What makes it tough:** `sal me ter ol floor tee ca zone` (combination inhaler), `tip oh tro pee um`, `pre niss oh lone`, `a mox ee sill in`, spoken FEV1/FVC ratio, spoken SpO2, oxygen flow rate, mid-dictation noise artefact self-corrected ("door — sorry ignore that"), nebuliser self-correction (Salmeterol → Salbutamol).

```
so uh [PERSON_NAME] is a sixty seven year old male lifelong smoker um presenting with uh worsening breathlessness and productive cough over the last uh three days. Background of um COPD, uh stage three on last spirometry with an um F E V one of um sixty three percent predicted and an F E V one over F V C of nought point five eight. Current inhalers include um sal me ter ol floor tee ca zone - that's the combination inhaler - uh two puffs twice daily, and um tip oh tro pee um uh once daily. On examination uh he's uh sat oh two was eighty nine percent on air, so I put him on um controlled oxygen uh two L per min via nasal cannula and he came up to ninety four. Uh P E F R was not - actually P E F R wasn't done, he was too breathless. Chest had um bilateral - sorry - there were there were coarse crackles and um expiratory wheeze bilateral - bilaterally. Uh sputum is um yellow-green and purulent. So the plan is um door - sorry ignore that - the plan is pre niss oh lone thirty milligrams for five days and a mox ee sill in five hundred three times daily for um five days as well. Nebulised sal me ter ol - sorry nebulised sal bu ta mol - two point five milligrams every four hours. And um chest X-ray to exclude pneumonia, FBC and CRP.
```

---

## 3 · Psychiatry — Depression, Anxiety, Risk Assessment

**What makes it tough:** `sir tra leen`, `pro pran oh lol`, spoken PHQ-9 and GAD-7 scores, spoken score format "twenty two out of twenty seven", risk assessment language that must be preserved verbatim (no clinical rewording), SSRI abbreviation must stay, hedged clinical phrasing ("I felt she was not at immediate risk").

```
um so I reviewed [PERSON_NAME] today in outpatients. She's a uh thirty one year old female referred by her GP um with a six week history of low mood and uh anxiety. She completed the um P H Q nine before the appointment, scoring um twenty two out of twenty seven, indicating uh severe depression. G A D seven score was uh sixteen, indicating severe anxiety. Um she she reports poor sleep, reduced appetite, difficulty concentrating, and uh anhedonia. Um with regard to risk um she has she has passive thoughts of death - she described not wanting to wake up in the morning - but she uh she denied any active suicidal ideation, intent, or plan. No no history of self-harm. She has good social support from her family. Um I felt she was not at immediate risk but um the situation warrants close monitoring. My plan is to um start her on an S S R I um specifically sir tra leen fifty milligrams once daily and um increase to one hundred milligrams after two weeks if well tolerated. I've also um prescribed pro pran oh lol forty milligrams as needed um for situational anxiety. Uh safety netting discussed um she has the um crisis team number. Follow up in um four weeks or sooner if concerned.
```

---

## 4 · A&E / Cardiology — Anterior STEMI, Primary PCI

**What makes it tough:** `tick ah grell or`, `ass purr in`, `un frac shun ated hep ar in`, spoken timestamp "ten forty two", spoken lead ranges "V one through V four", high-sensitivity troponin abbreviation, door-to-balloon idiom, clinical abbreviations STEMI / PCI / LAD / TIMI must all be preserved. Deliberately sparse fillers — verifies the output stays concise.

```
[PERSON_NAME], sixty two year old male. Arrived at ten forty two with central crushing chest pain onset approximately ninety minutes prior. EC G at ten forty five confirmed anterior S T E M I with um ST elevation in V one through V four. Cath lab activated. Loading doses given: ass purr in three hundred milligrams and tick ah grell or one hundred and eighty milligrams. Un frac shun ated hep ar in five thousand units IV bolus. Door to balloon time was um thirty eight minutes. Um high sensitivity troponin T at presentation was uh four hundred and twelve. P C I performed to proximal L A D, single drug-eluting stent deployed, uh T I M I three flow restored. Post-procedure the patient is uh chest pain free. Repeat EC G shows resolving ST elevation. He'll be transferred to the coronary care unit for monitoring. Dual antiplatelet therapy to continue: ass purr in seventy five milligrams daily and tick ah grell or ninety milligrams twice daily for twelve months.
```

---

## 5 · Paediatrics — First Febrile Convulsion

**What makes it tough:** `par ass ee ta mol`, `my daz oh lam`, `eye boo pro fen`, weight-based dose "fifteen milligrams per kilogram", spoken temperature "thirty nine point two degrees", parental reassurance language that must not be reworded as clinical findings, "does not need" double-negative clinical statement must be preserved exactly.

```
um so we're seeing uh [PERSON_NAME], an eighteen month old um male brought in by his parents after a um generalised tonic-clonic seizure at home lasting uh approximately three minutes. This was his um first ever seizure. Temperature on arrival was um thirty nine point two degrees, consistent with a febrile convulsion. No um no focal neurology on examination. Fontanelle um closed and non-bulging. He's uh developmentally um appropriate for age. Um in terms of management in the department um we gave um par ass ee ta mol fifteen milligrams per kilogram orally - uh sorry rectally, he um wouldn't take it orally. The seizure had already resolved by the time he arrived so um my daz oh lam was not needed. Um I've counselled the parents extensively. Um so basically I told them um febrile convulsions are are common, affecting roughly one in thirty children, and the vast majority do not have epilepsy. Um I've given them a um rescue plan: if if a seizure lasts more than five minutes at home, administer buccal my daz oh lam zero point five milligrams per kilogram and call nine nine nine. Um I told them um par ass ee ta mol and eye boo pro fen are for comfort only and do not prevent febrile convulsions. Um [PERSON_NAME] does not need um routine EEG or neuroimaging given the typical nature of the seizure. Discharge home um with safety netting um and um GP follow up.
```

---

## 6 · Orthopaedics — Post-op Day 2 Total Hip Replacement Review

**What makes it tough:** `ree varr ox ah ban`, `en oh ex ah pear in`, `seff ah zo lin`, spoken range-of-movement angles, spoken CRP / haemoglobin values, dictated in third person (must stay third person), VTE / DVT / THR abbreviations must be preserved, 35-day duration must be exact.

```
post-op day two review for [PERSON_NAME] following right-sided T H R performed um yesterday under general anaesthetic. Um the patient is comfortable and um mobilising with a um frame. Wound inspection: um the wound is um clean and dry with no signs of infection, no erythema, no discharge. Range of movement: um flexion to approximately ninety degrees, um abduction um limited um to around twenty degrees in keeping with precautions. Um bloods from this morning - um C R P is elevated at um one hundred and twelve, which is expected post-operatively. Haemoglobin is um nine point eight, which is a drop from pre-op. Full blood count otherwise unremarkable. Um D V T prophylaxis: um he was on en oh ex ah pear in pre-operatively but we're switching him to ree varr ox ah ban ten milligrams um once daily um starting this evening, to be continued for thirty five days as per V T E prophylaxis guidelines for T H R. Um IV seff ah zo lin was given intra-operatively and peri-operative antibiotics have been stopped as per protocol. Plan is to um continue physiotherapy, um ensure compliance with hip precautions, and and discharge planning for um day four or five if progress is maintained.
```
