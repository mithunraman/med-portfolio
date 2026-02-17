{
"ontology_metadata": {
"ontology_name": "GP_Curriculum_Quality_Ontology",
"curriculum_title": "The RCGP Curriculum: Being a General Practitioner",
"curriculum_version": "unknown",
"generated_at": "2026-02-16T00:00:00Z",
"method": "LLM_extraction_with_traceability",
"notes": [
"Extracted from: 'The RCGP Curriculum Being a General Practitioner (For implementation from 1 August 2025)'. :contentReference[oaicite:0]{index=0}",
"Curriculum defines five 'areas of capability' composed of 13 specific capabilities (Table 1).",
"Quality levels QL1-QL4 are meta-analytic anchors mapped (inferred) to the curriculum’s learning-outcome complexity taxonomy (Table 3) and progression point descriptor columns."
]
},
"domains": [
{
"id": "D-01",
"name": "Knowing yourself and relating to others",
"description": "Professional expertise underpinned by ability to understand yourself and relate successfully to other people.",
"aliases": ["Area of capability: Knowing yourself and relating to others"],
"source_pages": ["p9", "p29"],
"source_quotes": [
"The learning outcomes ... are organised into five areas of capability.",
"The development of professional expertise ... is underpinned by your ability to understand yourself and to relate successfully to other people."
],
"confidence": 0.95
},
{
"id": "D-02",
"name": "Applying clinical knowledge and skill",
"description": "Building the broad base of clinical knowledge and skills needed for generalist medical practice.",
"aliases": ["Area of capability: Applying clinical knowledge and skill"],
"source_pages": ["p9", "p44"],
"source_quotes": [
"Knowing yourself ... Applying clinical knowledge and skill ...",
"Your training will focus on building the broad base of clinical knowledge and skills needed for generalist medical practice."
],
"confidence": 0.95
},
{
"id": "D-03",
"name": "Managing complex and long-term care",
"description": "Care extending beyond acute problems including comorbidity, uncertainty, risk, and coordination across systems.",
"aliases": ["Area of capability: Managing complex and long-term care"],
"source_pages": ["p9", "p62"],
"source_quotes": [
"Managing complex and long-term care",
"Medical complexity includes a team-based approach to managing multimorbidity... and management of uncertainty and risk."
],
"confidence": 0.95
},
{
"id": "D-04",
"name": "Working well in organisations and systems of care",
"description": "Care for patients at multiple levels in organisations/systems; develop performance, teaching, leadership and management capabilities.",
"aliases": ["Area of capability: Working well in organisations and systems of care"],
"source_pages": ["p9", "p71"],
"source_quotes": [
"Working well in organisations and systems of care",
"As a GP, you care for patients at numerous levels in the health service."
],
"confidence": 0.95
},
{
"id": "D-05",
"name": "Caring for the whole person, the wider community and the environment",
"description": "Whole-person care integrating physical, emotional, social, cultural and environmental dimensions; safeguarding; community and planetary health.",
"aliases": ["Area of capability: Caring for the whole person, the wider community and the environment"],
"source_pages": ["p9", "p83"],
"source_quotes": [
"Caring for the whole person, the wider community, and the environment",
"They also require you to... incorporate the physical, emotional, social, spiritual, cultural and economic aspects of wellbeing."
],
"confidence": 0.95
}
],
"capabilities": [
{
"id": "C-01",
"name": "Fitness to practise",
"parent_domain_id": "D-01",
"description": "Professional values and behaviours, maintaining health and wellbeing, insight into performance risks and taking action to protect patients/self.",
"components": [
{
"name": "Demonstrating the attitudes and behaviours expected of a good doctor",
"type": "behaviour",
"source_pages": ["p29"],
"source_quotes": ["Demonstrating the attitudes and behaviours expected of a good doctor"],
"confidence": 0.9
},
{
"name": "Managing the factors that influence your performance",
"type": "behaviour",
"source_pages": ["p29", "p30"],
"source_quotes": ["Managing the factors that influence your performance"],
"confidence": 0.9
},
{
"name": "Promoting health and wellbeing in yourself and colleagues",
"type": "behaviour",
"source_pages": ["p30"],
"source_quotes": ["Promoting health and wellbeing in yourself and colleagues"],
"confidence": 0.9
}
],
"aliases": [],
"source_pages": ["p10", "p29"],
"source_quotes": [
"Fitness to practise",
"This capability concerns your development of professional values and behaviours and preparation for revalidation."
],
"confidence": 0.93
},
{
"id": "C-02",
"name": "An ethical approach",
"parent_domain_id": "D-01",
"description": "Practising ethically, with integrity and respect for diversity.",
"components": [
{
"name": "Treating others fairly and with respect, acting without discrimination or prejudice",
"type": "behaviour",
"source_pages": ["p34"],
"source_quotes": ["Treating others fairly and with respect, acting without discrimination or prejudice"],
"confidence": 0.9
},
{
"name": "Providing care with compassion and kindness",
"type": "behaviour",
"source_pages": ["p34"],
"source_quotes": ["Providing care with compassion and kindness"],
"confidence": 0.9
},
{
"name": "Promoting an environment of inclusivity, safety, cultural humility and freedom to speak up",
"type": "behaviour",
"source_pages": ["p35"],
"source_quotes": ["Promoting an environment of inclusivity, safety, cultural humility and freedom to speak up"],
"confidence": 0.9
}
],
"aliases": [],
"source_pages": ["p10", "p34"],
"source_quotes": [
"An ethical approach",
"This capability involves practising ethically, with integrity and a respect for diversity."
],
"confidence": 0.93
},
{
"id": "C-03",
"name": "Communicating and consulting",
"parent_domain_id": "D-01",
"description": "Consultation techniques, partnerships, challenging consultations, interpreters, and modalities across in-person and remote methods.",
"components": [
{
"name": "Establishing an effective partnership through a range of in-person and remote consulting modalities",
"type": "skill",
"source_pages": ["p38"],
"source_quotes": ["Establishing an effective partnership through a range of in-person and remote consulting modalities"],
"confidence": 0.9
},
{
"name": "Managing the additional challenge of consultations with patients who have communication needs or different languages/cultures/beliefs/educational backgrounds",
"type": "skill",
"source_pages": ["p39"],
"source_quotes": ["Managing the additional challenge of consultations with patients who have communication needs"],
"confidence": 0.88
},
{
"name": "Maintaining continuing relationships with patients, carers and families",
"type": "behaviour",
"source_pages": ["p39"],
"source_quotes": ["Maintaining continuing relationships with patients, carers and families"],
"confidence": 0.9
}
],
"aliases": [],
"source_pages": ["p10", "p38"],
"source_quotes": [
"Communicating and consulting",
"This capability covers communicating with patients... across the range of in-person and remote methods."
],
"confidence": 0.94
},
{
"id": "C-04",
"name": "Data gathering and interpretation",
"parent_domain_id": "D-02",
"description": "Gathering, interpreting and using data for clinical judgement from history, records, examination and investigations.",
"components": [
{
"name": "Applying an organised approach to data gathering and investigation",
"type": "skill",
"source_pages": ["p44"],
"source_quotes": ["Applying an organised approach to data gathering and investigation"],
"confidence": 0.9
},
{
"name": "Interpreting findings accurately and appropriately",
"type": "skill",
"source_pages": ["p45"],
"source_quotes": ["Recognise ‘red flags’ and other indicators of high risk"],
"confidence": 0.88
}
],
"aliases": [],
"source_pages": ["p10", "p44"],
"source_quotes": [
"Data gathering and interpretation",
"This capability includes the gathering, interpretation and use of data for clinical judgement."
],
"confidence": 0.94
},
{
"id": "C-05",
"name": "Clinical examination and procedural skills",
"parent_domain_id": "D-02",
"description": "Competence in general/systemic examinations and a range of clinical examination and procedural skills relevant to general practice.",
"components": [
{
"name": "Demonstrating a proficient approach to clinical examination and performance of procedures",
"type": "skill",
"source_pages": ["p48"],
"source_quotes": ["Demonstrating a proficient approach to clinical examination and performance of procedures"],
"confidence": 0.9
},
{
"name": "Demonstrating a proficient approach to the performance of procedures",
"type": "skill",
"source_pages": ["p48"],
"source_quotes": ["Demonstrating a proficient approach to the performance of procedures"],
"confidence": 0.9
}
],
"aliases": ["Clinical Examination and Procedural Skills (CEPS)"],
"source_pages": ["p10", "p48"],
"source_quotes": [
"Clinical Examination and Procedural Skills (CEPS)",
"By the end of training, the GP registrar must have demonstrated competence in general and systemic examinations."
],
"confidence": 0.94
},
{
"id": "C-06",
"name": "Decision-making and diagnosis",
"parent_domain_id": "D-02",
"description": "Organised decision-making tailored to circumstances; tolerating uncertainty; using evidence appropriately.",
"components": [
{
"name": "Adopting appropriate decision-making principles based on a shared understanding",
"type": "skill",
"source_pages": ["p52"],
"source_quotes": ["Adopting appropriate decision-making principles based on a shared understanding"],
"confidence": 0.9
},
{
"name": "Using best available, current, valid and relevant evidence",
"type": "knowledge",
"source_pages": ["p52", "p53"],
"source_quotes": ["Use the best available evidence in your decision-making and apply critical thinking"],
"confidence": 0.88
}
],
"aliases": [],
"source_pages": ["p10", "p52"],
"source_quotes": [
"Decision-making and diagnosis",
"The capability covers adopting a conscious, organised approach to making decisions."
],
"confidence": 0.94
},
{
"id": "C-07",
"name": "Clinical management",
"parent_domain_id": "D-02",
"description": "Recognition and management of common conditions; safe prescribing; supported self-care; referral and urgent care.",
"components": [
{
"name": "Providing collaborative clinical care to patients that supports their autonomy",
"type": "skill",
"source_pages": ["p56"],
"source_quotes": ["Providing collaborative clinical care to patients that supports their autonomy"],
"confidence": 0.9
},
{
"name": "Using a reasoned approach to clinical management that includes supported self-care",
"type": "skill",
"source_pages": ["p57"],
"source_quotes": ["Give appropriate ‘safety-netting advice’"],
"confidence": 0.85
},
{
"name": "Making appropriate use of other professionals and services",
"type": "skill",
"source_pages": ["p57", "p58"],
"source_quotes": ["Refer appropriately to other professionals and services"],
"confidence": 0.88
},
{
"name": "Providing urgent care when needed",
"type": "skill",
"source_pages": ["p58"],
"source_quotes": ["Recognise that responding to unscheduled requests for urgent care is a core part of a GP’s role"],
"confidence": 0.88
}
],
"aliases": [],
"source_pages": ["p10", "p56"],
"source_quotes": [
"Clinical management",
"This capability includes the recognition and management of common medical conditions encountered in generalist medical care."
],
"confidence": 0.94
},
{
"id": "C-08",
"name": "Medical complexity",
"parent_domain_id": "D-03",
"description": "Managing multimorbidity/complex needs, uncertainty and risk; coordinating care; rehabilitation and palliative care considerations.",
"components": [
{
"name": "Enable people living with long-term conditions to optimise their health",
"type": "skill",
"source_pages": ["p62"],
"source_quotes": ["Enable people living with long-term conditions to optimise their health"],
"confidence": 0.9
},
{
"name": "Using a personalised approach to manage and monitor concurrent health problems for individual patients",
"type": "skill",
"source_pages": ["p63"],
"source_quotes": ["Demonstrate a person-centred approach to identify, clarify and prioritise the issues"],
"confidence": 0.86
},
{
"name": "Managing risk and uncertainty while adopting safe and effective approaches for patients with complex needs",
"type": "skill",
"source_pages": ["p63", "p64"],
"source_quotes": ["Manage the inevitable uncertainty in complex problem-solving through... ‘safety-netting’ techniques"],
"confidence": 0.86
},
{
"name": "Co-ordinating and overseeing patient care across healthcare systems",
"type": "skill",
"source_pages": ["p64"],
"source_quotes": ["Demonstrate the ability to support patients in navigating along and between care pathways"],
"confidence": 0.86
}
],
"aliases": [],
"source_pages": ["p11", "p62"],
"source_quotes": [
"Medical complexity",
"Medical complexity includes a team-based approach to managing multimorbidity... and management of uncertainty and risk."
],
"confidence": 0.94
},
{
"id": "C-09",
"name": "Team working",
"parent_domain_id": "D-03",
"description": "Working effectively with other professionals, information sharing, service navigation, and team-based leadership.",
"components": [
{
"name": "Working as an effective member of multiprofessional and diverse teams",
"type": "behaviour",
"source_pages": ["p67"],
"source_quotes": ["Working as an effective member of multiprofessional and diverse teams"],
"confidence": 0.9
},
{
"name": "Leading and co-ordinating a team-based approach to patient care",
"type": "skill",
"source_pages": ["p67"],
"source_quotes": ["Demonstrate the capability to lead and coordinate care at a team level"],
"confidence": 0.88
}
],
"aliases": [],
"source_pages": ["p11", "p67"],
"source_quotes": [
"Team working",
"Working effectively with other professionals is essential to good patient care."
],
"confidence": 0.94
},
{
"id": "C-10",
"name": "Performance, learning and teaching",
"parent_domain_id": "D-04",
"description": "Continuously improving performance and CPD; quality improvement and research activity; supporting learning of others.",
"components": [
{
"name": "Continuously evaluating and improving the care you provide",
"type": "behaviour",
"source_pages": ["p71", "p72"],
"source_quotes": ["Show commitment to continuing professional development through critical reflection"],
"confidence": 0.86
},
{
"name": "Adopting a safe and evidence-informed approach to improve quality of care",
"type": "skill",
"source_pages": ["p72"],
"source_quotes": ["Follow infection-control protocols and demonstrate handwashing and aseptic techniques"],
"confidence": 0.84
},
{
"name": "Supporting the education and professional development of others",
"type": "skill",
"source_pages": ["p73"],
"source_quotes": ["Recognise that it is the duty of every doctor to contribute to the education"],
"confidence": 0.86
}
],
"aliases": [],
"source_pages": ["p11", "p71"],
"source_quotes": [
"Performance, learning and teaching",
"It includes leading clinical care and service development, as well as participating in quality improvement and research activity."
],
"confidence": 0.94
},
{
"id": "C-11",
"name": "Organisation, management and leadership",
"parent_domain_id": "D-04",
"description": "Understanding organisations/systems, record-keeping, data/IT, structured care planning, leadership and business/financial skills.",
"components": [
{
"name": "Advocating for medical generalism in healthcare",
"type": "behaviour",
"source_pages": ["p77"],
"source_quotes": ["Recognise the importance of generalism in co-ordinating patient care"],
"confidence": 0.86
},
{
"name": "Applying leadership skills to help improve your organisation’s performance",
"type": "skill",
"source_pages": ["p78"],
"source_quotes": ["Recognise that leadership and management are core responsibilities of every doctor"],
"confidence": 0.86
},
{
"name": "Making effective use of data, technology and communication systems to provide better patient care",
"type": "skill",
"source_pages": ["p78", "p79"],
"source_quotes": ["Routinely record and appropriately code each clinical contact in a timely manner"],
"confidence": 0.85
},
{
"name": "Developing the financial and business skills required for your role",
"type": "knowledge",
"source_pages": ["p78"],
"source_quotes": ["Interpret relevant financial documents relating to your work as a GP"],
"confidence": 0.82
}
],
"aliases": ["Organisation, management and leadership"],
"source_pages": ["p11", "p77"],
"source_quotes": [
"Organisation, management and leadership",
"This capability involves understanding organisations and systems, including the appropriate use of administration systems."
],
"confidence": 0.94
},
{
"id": "C-12",
"name": "Holistic practice, health promotion and safeguarding",
"parent_domain_id": "D-05",
"description": "Holistic, person-centred care across physical/psychological/socio-economic/cultural dimensions; safeguarding individuals, families and populations.",
"components": [
{
"name": "Demonstrating the holistic mindset of a generalist medical practitioner",
"type": "behaviour",
"source_pages": ["p84"],
"source_quotes": ["Enquire routinely into the psychosocial, cultural, and socio-economic aspects"],
"confidence": 0.84
},
{
"name": "Supporting people through their experiences of health, illness and recovery with a personalised approach",
"type": "skill",
"source_pages": ["p84", "p85"],
"source_quotes": ["Facilitate individually tailored health literacy"],
"confidence": 0.82
},
{
"name": "Safeguarding individuals, families and local populations",
"type": "skill",
"source_pages": ["p85"],
"source_quotes": ["Respond safely, promptly and effectively to the full range of safeguarding needs"],
"confidence": 0.84
}
],
"aliases": [],
"source_pages": ["p11", "p83"],
"source_quotes": [
"Holistic practice, health promotion and safeguarding",
"A key aspect of holistic care is safeguarding the health and welfare of patients, families and local populations."
],
"confidence": 0.94
},
{
"id": "C-13",
"name": "Community health and environmental sustainability",
"parent_domain_id": "D-05",
"description": "Interconnection of individual health with populations and planet; understanding health service; community relationships; population and planetary health.",
"components": [
{
"name": "Understanding the health service and your role within it",
"type": "knowledge",
"source_pages": ["p89", "p90"],
"source_quotes": ["Describe the current structure of your local healthcare system"],
"confidence": 0.84
},
{
"name": "Building relationships with the communities in which you work",
"type": "skill",
"source_pages": ["p90"],
"source_quotes": ["Analyse and identify the health characteristics of the populations with which you work"],
"confidence": 0.84
},
{
"name": "Promoting population and planetary health",
"type": "behaviour",
"source_pages": ["p90", "p91"],
"source_quotes": ["Use resources and services judiciously, maximising their effectiveness while minimising harm"],
"confidence": 0.82
}
],
"aliases": [],
"source_pages": ["p11", "p89"],
"source_quotes": [
"Community health and environmental sustainability",
"The health of individuals is deeply interconnected with the health of populations and the planet."
],
"confidence": 0.94
}
],
"clinical_contexts": [
{
"id": "CX-01",
"name": "Community setting",
"type": "setting",
"aliases": ["in the community"],
"source_pages": ["p5", "p56"],
"source_quotes": ["GPs provide evidence-informed personalised care in the community", "provide general medical care in the community setting"],
"confidence": 0.9,
"inferred": false,
"inference_reason": null
},
{
"id": "CX-02",
"name": "General practice or home setting",
"type": "setting",
"aliases": ["general practice setting", "home setting"],
"source_pages": ["p48"],
"source_quotes": ["within a general practice or home setting"],
"confidence": 0.9,
"inferred": false,
"inference_reason": null
},
{
"id": "CX-03",
"name": "Home visits",
"type": "encounter_mode",
"aliases": [],
"source_pages": ["p15", "p48"],
"source_quotes": ["home visits", "during home visits, in emergencies"],
"confidence": 0.88,
"inferred": false,
"inference_reason": null
},
{
"id": "CX-04",
"name": "Out-of-hours services",
"type": "setting",
"aliases": ["out-of-hours"],
"source_pages": ["p6", "p15"],
"source_quotes": ["out-of-hours services", "out-of-hours services"],
"confidence": 0.9,
"inferred": false,
"inference_reason": null
},
{
"id": "CX-05",
"name": "In-person consultations",
"type": "encounter_mode",
"aliases": ["in person"],
"source_pages": ["p5", "p38"],
"source_quotes": ["Whether remotely or in person", "including in-person, telephone, video and online consultations"],
"confidence": 0.9,
"inferred": false,
"inference_reason": null
},
{
"id": "CX-06",
"name": "Remote consultations (telephone, video, online)",
"type": "encounter_mode",
"aliases": ["remotely", "telephone", "video", "online"],
"source_pages": ["p5", "p38"],
"source_quotes": ["Whether remotely or in person", "including in-person, telephone, video and online consultations"],
"confidence": 0.9,
"inferred": false,
"inference_reason": null
},
{
"id": "CX-07",
"name": "Non-primary care environments",
"type": "setting",
"aliases": ["hospital rotations", "specialist departments"],
"source_pages": ["p20"],
"source_quotes": ["Non-primary care environments provide experience of cases encountered as a GP"],
"confidence": 0.85,
"inferred": false,
"inference_reason": null
},
{
"id": "CX-08",
"name": "Urgent, unscheduled and emergency care",
"type": "urgency",
"aliases": ["urgent care", "unscheduled requests", "emergencies"],
"source_pages": ["p56", "p58"],
"source_quotes": ["urgent, unscheduled and emergency care", "Responding to unscheduled requests for urgent care is a core part of a GP’s role"],
"confidence": 0.9,
"inferred": false,
"inference_reason": null
},
{
"id": "CX-09",
"name": "Interfaces and transitions between services/organisations",
"type": "system_context",
"aliases": ["interfaces between different healthcare professionals, services and organisations"],
"source_pages": ["p68"],
"source_quotes": ["transitions in care... interfaces between different healthcare professionals, services and organisations"],
"confidence": 0.85,
"inferred": false,
"inference_reason": null
},
{
"id": "CX-10",
"name": "Care pathways navigation across healthcare systems",
"type": "care_pathway",
"aliases": ["navigate along and between care pathways"],
"source_pages": ["p64"],
"source_quotes": ["support patients in navigating along and between care pathways"],
"confidence": 0.85,
"inferred": false,
"inference_reason": null
}
],
"patient_groups": [
{
"id": "PG-01",
"name": "Infants, children and young people",
"aliases": ["Children and young people"],
"source_pages": ["p13", "p56"],
"source_quotes": ["Infants, children and young people", "infants, children and young people"],
"confidence": 0.9,
"inferred": false,
"inference_reason": null
},
{
"id": "PG-02",
"name": "Pregnant women, perinatal women and new parents",
"aliases": ["Maternal health"],
"source_pages": ["p13", "p56"],
"source_quotes": ["Maternal health", "pregnant women, perinatal women and new parents"],
"confidence": 0.88,
"inferred": false,
"inference_reason": null
},
{
"id": "PG-03",
"name": "People with mental health problems",
"aliases": ["People with mental health needs"],
"source_pages": ["p14", "p56"],
"source_quotes": ["People with mental health needs", "people with mental health problems"],
"confidence": 0.9,
"inferred": false,
"inference_reason": null
},
{
"id": "PG-04",
"name": "People with long-term conditions and disabilities",
"aliases": ["People living with long-term conditions including cancer"],
"source_pages": ["p14", "p12"],
"source_quotes": ["People with long-term conditions and disabilities", "People living with long-term conditions including cancer"],
"confidence": 0.85,
"inferred": false,
"inference_reason": null
},
{
"id": "PG-05",
"name": "Older adults and those with multimorbidity",
"aliases": ["Frail and elderly people (including patients with multimorbidity and those who are dying)", "Older adults"],
"source_pages": ["p14", "p12", "p56"],
"source_quotes": ["Frail and elderly people (including patients with multimorbidity and those who are dying)", "older adults and those with multimorbidity"],
"confidence": 0.9,
"inferred": false,
"inference_reason": null
},
{
"id": "PG-06",
"name": "People nearing the end of life",
"aliases": ["People at the end of life", "people who are dying"],
"source_pages": ["p12", "p56", "p14"],
"source_quotes": ["People at the end of life", "people nearing the end of life"],
"confidence": 0.88,
"inferred": false,
"inference_reason": null
},
{
"id": "PG-07",
"name": "People with learning, physical or sensory disabilities",
"aliases": ["Learning disability", "learning disabilities"],
"source_pages": ["p56", "p6", "p12"],
"source_quotes": ["people with learning, physical or sensory disabilities", "learning disabilities"],
"confidence": 0.86,
"inferred": false,
"inference_reason": null
},
{
"id": "PG-08",
"name": "People with addictions",
"aliases": ["addiction services"],
"source_pages": ["p56", "p14"],
"source_quotes": ["people with addictions", "addiction services"],
"confidence": 0.84,
"inferred": false,
"inference_reason": null
},
{
"id": "PG-09",
"name": "LGBTQ+ people",
"aliases": ["gay, lesbian, bisexual and transgender (LGBTQ+) people"],
"source_pages": ["p56"],
"source_quotes": ["gay, lesbian, bisexual and transgender (LGBTQ+) people"],
"confidence": 0.83,
"inferred": false,
"inference_reason": null
},
{
"id": "PG-10",
"name": "Migrants, refugees and asylum seekers",
"aliases": ["refugees, asylum seekers and undocumented migrants"],
"source_pages": ["p56", "p14"],
"source_quotes": ["migrants, refugees and asylum seekers", "refugees, asylum seekers and undocumented migrants"],
"confidence": 0.84,
"inferred": false,
"inference_reason": null
},
{
"id": "PG-11",
"name": "People who may have health disadvantages and vulnerabilities",
"aliases": ["vulnerable adults"],
"source_pages": ["p14", "p78"],
"source_quotes": ["People who may have health disadvantages and vulnerabilities", "vulnerable adults"],
"confidence": 0.84,
"inferred": false,
"inference_reason": null
}
],
"procedures": [
{
"id": "PR-01",
"name": "Joint injections",
"aliases": [],
"source_pages": ["p50"],
"source_quotes": ["such as joint injections, minor surgery and fitting contraceptive devices"],
"confidence": 0.85
},
{
"id": "PR-02",
"name": "Minor surgery",
"aliases": [],
"source_pages": ["p6", "p50"],
"source_quotes": ["childhood immunisations and minor surgery", "such as joint injections, minor surgery and fitting contraceptive devices"],
"confidence": 0.85
},
{
"id": "PR-03",
"name": "Fitting contraceptive devices",
"aliases": [],
"source_pages": ["p50"],
"source_quotes": ["fitting contraceptive devices"],
"confidence": 0.85
},
{
"id": "PR-04",
"name": "Mental capacity assessment",
"aliases": ["test mental capacity for specific decisions"],
"source_pages": ["p40"],
"source_quotes": ["test mental capacity for specific decisions, in accordance with the relevant legislation"],
"confidence": 0.82
},
{
"id": "PR-05",
"name": "Basic life support",
"aliases": [],
"source_pages": ["p23", "p58"],
"source_quotes": ["mandatory requirements such as child safeguarding and basic life support", "Develop and maintain skills in basic life support"],
"confidence": 0.84
},
{
"id": "PR-06",
"name": "Use of an automated defibrillator",
"aliases": ["automated defibrillator use"],
"source_pages": ["p58"],
"source_quotes": ["the use of an automated defibrillator"],
"confidence": 0.84
}
],
"evidence_signals": [
{
"id": "ES-01",
"name": "Workplace-based Assessment (WPBA)",
"description": "observable signal of capability demonstration",
"source_pages": ["p22", "p23"],
"source_quotes": ["Workplace-based Assessment (WPBA) evaluates the GP registrar's progress", "Evidence of WPBA... includes... documentation of naturally occurring evidence"],
"confidence": 0.9
},
{
"id": "ES-02",
"name": "Applied Knowledge Test (AKT)",
"description": "observable signal of capability demonstration",
"source_pages": ["p22"],
"source_quotes": ["The Applied Knowledge Test (AKT)... tests the knowledge base behind independent general practice"],
"confidence": 0.88
},
{
"id": "ES-03",
"name": "Simulated Consultation Assessment (SCA)",
"description": "observable signal of capability demonstration",
"source_pages": ["p22", "p23"],
"source_quotes": ["Simulated Consultation Assessment (SCA) will assess a candidate’s ability to integrate and apply clinical, professional and communication skills"],
"confidence": 0.88
},
{
"id": "ES-04",
"name": "CEPS (Clinical Examination and Procedural Skills) assessment evidence",
"description": "observable signal of capability demonstration",
"source_pages": ["p50"],
"source_quotes": ["MRCGP: SCA; WPBA: CEPS, COTs, MiniCEX, QIP, CSR"],
"confidence": 0.8
},
{
"id": "ES-05",
"name": "CATs / CbD (Case-based / consultation assessment tools)",
"description": "observable signal of capability demonstration",
"source_pages": ["p23", "p95"],
"source_quotes": ["MRCGP: WPBA: CATs, COTs, MiniCEX", "CAT/CbD COT MiniCEX"],
"confidence": 0.75
},
{
"id": "ES-06",
"name": "MSF (Multi-source feedback) / Leadership MSF",
"description": "observable signal of capability demonstration",
"source_pages": ["p21", "p95"],
"source_quotes": ["patient and colleague feedback", "MSF/LMSF"],
"confidence": 0.75
},
{
"id": "ES-07",
"name": "PSQ (Patient Satisfaction Questionnaire)",
"description": "observable signal of capability demonstration",
"source_pages": ["p95"],
"source_quotes": ["PSQ"],
"confidence": 0.7
},
{
"id": "ES-08",
"name": "CSR (Clinical Supervisor’s Review)",
"description": "observable signal of capability demonstration",
"source_pages": ["p21", "p95"],
"source_quotes": ["clinical supervisor’s review", "CSR"],
"confidence": 0.75
},
{
"id": "ES-09",
"name": "QIP/QIA/LA (Quality improvement activity/learning audit)",
"description": "observable signal of capability demonstration",
"source_pages": ["p95"],
"source_quotes": ["QIP/QIA/LA"],
"confidence": 0.7
},
{
"id": "ES-10",
"name": "Prescribing evidence (WPBA)",
"description": "observable signal of capability demonstration",
"source_pages": ["p54", "p95"],
"source_quotes": ["WPBA: ... Prescribing", "Prescribing"],
"confidence": 0.7
}
],
"quality_levels": [
{
"id": "QL1",
"name": "Descriptive recall/awareness",
"definition": "Demonstrates recall or basic understanding of curriculum concepts; can describe expectations and recognise key issues.",
"curriculum_mapping": "Mapped (inferred) to Table 3 levels 'Recall or respond' and 'Comprehend'. Source: p27."
},
{
"id": "QL2",
"name": "Applied reasoning in case context",
"definition": "Applies rules/principles and demonstrates capability within defined clinical contexts (e.g., consultation/case), showing appropriate action selection.",
"curriculum_mapping": "Mapped (inferred) to Table 3 level 'Apply'. Source: p27."
},
{
"id": "QL3",
"name": "Independent practice with reflection and adaptation",
"definition": "Performs safely with appropriate autonomy, reflects on outcomes, adapts management and integrates feedback/learning into practice.",
"curriculum_mapping": "Mapped (inferred) to progression descriptor column 'Competent for licensing (required by CCT)' and Table 3 'Evaluate' emphasis on justification/reflect. Sources: p31, p27."
},
{
"id": "QL4",
"name": "Integrated practice across complexity/systems with leadership/teaching contribution",
"definition": "Integrates capabilities across complex systems, coordinates teams/services, contributes to improvement/leadership/teaching and broader population/planetary considerations.",
"curriculum_mapping": "Mapped (inferred) to progression descriptor hooking of 'Excellent' descriptors and Table 3 'Integrate' verbs (lead, manage, develop). Sources: p31, p27."
}
],
"relationships": [
{
"type": "HAS_CAPABILITY",
"from_id": "D-01",
"to_id": "C-01",
"source_pages": ["p10"],
"source_quotes": ["A. Knowing yourself and relating to others ... Fitness to practise"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-01",
"to_id": "C-02",
"source_pages": ["p10"],
"source_quotes": ["A. Knowing yourself and relating to others ... An ethical approach"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-01",
"to_id": "C-03",
"source_pages": ["p10"],
"source_quotes": ["A. Knowing yourself and relating to others ... Communicating and consulting"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-02",
"to_id": "C-04",
"source_pages": ["p10"],
"source_quotes": ["B. Applying clinical knowledge and skill ... Data gathering and interpretation"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-02",
"to_id": "C-05",
"source_pages": ["p10"],
"source_quotes": ["B. Applying clinical knowledge and skill ... Clinical examination and procedural skills"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-02",
"to_id": "C-06",
"source_pages": ["p10"],
"source_quotes": ["B. Applying clinical knowledge and skill ... Decision-making and diagnosis"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-02",
"to_id": "C-07",
"source_pages": ["p10"],
"source_quotes": ["B. Applying clinical knowledge and skill ... Clinical management"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-03",
"to_id": "C-08",
"source_pages": ["p11"],
"source_quotes": ["C. Managing complex and long-term care ... Medical complexity"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-03",
"to_id": "C-09",
"source_pages": ["p11"],
"source_quotes": ["C. Managing complex and long-term care ... Team working"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-04",
"to_id": "C-10",
"source_pages": ["p11"],
"source_quotes": ["D. Working well in organisations and systems of care ... Performance, learning and teaching"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-04",
"to_id": "C-11",
"source_pages": ["p11"],
"source_quotes": ["D. Working well in organisations and systems of care ... Organisation, management and leadership"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-05",
"to_id": "C-12",
"source_pages": ["p11"],
"source_quotes": ["E. Caring for the whole person... Holistic practice, health promotion and safeguarding"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},
{
"type": "HAS_CAPABILITY",
"from_id": "D-05",
"to_id": "C-13",
"source_pages": ["p11"],
"source_quotes": ["E. Caring for the whole person... Community health and environmental sustainability"],
"confidence": 0.95,
"inferred": false,
"inference_reason": null
},

    {
      "type": "APPLIES_IN_CONTEXT",
      "from_id": "C-03",
      "to_id": "CX-05",
      "source_pages": ["p38"],
      "source_quotes": ["including in-person, telephone, video and online consultations"],
      "confidence": 0.9,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "APPLIES_IN_CONTEXT",
      "from_id": "C-03",
      "to_id": "CX-06",
      "source_pages": ["p38"],
      "source_quotes": ["including in-person, telephone, video and online consultations"],
      "confidence": 0.9,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "APPLIES_IN_CONTEXT",
      "from_id": "C-05",
      "to_id": "CX-02",
      "source_pages": ["p48"],
      "source_quotes": ["within a general practice or home setting"],
      "confidence": 0.88,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "APPLIES_IN_CONTEXT",
      "from_id": "C-05",
      "to_id": "CX-03",
      "source_pages": ["p48"],
      "source_quotes": ["during home visits, in emergencies"],
      "confidence": 0.85,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "APPLIES_IN_CONTEXT",
      "from_id": "C-07",
      "to_id": "CX-08",
      "source_pages": ["p56", "p58"],
      "source_quotes": ["urgent, unscheduled and emergency care"],
      "confidence": 0.88,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "APPLIES_IN_CONTEXT",
      "from_id": "C-08",
      "to_id": "CX-10",
      "source_pages": ["p64"],
      "source_quotes": ["navigating along and between care pathways"],
      "confidence": 0.85,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "APPLIES_IN_CONTEXT",
      "from_id": "C-09",
      "to_id": "CX-09",
      "source_pages": ["p68"],
      "source_quotes": ["interfaces between different healthcare professionals, services and organisations"],
      "confidence": 0.85,
      "inferred": false,
      "inference_reason": null
    },

    {
      "type": "RELEVANT_TO_PATIENT_GROUP",
      "from_id": "C-07",
      "to_id": "PG-01",
      "source_pages": ["p56"],
      "source_quotes": ["Such groups include: infants, children and young people"],
      "confidence": 0.9,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "RELEVANT_TO_PATIENT_GROUP",
      "from_id": "C-07",
      "to_id": "PG-03",
      "source_pages": ["p56"],
      "source_quotes": ["Such groups include: people with mental health problems"],
      "confidence": 0.88,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "RELEVANT_TO_PATIENT_GROUP",
      "from_id": "C-07",
      "to_id": "PG-05",
      "source_pages": ["p56"],
      "source_quotes": ["Such groups include: older adults and those with multimorbidity"],
      "confidence": 0.88,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "RELEVANT_TO_PATIENT_GROUP",
      "from_id": "C-12",
      "to_id": "PG-11",
      "source_pages": ["p85"],
      "source_quotes": ["GPs play a crucial role in safeguarding their patients, especially the most vulnerable"],
      "confidence": 0.82,
      "inferred": false,
      "inference_reason": null
    },

    {
      "type": "INCLUDES_PROCEDURE",
      "from_id": "C-05",
      "to_id": "PR-01",
      "source_pages": ["p50"],
      "source_quotes": ["such as joint injections, minor surgery and fitting contraceptive devices"],
      "confidence": 0.85,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "INCLUDES_PROCEDURE",
      "from_id": "C-05",
      "to_id": "PR-02",
      "source_pages": ["p50"],
      "source_quotes": ["such as joint injections, minor surgery and fitting contraceptive devices"],
      "confidence": 0.85,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "INCLUDES_PROCEDURE",
      "from_id": "C-05",
      "to_id": "PR-03",
      "source_pages": ["p50"],
      "source_quotes": ["fitting contraceptive devices"],
      "confidence": 0.85,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "INCLUDES_PROCEDURE",
      "from_id": "C-03",
      "to_id": "PR-04",
      "source_pages": ["p40"],
      "source_quotes": ["test mental capacity for specific decisions"],
      "confidence": 0.8,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "INCLUDES_PROCEDURE",
      "from_id": "C-07",
      "to_id": "PR-05",
      "source_pages": ["p58"],
      "source_quotes": ["Develop and maintain skills in basic life support"],
      "confidence": 0.84,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "INCLUDES_PROCEDURE",
      "from_id": "C-07",
      "to_id": "PR-06",
      "source_pages": ["p58"],
      "source_quotes": ["the use of an automated defibrillator"],
      "confidence": 0.84,
      "inferred": false,
      "inference_reason": null
    },

    {
      "type": "EVIDENCED_BY",
      "from_id": "C-04",
      "to_id": "ES-01",
      "source_pages": ["p46"],
      "source_quotes": ["MRCGP: AKT; SCA; WPBA: CATs, COTs, MiniCEX, QIP, CSR"],
      "confidence": 0.75,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "EVIDENCED_BY",
      "from_id": "C-06",
      "to_id": "ES-02",
      "source_pages": ["p54"],
      "source_quotes": ["MRCGP: AKT; SCA; WPBA: CATs, COTs, MiniCEX"],
      "confidence": 0.72,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "EVIDENCED_BY",
      "from_id": "C-03",
      "to_id": "ES-03",
      "source_pages": ["p41"],
      "source_quotes": ["MRCGP: SCA; WPBA: CATs, COTs, MiniCEX"],
      "confidence": 0.72,
      "inferred": false,
      "inference_reason": null
    },
    {
      "type": "EVIDENCED_BY",
      "from_id": "C-05",
      "to_id": "ES-04",
      "source_pages": ["p50"],
      "source_quotes": ["WPBA: CEPS"],
      "confidence": 0.75,
      "inferred": false,
      "inference_reason": null
    },

    {
      "type": "PROGRESSES_TO_LEVEL",
      "from_id": "C-01",
      "to_id": "QL3",
      "source_pages": ["p31", "p27"],
      "source_quotes": ["Competent for licensing (required by CCT)", "Evaluate... justify decisions or a course of action"],
      "confidence": 0.6,
      "inferred": true,
      "inference_reason": "QL3 is defined as independent practice with reflection/adaptation; curriculum shows 'Competent for licensing (required by CCT)' and 'Evaluate' includes 'reflect on' which aligns conceptually."
    },
    {
      "type": "PROGRESSES_TO_LEVEL",
      "from_id": "C-10",
      "to_id": "QL4",
      "source_pages": ["p27", "p74"],
      "source_quotes": ["Integrate... lead, manage, develop", "Moves beyond the use of existing evidence toward initiating... research"],
      "confidence": 0.6,
      "inferred": true,
      "inference_reason": "QL4 includes integrated practice with leadership/teaching; curriculum 'Integrate' verbs and 'Excellent' descriptor for this capability indicates higher-level integration and contribution."
    }

],
"coverage_report": {
"total_domains": 5,
"total_capabilities": 13,
"total_contexts": 10,
"total_patient_groups": 11,
"total_procedures": 6,
"total_relationships": 29,
"gaps_or_ambiguities": [
{
"item": "curriculum_version",
"reason": "Document states 'For implementation from 1 August 2025' but does not explicitly label a version number in the extracted text.",
"recommended_human_review": true
},
{
"item": "Full procedure taxonomy for CEPS",
"reason": "Document references 'five mandatory examinations' and 'a range of additional ... skills' but does not list them in the extracted pages; only examples like joint injections/minor surgery/contraceptive devices are explicit.",
"recommended_human_review": true
},
{
"item": "Quality level mapping",
"reason": "QL1-QL4 are meta-analytic anchors; mapping to Table 3 and progression descriptors is inferred rather than explicitly defined as four levels in the curriculum.",
"recommended_human_review": true
}
]
}
}
