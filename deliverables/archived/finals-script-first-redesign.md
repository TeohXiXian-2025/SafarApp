# Safar finals pitch | 10 minutes

**Team Ds Gang:** Chong Pohyi, Teoh Xi Xian, Tan Wei Feng  
**Format:** 7 minutes of slides, 2 minutes 35 seconds of live demo, 25-second close.  
**Delivery:** Use a calm pace of about 125–135 spoken words per minute. Keep the live demo tab open before presenting. The deck is at `deliverables/finals-pitch.html`; press the right arrow to advance and **N** to toggle presenter cues.

## Run of show

| Time | Slide | Purpose | Suggested speaker |
| --- | --- | --- | --- |
| 0:00–0:25 | 1 · Safar | Product promise | Chong Pohyi |
| 0:25–1:10 | 2 · Four friends | Concrete traveller story | Chong Pohyi |
| 1:10–1:50 | 3 · Context | Audience and launch group | Chong Pohyi |
| 1:50–2:30 | 4 · Planning gap | Manual handoffs | Chong Pohyi |
| 2:30–3:10 | 5 · Pivot | Why the design changed | Teoh Xi Xian |
| 3:10–3:50 | 6 · Product journey | Shared workflow | Teoh Xi Xian |
| 3:50–4:35 | 7 · People | Preferences and booking anchors | Teoh Xi Xian |
| 4:35–5:20 | 8 · Food and choice | Evidence and conflict handling | Teoh Xi Xian |
| 5:20–6:00 | 9 · Prayer | Day planning | Tan Wei Feng |
| 6:00–6:40 | 10 · Built product | Technical context and boundaries | Tan Wei Feng |
| 6:40–7:00 | 11 · Handoff | Open demo | Tan Wei Feng |
| 7:00–9:35 | 12 · Live demo | One decision through the plan | Tan Wei Feng |
| 9:35–10:00 | 13 · Close | Value and next validation | Tan Wei Feng |

Speaker assignments are optional. If one person presents, keep the same timing and transitions.

## Spoken script

### Slide 1 | 0:00–0:25 | Safar

> Good day, judges. We are Team Ds Gang. This is Safar, a shared travel planner for Muslim travellers and mixed groups. It helps a group build one trip when food, prayer and activity needs differ. I’ll start with the moment our product is designed to solve, then show you the working app.

**Cue:** Leave the cover up for the first sentence. Point to the live trip preview only when saying “working app.”

### Slide 2 | 0:25–1:10 | Four friends in Kyoto

> Imagine four friends in Tokyo. They have a train to catch, a few hours to explore, and a restaurant picked for lunch. At the door, one friend realises the ramen broth may contain pork. Another checks the time and sees the prayer window approaching. The others are ready to eat. The group now has to find a suitable meal, a place to pray and a way to meet again, while keeping the train booking intact. The itinerary looked complete, but the difficult decision had been pushed onto the travellers.

**Cue:** Tell it as a story. Pause after “at the door.” The photo is an illustration of the scenario, not evidence of a user test.

### Slide 3 | 1:10–1:50 | Audience and context

> This is a meaningful audience. The Mastercard–CrescentRating Global Muslim Travel Index reports 196 million international Muslim arrivals in 2025. We are not claiming that entire market for Safar. Our first group to test is much more specific: Malaysian friends and student groups planning travel abroad, including trips where members have different faith or dietary needs. For them, the job is concrete: agree on a day that respects each traveller’s requirements without rebuilding the plan every time a choice changes.

