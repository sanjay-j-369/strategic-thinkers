Founder Intelligence Engine v2.0 — Implementation Plan (Updated)
Phase 0: The "Live Demo" Infrastructure
Goal: Create a controlled environment to showcase the "wow" moments of the engine using a pre-packaged "Founder Persona" (e.g., Alex, CEO of a Seed-stage SaaS startup).

0.1 The "Storybook" Persona Generator

Backend (backend/app/demo/persona.py): * Create a hardcoded "Demo Persona" including a fake company profile (startup_profile): $12k MRR, 25% burn increase, and no HR hire yet.

Generate a "History" of simulated, redacted Slack and Gmail threads that contain the "Unresolved Loops" needed for Phase 1.1.

Environment Variable: Add DEMO_MODE=True. When active, the system bypasses OAuth and populates the founder_memory Pinecone namespace with this persona’s data.

0.2 The "Command Center" (Admin Overlay)
Frontend (frontend/components/DemoControls.tsx): * A hidden toggle (or Shift + D) that opens a sidebar for the presenter.


Buttons include: * Trigger Meeting Prep: Forces the ASSISTANT_PREP task to run for a fake upcoming meeting.


Trigger Growth Milestone: Manually fires the "Evaluate Thresholds" logic to show a proactive Guide card.

Reset Demo: Clears the local Redis queue and refreshes the feed to a clean state.

Phase 1: Solving "Context Switching" (The Assistant 2.0)
1.1 The "Thread-Puller" Feature (Unresolved Loops)

Backend: Update GPT-4o synthesis to extract "Promises" and "Unresolved Questions" from previous interactions.


Data Retrieval: Weight Pinecone queries to favor chunks classified as action items during ingestion.


Frontend: Render an "Unresolved Loops" section on the PrepCard.

1.2 Deep-Linking Integration

Ingestion: Extract threadId (Gmail) or message_ts (Slack) to construct direct web URLs.


Metadata: Store these as source_url in Pinecone metadata.


Frontend: Add a "Jump to Thread" button to eliminate search friction.

Phase 2: Solving "Getting Started" Confusion (The Guide 2.0)
2.1 Milestone-Driven Proactivity (Threshold Triggers)

Logic: A daily Celery task (evaluate_founder_thresholds) checks metrics (e.g., MRR, runway) against a rule-based engine.


Proactive Push: If a founder is spending >20% of time on support with >$10k MRR, push a "First Success Hire" framework card.

2.2 The "Stage-Gate" Framework Library

Tagging: Tag all playbook documents with applicable_stages (e.g., "Pre-Seed", "Seed").


Filtering: Inject a Pinecone metadata filter so founders only see frameworks relevant to their current funding stage.

Phase 3: Merging Reflection with Action
3.1 The "Founder-Market Fit" Feedback Loop

Historical Archiving: Save all past Guide queries as "Past Dilemmas" in founder_memory.


Calibration: Remind the founder of how they solved a similar "complexity spiral" in the past to build their decision-making confidence.

3.2 The "Stage-Aware" State Machine

Node 1.5: Evaluate the company stage to set communication_style.


Pre-Seed: Direct, navigational, and prescriptive to reduce "Getting Started" fog.


Series A: Socratic and reflective to improve long-term judgment quality.