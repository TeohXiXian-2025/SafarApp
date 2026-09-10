# 🌍 SalamSync
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
| 🍽️ **Fragmented Food Search** | Finding safe Halal food overseas forces travelers to manually switch between map apps, social media, and static directories just to verify ingredients.  | **Live Geo-Fenced Halal Radar:** When it is time to eat, the app drops a "Meal Block" based on the group's exact location on the map. It filters nearby restaurants using a clear 3-tier label (Certified Halal, Muslim-Owned, or Pork-Free), displaying walking distances, live wait times, and verified menus all on one single screen. |
| 🧑‍🧑‍🧒‍🧒 **Inflexible Group Decisions** |  Standard apps use a simple "majority rules" vote. When group preferences clash, someone is always forced to sacrifice their strict dietary rules or personal travel goals.  | **AI Compromise & Auto-Split Engine:** If a group vote creates a conflict, the AI immediately steps in. It will either suggest a middle-ground venue (such as a food district with both Halal and non-Halal stalls side-by-side) or it will automatically split the itinerary into two separate paths for a few hours, placing a synchronized pin on the map for everyone to smoothly regroup later. |

<a id="extra-features"></a>
### 🚀 Extra Features

| Feature | What it is | What it actually solve |
| :--- | :--- | :--- |
| 📱 **Social-to-Itinerary Engine** | Users can paste a link from an Instagram Reel, TikTok, or Xiaohongshu directly into the app. The AI scans the video, extracts the locations, and instantly generates a draft itinerary block on the shared canvas. | Travelers spend hours manually cross-referencing viral social media videos with map apps which is troublesome. This feature turns a quick social link into a routed itinerary, while instantly running the extracted location through the app's Halal Radar to verify if the trending spot is actually Muslim-friendly. |
| 🔒 **AI Document Cross-Check Vault** | A secure group vault where all members upload their passports, visas, and flight tickets. The admin triggers an AI sweep that evaluates the document metadata, cross-checking passport expiry dates against flight schedules. | In group travel, one person's expired passport or incorrect visa can ruin the trip for everyone. Instead of the admin manually squinting at five different passports, the proactive compliance engine catches bureaucratic errors weeks before the group arrives at the airport check-in counter. |
| 🆘 **Emergency Fallback Engine** | An emergency button used when a flight is canceled or a train is missed. It calculates the "blast radius" of the delay, instantly surfaces alternative transit routes, and triggers a "self-healing" protocol that automatically shifts downstream hotel check-ins and activities to later times. | When an emergency happens, a mixed group's carefully negotiated schedule is completely ruined. Instead of leaving Muslim travelers stranded at a random station with no safe food or prayer space, the AI automatically resyncs the timeline. It drops new Halal dining options and prayer facility pins tailored to the new delay route, while instantly recalculating the shared group budget to cover surprise emergency costs without causing arguments. |

---

<a id="2-ideation--process"></a>
## 2. Ideation & Process

<a id="21-ideas-we-considered"></a>
### 2.1 Ideas We Considered
| Idea | Why it was dropped / kept |
| :--- | :--- |
| **A (Chosen)** | *[Rationale]* |
| **B (Chosen)** | *[Rationale]* |
| **C** | *[Rationale]* |

<a id="22-ideation-boards"></a>
### 2.2 Ideation Boards
*[Drop your Figma/Miro links or embedded images here. E.g., User Flows, SCAMPER grids, Crazy Eights]*

<a id="23-mentor-consultation"></a>
### 2.3 Mentor Consultation
| Date | Mentor | Feedback Received | Action Taken |
| :--- | :--- | :--- | :--- |
| *[MM/DD]* | *[Name]* | *[Notes]* | *[Pivot/Persevere decision]* |

---

<a id="3-design--prototype"></a>
## 3. Design & Prototype

🔗 **Live UI Prototype:** [Public Link] *(Ensure it opens in incognito)*

*[Embed 4–8 UI screenshots highlighting the core flow, with short captions]*

---

<a id="4-competitive-edge-what-makes-it-different"></a>
## 4. Competitive Edge (What Makes It Different)

*   **[Feature]**: *[Why it's a game-changer compared to Wanderlog/HalalTrip]*
*   **[Feature]**: *[The original twist]*

---

<a id="5-technical-architecture--feasibility"></a>
## 5. Technical Architecture & Feasibility

**Stack Breakdown**
*   **Frontend:** *[e.g., React Native]* - *[Why & Constraints]*
*   **Backend & DB:** *[e.g., Supabase/Node.js]* - *[Why & Constraints]*
*   **APIs:** *[e.g., Google Maps Places API]* - *[Why & Constraints]*

**Build Plan & Scope**
*[Define exactly what modules are being shipped for this specific competition phase]*