**Cue:** Say “arrivals,” not “people” or “customers.” The figure is market context, not Safar traction. Source: [GMTI 2026](https://crescentrating.com/insights/gmti).

### Slide 4 | 1:50–2:30 | The planning gap

> Today the group may find ideas on social media and maps, check halal details in another source, discuss the options in WhatsApp, then edit the itinerary somewhere else. Each tool helps with one piece. The handoffs are where the work accumulates. A good restaurant search does not remember a prayer window. A group vote does not know which food rule is strict. After a disagreement, somebody still has to repair travel times, meals and booked stops by hand.

**Cue:** Trace the four stages from left to right. Avoid claiming that all competing products lack these features; this is the workflow Safar addresses.

### Slide 5 | 2:30–3:10 | Why we changed direction

> Our first concept focused on a Muslim-only planner. Mentor feedback exposed the gap in that approach: many real trips are mixed groups, and the people outside the Muslim path still share the same schedule. We also considered simple voting. But a majority vote cannot settle a strict food requirement or a prayer time. So we changed the design. Each traveller’s needs appear before the group commits to a place. When an idea conflicts with a need, Safar can propose a middle ground or a temporary split, and the trip lead reviews the choice.

**Cue:** This is the project’s design history, drawn from the September 2026 mentor notes in the README. Do not imply that the app automatically forces a split.

### Slide 6 | 3:10–3:50 | The product journey

> Safar follows the group’s actual planning order. A trip lead creates a trip and invites members. Each person records food, prayer, pace and budget needs. Existing flights, trains and hotels become fixed points in the calendar. Members suggest places and vote. If an idea clashes with a requirement, the group sees the reason and reviews an alternative. Finally, Auto-plan previews a day around accepted places, travel time, meals and prayer windows. The trip lead applies the plan after reviewing it.

**Cue:** Move across the four stages. This is the spine of the live demo.

### Slide 7 | 3:50–4:35 | Start with the people

> Here is the current group preferences screen. The Japan demo has four sample travellers, so we can show different needs in one trip. A traveller may ask for strict halal food and prayer time; another may care most about local food or a slower pace. Those differences enter the plan before suggestions are ranked. We also add fixed bookings early. A flight or hotel check-in is a time anchor, not an optional place to rearrange later. This gives the planner enough context to make a useful proposal and gives people a chance to correct their own inputs.

**Cue:** The four travellers are sample data. Point to the preferences screenshot, then mention bookings verbally.

### Slide 8 | 4:35–5:20 | Show the evidence, then decide

> Food search is a good example of how Safar handles uncertainty. A place can have a listed halal label, a weaker indication, a pork-free claim or no useful evidence. Safar shows the source and the uncertainty so the traveller can decide what to verify with the venue. In the demo, the group considers Ichiran. A vote alone cannot make the food suitable for everyone. Safar surfaces the conflict and offers a nearby alternative or a short split with a regroup point. The trip lead reviews the option before it changes the shared plan.

**Cue:** Do not call a “likely” or “pork-free” result certified halal. The app does not certify restaurants.

### Slide 9 | 5:20–6:00 | Prayer inside the day plan

> Prayer is handled as part of the day, rather than a reminder floating beside it. Safar calculates local prayer times using the destination and an appropriate method. The timeline shows the window alongside booked stops, meals and travel. When available, the group can inspect nearby prayer facilities and use parallel free time for other members. Auto-plan is still a preview. The traveller checks the timing against their preferred authority, and the trip lead chooses whether to apply the proposed schedule.

**Cue:** Show the prayer screen first, then the plan screenshot. “Local calculation” is more accurate than “live prayer API.”

### Slide 10 | 6:00–6:40 | What is working today

> This is a deployed product, not a static prototype. React runs the trip workspace; Firebase authentication and Firestore support shared trip updates. Our planning rules combine booking anchors, travel buffers, meals and prayer windows. AI helps with tasks such as extracting candidate places from supported links or reading uploaded booking details. We keep those results reviewable. Food labels can be uncertain, extracted fields can be wrong, and a flight or weather alert produces a proposed resync rather than changing the trip without approval. These boundaries matter because travellers make real decisions from the output.

**Cue:** Keep the architecture description short. The slide shows the product layers, not a benchmark or availability guarantee.

### Slide 11 | 6:40–7:00 | Demo handoff

> Let’s follow one decision in the guest Japan trip. I’ll show the members’ needs, compare food evidence, open a group conflict, then preview the day plan. Watch how the reason for each change remains visible to the group.

**Cue:** Switch to the already-open [guest demo](https://safar-app-cristal-teohs-projects.vercel.app/demo). If the live service stalls, return to slide 12 and use the four screenshots as the walkthrough.

### Slide 12 | 7:00–9:35 | Live demo

**7:00–7:35 · People and bookings**

> This is the guest trip. These four sample members have different food, prayer, pace and budget needs. Their flight, train and hotel bookings are already fixed in the trip.

Open **People**, then briefly show **Bookings**. Avoid changing sample preferences unless rehearsed.

**7:35–8:15 · Food evidence**

> Near Kyoto Station, the food results show different levels of evidence. We can inspect what supports a label and keep uncertain options for confirmation instead of silently treating every result as verified.

Open **Food**. Compare one stronger result and one uncertain result. Continue even if an external place provider is slow.

**8:15–8:55 · Group decision**

> Now the group considers Ichiran. The warning explains why this idea conflicts with a member’s food requirement. The group can review a nearby alternative, or consider a short split and a place to meet again. A person chooses which proposal to accept.

Open **Ideas**, the Ichiran vote and the decision options. Keep this to one conflict.

**8:55–9:25 · Preview the plan**

> In Plan, Auto-plan previews the day with bookings, travel time, meals and prayer windows together. We can inspect the result before applying it to the shared trip.

Open **Plan** and preview Auto-plan. Apply only if the demo state and timing are ready. If not, the preview itself proves the review step.

**9:25–9:35 · Return to deck**

> This is the full loop: individual needs become a group decision, then a day plan the group can review.

Return to slide 13.

### Slide 13 | 9:35–10:00 | Close

> Safar makes the requirements visible before a group commits to a plan. It brings food evidence, prayer time and group decisions into one shared trip. Next, we want to test real mixed-group journeys and measure whether it reduces planning rework and missed constraints. Thank you. We are Team Ds Gang, and we welcome your questions.

## Before going on stage

- Open the deck and the guest demo in separate tabs. Confirm the guest trip starts.
- Rehearse the live path once on the venue connection. Keep slide 12 ready as the visual fallback.
- Use arrow keys to move through the deck. Press **N** to show or hide short presenter cues. Browser full screen is recommended.
- Stop the demo at 9:35 even if a step is incomplete. The close is part of the 10 minutes.

## Likely Q&A

**How do you verify halal claims?** Safar displays the source and strength of the available evidence. Travellers confirm strict dietary requirements with the venue. The app is not a certification body.

**Does AI decide for the group?** No. Members vote, and the trip lead reviews a middle ground or split before applying it.

**How accurate are prayer times?** Safar calculates them locally from the place, date and method. Travellers can check against their preferred local authority.

**What is your business model?** Paid group planning, agency integrations and dining referrals are hypotheses. We have not validated paid demand or partner revenue yet.

**What would you test next?** Observe real mixed-group trips and measure planning rework, conflicts resolved and missed constraints. Those are proposed measures, not existing traction.

## Source notes

- Product behavior and limits: project `README.md`, current source and guest demo screens.
- Project pivot: mentor consultation notes in project `README.md`, September 2026.
- Market context: [Mastercard–CrescentRating Global Muslim Travel Index 2026](https://crescentrating.com/insights/gmti), reporting 196 million international Muslim arrivals in 2025.
- Sample Japan trip, Ichiran conflict and screenshots: current Safar guest demo and `deliverables/assets/`.

