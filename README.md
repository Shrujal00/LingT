# LingT - Agentic Productivity Portal

Welcome to the foundation repository for **LingT**, a hackathon productivity platform designed to streamline collaborative project efforts.

## Brand Vision & Meaning

- **Ling**: The lead AI productivity orchestrator guiding active sessions and processing complex instructions.
- **T**: The team of dedicated agentic orchestrators backing Ling (`TaskOps`, `MemoryBot`, `CalendarSync`).

Together, the **LingT** ecosystem ensures project deadlines are logged, tracked, archived, and escalated automatically.

---

## Architecture & Foundational Scope

This is the fully functional mock-up and layout foundation designed to be extended later with live services. It implements:

- **Strict Server-Side Key Gating**: Protects Gemini API and other third-party secret tokens safely from user browsers.
- **Client-Side State Mocking**: Realistic delay indicators to demonstrate automated summarization and workflow updates.
- **Full Responsive Design**: Native-feeling desktop sidebar navigation combined with mobile drawer capabilities.

### Route Structures

- `/` — **Dashboard (Main App Entry)**: Central workspace hub featuring Live Workspace cache counts, interactive search query box for memories, rapid task checklist with progress meters, upcoming calendar items, and an interactive **Reminder Escalation Flowchart Selector**.
- `/chat` — **AI Companion Feed**: Dedicated discussion interface where users can select which T Team agent handles their instruction (Ling, TaskOps, MemoryBot, CalendarSync) to test specialized response blocks and automated execution logs.
- `/workspace` — **Workspace Hub**: Houses the interactive **Meeting Notes Summarizer** (select raw transcript logs and click "Generate Agentic Summary"), the **Daily Routines Consistency Tracker** (toggle daily habits and view streak multipliers), and expanded timeline views.
- `/api/health` — **Health Check Route**: Server-side API endpoint validating environment variables configurations and status checks.

---

## Local Setup Instructions

Follow these steps to run the application locally on your workstation:

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or v20.x recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/) / [pnpm](https://pnpm.io/)

### Installation

1. Clone or download this project's workspace code.
2. Navigate to the root directory and install dependencies:
   ```bash
   npm install
   ```

### Setup Environment Variables

1. Copy the example variables file to create a local environment file:
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` and add your custom secret keys:
   - Provide a valid **Gemini API Key** to enable server-side model calls.
   - Insert **Firebase API credentials** for persistent user data.
   - Set **Google Calendar OAuth** parameters for calendar synchronization.

### Run Development Server

Launch the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) inside your web browser to interact with the dashboard.

---

## Integration Roadmap

When you are ready to transition from placeholders to a live environment:

1. **AI Calls**: Swap the simulation delays inside `/app/chat/page.tsx` and `/app/workspace/page.tsx` with server-side `fetch()` operations executing requests targeting `/api/gemini` (as described in the Next.js server-side instructions).
2. **Persistence**: Call the `set_up_firebase` tool to provision a Firestore database and Auth instance. Re-point state updates to save task checklists and routines inside Firebase collections.
3. **Calendar**: Call the `set_up_oauth` tool to bootstrap Google OAuth scopes. Replace placeholder timeline lists with real events fetched through official Google Calendar endpoints.
