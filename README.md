# 🌍 Safar App
> *By Ds gang (Chong Pohyi, Teoh Xi Xian, Tan Wei Feng)*  
> **Problem Statement:** Travel Planner | 🎥 **[Video Presentation]** | 📊 **[Presentation Slides]**

---

## 📑 Table of Contents
* [1. Project Overview](#1-project-overview)
  * [The Problem](#the-problem)
  * [Current Market Solution](#current-market-solution)
  * [Our Solution](#our-solution)
  * [Extra Features](#extra-features)
* [2. Ideation & Process](#2-ideation--process)
  * [2.1 Ideas We Considered](#21-ideas-we-considered)
  * [2.2 Ideation Boards](#22-ideation-boards)
  * [2.3 Mentor Consultation](#23-mentor-consultation)
* [3. Design & Prototype](#3-design--prototype)
* [4. Competitive Edge (What Makes It Different)](#4-competitive-edge-what-makes-it-different)
* [5. Technical Architecture & Feasibility](#5-technical-architecture--feasibility)

---

<a id="1-project-overview"></a>
## 1. Project Overview

<a id="the-problem"></a>
### 🚨 The Problem
Planning a trip as a Muslim traveler is exhausting because you have to **juggle separate apps** for itineraries, Halal food, and prayer times. This headache worsens in mixed groups because standard travel apps are completely inflexible, forcing constant **compromises**. 
* Either Muslims must sacrifice their strict needs for Halal food and daily prayers (Waktu Solat) to keep up
* Or non-Muslims must skip local food experiences and sit idly during prayer breaks.  

<p align="left">Because current tools cannot balance these conflicting needs, someone in the group is always forced to sacrifice their ideal travel experience.</p>

<a id="current-market-solution"></a>
### 📉 Current Market Solution

| Tool | What They Do | Why They Fall Short |
| :--- | :--- | :--- |
| 🗺️ **Wanderlog** | Collaborative group itinerary planner. | Culturally blind. It ignores daily prayer schedules and Halal food verification. It also provides no tools to help groups find a middle ground when preferences clash. |
| 🕌 **HalalTrip** | Directory for Halal food and prayer times. | It is a static database, not a group planner. It cannot automatically sync prayer times into a shared schedule or suggest compromises for non-Muslim members. |
| 📱 **Excel & WhatsApp** | Manual schedule tracking and group chats. | Zero automation. Groups must manually argue over schedules and search for food or prayer spots instead of having an app resolve conflicts fairly. |

<a id="our-solution"></a>
### ✨ Our Solution

| Root cause | Explanation | Our Solution |
| :--- | :--- | :--- |
| ⏱️ **Schedule Blind Spots** | Standard travel apps ignore daily prayer times (Waktu Solat), leaving Muslim travelers scrambling to find a mosque while the rest of the group waits with nothing to do. | **Dynamic Prayer-Anchored Timeline:** The app uses the destination's GPS to calculate local prayer times automatically. It inserts a "Prayer Block" into the group schedule, mapping the nearest wudu-friendly facility within walking distance. At the exact same time, it schedules a nearby cafe break or quick activity for non-Muslim members, so the trip never stalls. |
| 🍽️ **Fragmented Food Search** | Finding safe Halal food overseas forces travelers to manually switch between map apps, social media, and static directories just to verify ingredients.  | **Live Geo-Fenced Halal Radar:** When it is time to eat, the app drops a recommendation based on the group's exact location on the map. It filters nearby restaurants using a clear 3-tier label (Certified Halal, Muslim-Owned, or Pork-Free), displaying walking distances, live wait times, and verified menus all on one single screen. |
| 🧑‍🧑‍🧒‍🧒 **Inflexible Group Decisions** |  Standard apps use a simple "majority rules" vote. When group preferences clash, someone is always forced to sacrifice their strict dietary rules or personal travel goals.  | **AI Compromise & Auto-Split Engine:** If a group vote creates a conflict, the AI immediately steps in. It will either suggest a middle-ground venue (such as a food district with both Halal and non-Halal stalls side-by-side) or it will automatically split the itinerary into two separate paths for a few hours, placing a synchronized pin on the map for everyone to smoothly regroup later. |

<a id="extra-features"></a>
### 🚀 Extra Features

| Feature | What it is | What it actually solve |
| :--- | :--- | :--- |
| 📱 **Social-to-Itinerary Engine** | Users can paste a link from an Instagram Reel, TikTok, or Xiaohongshu directly into the app. The AI scans the video, extracts the locations, and instantly generates a draft itinerary block on the shared canvas. | Travelers spend hours manually cross-referencing viral social media videos with map apps which is troublesome. This feature turns a quick social link into a routed itinerary, while instantly running the extracted location through the app's Halal Radar to verify if the trending spot is actually Muslim-friendly. |
| 🔒 **AI Document Cross-Check Vault** | A secure group vault where users upload passports, visas, and flight tickets. The AI evaluates document metadata to prevent check-in rejections. By extracting flight numbers and PNRs, the Vault acts as the live data feed for the Emergency Engine. | In group travel, one person's expired passport or incorrect visa can ruin the trip. It catches bureaucratic errors weeks in advance and provides the exact legal constraints the AI needs to ensure emergency reroutes are legally viable for all members. |
| 🆘 **Emergency Fallback Engine** | Because the Vault monitors the uploaded flight tickets, the AI detects cancellations instantly. It triggers a "self-healing" protocol that auto-resyncs the timeline and ensures new transit routes comply with the Vault's visa data. | When an emergency ruins a schedule, the AI auto-resyncs the timeline safely. Simultaneously, it drops new verified Halal dining and prayer facility pins tailored to the new delay route, ensuring Muslim travelers are never stranded without safe options during an emergency. |

---

<a id="2-ideation--process"></a>
## 💡 2. Ideation & Process

<a id="21-ideas-we-considered"></a>
### 🧭 2.1 Ideas We Considered

| Idea & Description | Why it was dropped / kept |
| :--- | :--- |
| 🌟 **Muslim Travel OS with Mixed-Group AI Engine (Chosen)**<br><br>*An itinerary planner anchored by local prayer times and Halal food radars, featuring an AI engine that actively resolves group conflicts.* | **Kept:**<br>• **Market Fit:** Fills a massive "last mile" gap standard apps ignore by providing dynamic prayer anchoring and live Halal geofencing.<br>• **Scalability:** By shifting to handle mixed-group edge cases, we drastically expanded our target audience to include diverse university and corporate travel groups.<br>• **UX Innovation:** Replaces binary voting with an AI Auto-Split and Compromise Engine, resolving conflicting dietary and cultural preferences without forcing anyone to sacrifice their travel goals. |
| 🕌 **Strictly Muslim / DIY Umrah Planner**<br><br>*A travel planner built exclusively for Muslim-only groups, focusing entirely on Halal routing and religious obligations.* | **Dropped:**<br>• **Scope Limitation:** This was our initial concept, but mentor feedback revealed it was too narrow.<br>• **Real-World Friction:** It ignored the reality of modern, cross-cultural travel dynamics. By focusing exclusively on Muslims, the app completely failed to solve the friction of mixed groups trying to balance their differing needs on a shared itinerary. |
| 👥 **General Family/Group Planner based on shared preferences**<br><br>*An app where group members input general travel preferences and the app builds an itinerary based on a majority vote.* | **Dropped:**<br>• **Market Saturation:** Existing giants like Wanderlog already execute collaborative preference planning flawlessly.<br>• **Failure on Core Needs:** These platforms treat religious obligations (strict prayer times, dietary laws) as optional "preferences."<br>• **Ineffective Resolution:** Relying on basic "majority rules" voting to handle strict requirements just triggers the same arguments found in manual WhatsApp planning. |
| ✈️ **All-in-one Flight, Train, and Hotel AI Builder**<br><br>*A generic AI planner that aggregates all travel booking details and tickets into one automated timeline.* | **Dropped:**<br>• **Scope Creep:** The target audience was far too broad, which diluted the core value proposition.<br>• **Lack of Differentiation:** Building another generic aggregator forces us to compete with established online travel agencies without any unique cultural differentiator.<br>• **Misaligned Focus:** It solves pre-trip booking logistics rather than the actual on-the-ground itinerary pain points the user group faces. |
| 💬 **Wanderboat: AI Travel Chat Companion**<br><br>*A conversational AI chatbot that suggests points of interest, signature dishes, and photo spots on the fly through a chat interface.* | **Dropped:**<br>• **UX Mismatch:** A chat interface is great for spontaneous discovery but highly inefficient for structured, multi-person group coordination.<br>• **Logistical Risks:** Muslim travel requires strict, non-negotiable logistical anchors. A conversational AI lacks the visual timeline visibility, document verification, and emergency re-routing required to keep a complex group trip on track. |

---

<a id="22-ideation-boards"></a>
### 2.2 Ideation Boards

To view our complete and interactive ideation flow, please click the link below. The embedded pictures below are just provided as a fallback summary in case you are unable to enter the live link.

🔗 **[Full Ideation Board Link](https://miro.com/app/board/uXjVJxp-TU8=/?share_link_id=677056059932)**

![Brainstorming Process](Brainstorming%20process.png)
*This flowchart outlines our three-stage brainstorming methodology. It details how we moved from initial problem discovery to solution mapping, and finally through our mentor pivot iterations.*

![Problem and Solution Tree](FinalIdea.png)
*This board visualizes our core logic tree mapping. It shows exactly how we extracted root causes from market research and connected them directly to our problem statement and AI features.*

![Idea Evolution Sequence](IdeaFormation.png)
*This sequence tracks the evolution of the five major ideas we considered. It highlights the fatal flaws in our earlier concepts and the specific mentor advice that led us to our final chosen solution.*

<a id="23-mentor-consultation"></a>
### 👨‍🏫 2.3 Mentor Consultation

| Date & Time | Mentor | Feedback Received | What Was Changed |
| :--- | :--- | :--- | :--- |
| **8 Sep 2026, 21:45 PM** | **Daniel Koh Yu Hang** | **1. Expanding Beyond Muslim-Only (Mixed-Group Edge Cases):**<br>During our pitch, our app was aimed strictly at Muslim travelers. The mentor challenged this narrow scope, pointing out that real-world travel often involves mixed groups (e.g., university friends or corporate trips). When we suggested using a "voting" feature to handle preference clashes, he pointed out a major flaw: a basic voting system does not resolve strict religious/dietary constraints and offers no real advantage over arguing in a WhatsApp group. | **The Pivot to the AI Compromise Engine:**<br>We pivoted our core value proposition. While keeping Halal features, we designed the app to handle mixed-group travel actively. We scrapped the basic voting idea and engineered the **AI Compromise & Auto-Split Engine**.<br><br>**System Impact:** Instead of forcing a "majority rules" compromise, the AI now actively calculates a middle-ground venue (e.g., suggesting a food district with both Halal and non-Halal stalls) or temporarily splits the itinerary, generating synchronized "regroup" pins on the map. This transforms the app from a simple planner into an active conflict-resolution tool. |
| **8 Sep 2026, 21:45 PM** | **Daniel Koh Yu Hang** | **2. Missing UI Flow for Group Formation & Onboarding:**<br>The mentor noticed our UI prototype lacked a logical starting point. He specifically asked how a group is actually formed in the app and what exact data inputs are required from users before the trip is created. Because our initial flow skipped this, the mentor pointed out that the AI wouldn't have enough context to generate an accurate itinerary right from the start. | **Redesigning the Phase 1 Onboarding Architecture:**<br>We completely restructured the user journey by building a step-by-step "Onboarding & Group Sync" flow.<br><br>**System Impact:** We implemented a system where the "Admin" creates the trip skeleton (dates/destination) and sends an invite link. Crucially, before joining the canvas, each member now passes through a "Preference Setup" screen to lock in their specific constraints (e.g., strictly Halal, mobility limits, dietary allergies). This data is immediately fed into the AI, ensuring the initial itinerary generation respects everyone's constraints from step one, drastically reducing the need for manual re-routing later. |
| **10 Sep 2026, 20:00 PM** | **Lim Zi Yang** | **3. AI Itinerary Logic Gaps & Generic UI Presentation:**<br>The mentor pointed out a critical logic error in our frontend flow regarding how the AI organized and sequenced the generated itinerary. Furthermore, he noted that our UI design looked too similar to standard, generic travel planner apps. He emphasized that an AI-powered app needs a strong visual "wow" design. | **Solved Logic & Redesigned to Our Style:**<br>We debugged the frontend state management, ensuring the AI sequences and organizes the itinerary with the correct logic.<br><br>**System Impact:** We completely redesigned the UI to establish our own unique, premium style, moving away from generic layouts to create a distinct and visually impressive experience that highlights our AI features. |

---

<a id="3-design--prototype"></a>
## 3. Design & Prototype

🔗 **Live UI Prototype:** **[Public Link](https://safar-oahgjkt92-cristal-teohs-projects.vercel.app/)**

*[Embed 4–8 UI screenshots highlighting the core flow, with short captions]*

---

<a id="4-competitive-edge-what-makes-it-different"></a>
## ⚡ 4. Competitive Edge (What Makes It Different)

While standard apps like Wanderlog handle basic collaborative planning, they treat religious and dietary requirements as optional preferences rather than strict constraints. **Safar App** introduces a culturally aware AI that actively resolves group conflicts instead of just logging them.

### 🌟 Distinctive Twists

* ⏱️ **1. Dynamic Prayer-Anchored Timeline**  
  >Instead of just giving static prayer notifications, it uses live GPS to automatically insert prayer and wudu-friendly facility blocks into the schedule while simultaneously assigning nearby activities for non-Muslim companions so group travel never stalls.

* 🤖 **2. AI Compromise & Auto-Split Engine**  
  >Instead of using basic "majority rules" voting where someone always loses, the AI arbitrates disputes by either finding common-ground venues or creating temporary, synchronized split routes that regroup seamlessly.

* 📍 **3. Live Geo-Fenced Halal Radar**  
  >Rather than relying on generic directories, it drops dynamic meal blocks based on current coordinates with a transparent 3-tier safety tag (*Certified Halal*, *Muslim-Owned*, *Pork-Free*) alongside live wait times.

* 📲 **4. Social-to-Itinerary Engine**  
  >Instead of manually copying spots from social media, users drop TikTok or Instagram links to auto-generate itinerary blocks that are instantly pre-screened through the Halal Radar.

* 🛡️ **5. AI Document Cross-Check Vault**  
  >Moving beyond passive cloud storage, it proactively cross-checks uploaded passport metadata against flight dates to prevent check-in rejections, while acting as the live, legal data feed that powers the AI's emergency rerouting.

* 🔄 **6. Emergency Fallback Engine**  
  >When a transit delay hits, the app doesn't just display alerts; it uses the Vault's ticket data to trigger a "self-healing" protocol. It auto-shifts downstream bookings, ensures alternative routes are legally viable for all members, and instantly drops new Halal and prayer checkpoints.

---

### 📊 Competitor Comparison Matrix

| Feature | Safar App (Ours) | Wanderlog | HalalTrip | Lambus | TripAdvisor (Trips) | Excel & WhatsApp |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Primary Use Case** | **Mixed/Muslim Groups** | Group Itinerary Builder | Static Muslim Directory | Group Expense & Travel | Venue Discovery & Saves | Manual Tracking |
| 🗓️ **Collaborative Timeline** | ✅ **Yes** | ✅ Yes | ❌ No | ✅ Yes | ⚠️ View Only | ❌ No |
| 🌙 **Live Geo-Fenced Halal Radar** | ✅ **Yes** | ❌ No | ⚠️ Static Only | ❌ No | ⚠️ Filters Only | ❌ No |
| 🕌 **Auto-Syncs Prayers to Map** | ✅ **Yes** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| ⚖️ **AI Conflict Resolution (Auto-Split)**| ✅ **Yes** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| 🚨 **Emergency Fallback Re-Routing** | ✅ **Yes** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| 🗂️ **Group Document Vault & Checks** | ✅ **Yes** | ⚠️ Manual | ❌ No | ✅ Yes | ❌ No | ⚠️ Unsecure |

---

<a id="5-technical-architecture--feasibility"></a>
## 5. Technical Architecture & Feasibility

**Stack Breakdown**
*   **Frontend Core:** **React 19** + **TypeScript (~5.8)** + **Vite 6** - Provides bleeding-edge rendering speed, strict type safety across multi-user travel data models, and instantaneous hot-module replacement during live presentations.
*   **Styling & Motion:** **Tailwind CSS v4** (`@tailwindcss/vite`) + **Framer Motion** (`motion: ^12.23`) + **Lucide React** - Custom responsive Islamic travel UI palette (Emerald/Sand/Amber accents), fluid drawer gestures, and accessible SVG iconography.
*   **AI Engine & Multimodal Parser:** **Google Gemini 2.0 (`@google/genai: ^2.4.0`)** - Performs zero-shot extraction on social video links (TikTok/Xiaohongshu/Instagram) to parse hidden venues, geocodes coordinates, classifies Halal certification tiers, conducts group conflict auto-splits, and runs automated document expiry & accommodation gap checks.
*   **Real-Time Collaboration & State Sync:** **Firebase Firestore (`firebase: ^12.18.0`)** + **HTML5 BroadcastChannel API** - Cloud-persisted live presence, synchronized group pin drops, and instant zero-latency multi-tab updates for seamless multiplayer group planning.
*   **Mapping & Geospatial Intelligence:** **`@vis.gl/react-google-maps` (`^1.10.0`)** + **Google Maps JavaScript API (Places & Advanced Markers)** with **OpenStreetMap / Leaflet Fallback** - Real-time venue discovery, draggable drawer exploration, live geo-fenced Halal radar, and route visualization.
*   **Prayer & Weather Intelligence:** **Aladhan Prayer Times API** + **Kyoto/GPS Astronomical Calculation Models** + **Open-Meteo API** - Computes GPS-anchored Dhuhr/Asr/Maghrib prayer blocks, Qibla headings, and live weather conditions with real-time transit delay simulations.
*   **Document Generation & Offline Exports:** **jsPDF (`^4.2.1`)** - Generates print-ready emergency offline itineraries, prayer schedules, and travel compliance dossiers directly client-side.

**Build Plan & Scope (Shipped Competition Phase Modules)**
1.  **Social-to-Itinerary Reel Parser:** Paste any travel reel/short URL to automatically detect spots, geocode locations, and tag 3-tier Halal compliance into the collaborative itinerary.
2.  **Prayer-Anchored Collaborative Workspace:** Draggable discovery drawer with dynamic prayer block locks, synced regroup pins, and live Google Maps venue markers.
3.  **Cross-Screen Hotel Vault & Group Preference Sync:** Auto-syncs accommodations uploaded to the Document Vault directly into the workspace planning canvas with group preference fallback suggestions.
4.  **AI Group Conflict Auto-Split:** Detects conflicting pace and dietary requirements (e.g. Mosque visit vs. local cafe break) and recalculates dual parallel paths with a shared regroup marker.
5.  **Emergency Fallback Pivot Engine:** One-click blast radius calculation for transit/flight delays with automatic itinerary shift, nearby Halal dining, and prayer room discovery.
