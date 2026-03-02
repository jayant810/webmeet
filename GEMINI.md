# WebMeet - Project Status & Architecture

## 🚀 Current Architecture (Hybrid Deployment)
The project has been refactored for high-scale performance (15-20+ users) by splitting the concerns:
- **Frontend:** Next.js 15+ (App Router) deployed on **Vercel**.
- **Database:** PostgreSQL hosted on **Neon.tech**.
- **Signaling Server (Backend):** Standalone Socket.IO server (`server-standalone.mjs`) deployed on **AWS EC2 (Ubuntu)**.
- **Reverse Proxy:** Nginx on AWS with **SSL (Certbot)** to allow secure `wss://` connections from Vercel's `https://` environment.

## ✨ Features Implemented
- [x] **Google OAuth Authentication:** Integrated via NextAuth.js.
- [x] **Persistent Meetings:** Meeting IDs and Admin ownership stored in PostgreSQL (Prisma).
- [x] **Admin Roles:** The creator of the meeting has special privileges (Shield icon in UI).
- [x] **Waiting Room:** Non-admin users must be "Approved" by the Admin to join.
- [x] **Screen Sharing:** Real-time screen capture using `getDisplayMedia` and track replacement.
- [x] **Dynamic Grid:** Responsive layout that scales based on participant count.

## 🛠️ Deployment Instructions

### 1. AWS Signaling Server (Ubuntu)
- **File:** `server-standalone.mjs`
- **Port:** `3001` (proxied by Nginx to `443`)
- **Setup:**
  ```bash
  npm install socket.io dotenv
  pm2 start server-standalone.mjs --name webmeet-signaling
  ```
- **Nginx Path:** `/etc/nginx/sites-available/webmeet` (See Chat History for config).

### 2. Vercel Frontend
- **Framework:** Next.js
- **Required Environment Variables:**
  - `DATABASE_URL`: Neon.tech connection string.
  - `NEXTAUTH_SECRET`: Random string for session encryption.
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: From Google Cloud Console.
  - `NEXT_PUBLIC_SIGNALING_SERVER`: `https://your-aws-domain.com`

### 3. Database (Prisma)
- **Sync Schema:** `npx prisma db push`

## 📂 Key Files
- `server-standalone.mjs`: The dedicated signaling logic for AWS.
- `src/components/Room.tsx`: Core WebRTC, Screen Sharing, and Admin UI.
- `src/app/api/auth/[...nextauth]/route.ts`: Google Auth configuration.
- `prisma/schema.prisma`: Database models for Users and Meetings.

## 📝 Pending / Next Steps
- [ ] **Chat System:** Implement real-time text chat using the existing Socket.IO bridge.
- [ ] **Participant List:** Sidebar to view and manage all users in the call.
- [ ] **Recording:** Integration with AWS S3 or MediaConvert for meeting recording.
- [ ] **TURN Server:** Set up Coturn on AWS for users behind strict corporate firewalls.

---
*Last Updated: March 2, 2026*
