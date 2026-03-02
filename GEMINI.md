# WebMeet - Digital Meeting Website

A modern, "Google Meet" style video conferencing application built from scratch using Next.js, WebRTC, and Socket.IO. This project is designed to be resume-ready, demonstrating full-stack capabilities, real-time signaling, and peer-to-peer media streaming.

## 🚀 Tech Stack

- **Framework:** [Next.js 15+](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Real-time Signaling:** [Socket.IO](https://socket.io/) (Custom Node.js server)
- **Media Streaming:** [WebRTC](https://webrtc.org/) (Mesh Architecture)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [shadcn/ui](https://ui.shadcn.com/)
- **Icons:** [Lucide React](https://lucide.dev/)

## ✨ Features

- **P2P Video/Audio:** Built-in WebRTC mesh network allowing 5-10 users to connect directly.
- **Dynamic Room Generation:** Unique UUID-based meeting rooms.
- **Real-time Controls:**
  - Toggle Camera (Video on/off)
  - Toggle Microphone (Mute/Unmute)
  - Leave Meeting
- **Responsive Grid:** Adaptive video layout that scales based on the number of participants.
- **Modern UI:** Clean, minimalist design inspired by Google Meet.

## 🏗️ Architecture

Instead of using third-party SDKs like LiveKit or Agora, this project implements the **WebRTC Signaling Flow** from scratch:
1. **Signaling Server:** A custom `server.mjs` integrates Socket.IO with the Next.js request handler.
2. **Handshake:** When a user joins, the server facilitates the exchange of SDP (Session Description Protocol) offers and answers.
3. **ICE Candidates:** Peers exchange network information via the signaling server to establish a direct P2P connection through STUN servers.
4. **Mesh Network:** Each participant maintains a direct connection to every other participant, ideal for small groups (5-10 people).

## 🛠️ Getting Started

### Prerequisites
- Node.js (Latest LTS recommended)
- npm

### Installation
1. Clone or navigate to the project folder:
   ```bash
   cd webmeet
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App
Since we use a custom server for signaling, use the following command instead of `next dev`:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## 📂 Project Structure

- `server.mjs`: Custom Node.js server handling Next.js rendering and Socket.IO signaling.
- `src/app/page.tsx`: Landing page for creating or joining meetings.
- `src/app/room/[id]/page.tsx`: Dynamic route for meeting rooms.
- `src/components/Room.tsx`: The core WebRTC logic and video layout engine.
- `src/components/ui/`: Reusable UI components from shadcn/ui.

## 📝 Future Roadmap
- [ ] Screen sharing support.
- [ ] Real-time text chat using Socket.IO.
- [ ] Participant list and "Raise Hand" feature.
- [ ] Virtual backgrounds/Blur (using MediaPipe).
