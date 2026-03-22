# WebMeet - Project Status & Architecture

## 🚀 Current Architecture (Hybrid Deployment)
The project is optimized for high-scale performance (15-20+ users) with a split-concern architecture:
- **Frontend:** Next.js 16+ (App Router) with reactive WebRTC state management.
- **Database:** PostgreSQL on **Neon.tech** (Prisma ORM).
- **Signaling Server:** Standalone Socket.IO server (`server-standalone.mjs`) on **AWS EC2**.
- **Media Handling:** Reactive `RemoteVideo` components to ensure reliable stream-to-DOM binding.

## ✨ Features Implemented
- [x] **Google OAuth Authentication:** Integrated via NextAuth.js.
- [x] **Persistent Meetings:** Meeting IDs and Admin ownership stored in PostgreSQL.
- [x] **Admin Roles:** Creator has host privileges (Shield icon, Admit/Deny users).
- [x] **Pre-authorization:** Admin can invite users by email to bypass the waiting room.
- [x] **Waiting Room:** Non-admin/uninvited users must be approved to join.
- [x] **Real-time Chat:** In-call text messaging system with sidebar.
- [x] **Reactions:** Visual emoji reactions that float over video streams.
- [x] **Participant List:** Sidebar to view all active members in the call.
- [x] **Screen Sharing:** High-quality screen capture with track replacement.
- [x] **Dynamic Grid:** Responsive Google Meet-style UI that scales with participants.
- [x] **Media Safeguards:** Deferred media access until approval; `NotReadableError` handling with locks.

## 🛠️ Deployment Instructions

### 1. AWS Signaling Server (Ubuntu)
- **File:** `server-standalone.mjs`
- **Port:** `3001` (proxied by Nginx to `443`)
- **Setup:**
  ```bash
  npm install socket.io dotenv
  pm2 start server-standalone.mjs --name webmeet-signaling
  ```

### 2. Vercel Frontend
- **Framework:** Next.js (App Router)
- **Required Build Step:** `npm run build` is required before `pm2 restart webmeet-frontend` to apply UI changes.

### 3. Database (Prisma)
- **Sync Schema:** `npx prisma db push` (Added `invitedEmails` to Meeting model).

## 📂 Key Files
- `server-standalone.mjs`: Dedicated signaling logic for AWS (Relays offers, answers, candidates, chat, and reactions).
- `src/components/Room.tsx`: Core WebRTC engine, UI Layout, and Reactive Media Handling.
- `src/app/api/meetings/[id]/route.ts`: Meeting metadata and invitation API.
- `prisma/schema.prisma`: Database models for Users, Meetings, and Participants.

## 📝 Pending / Next Steps
- [ ] **Recording:** Integration with AWS S3 or MediaConvert for meeting recording.
- [ ] **TURN Server:** Set up Coturn on AWS for users behind strict corporate firewalls.
- [ ] **Noise Cancellation:** Advanced client-side audio processing.

---
*Last Updated: March 3, 2026*
