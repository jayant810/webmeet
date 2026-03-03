"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Users, 
  Monitor, MonitorOff, UserPlus, X, Check, Shield 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

interface WaitingUser {
  userId: string;
  userName: string;
  socketId: string;
}

export default function Room({ roomId }: { roomId: string }) {
  const { data: session, status } = useSession();
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteUserNames, setRemoteUserNames] = useState<Record<string, string>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [waitingUsers, setWaitingUsers] = useState<WaitingUser[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const router = useRouter();

  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ],
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?callbackUrl=/room/${roomId}`);
      return;
    }
    if (status !== "authenticated" || !session) return;

    let isMounted = true;
    
    // On AWS with DuckDNS, if the signaling server is on the same domain, 
    // we don't need a separate URL. If it's on a different port (3001), we specify it.
    const signalingServer = process.env.NEXT_PUBLIC_SIGNALING_SERVER || window.location.origin;
    
    console.log("Connecting to signaling server:", signalingServer);

    const socket = io(signalingServer, {
      path: "/socket.io/",
      transports: ["websocket", "polling"], 
      reconnection: true,
      reconnectionAttempts: 5,
      withCredentials: true,
    });
    socketRef.current = socket;

    const createPeerConnection = (userId: string, socket: Socket) => {
      console.log(`[WebRTC] Creating PeerConnection for user: ${userId}`);
      
      // Safeguard: Close existing connection if it exists
      if (peersRef.current[userId]) {
        console.log(`[WebRTC] Closing existing PC for ${userId} before creating new one`);
        try { peersRef.current[userId].close(); } catch (e) {}
        delete peersRef.current[userId];
      }

      const pc = new RTCPeerConnection(iceServers);
      
      if (localStreamRef.current) {
        console.log(`[WebRTC] Adding ${localStreamRef.current.getTracks().length} local tracks to PC for ${userId}`);
        localStreamRef.current.getTracks().forEach(track => {
          if (pc.signalingState !== "closed") {
            pc.addTrack(track, localStreamRef.current!);
          }
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && pc.signalingState !== "closed") {
          socket.emit("ice-candidate", { target: userId, caller: socket.id, candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        console.log(`[WebRTC] ONTRACK from ${userId}. Streams: ${event.streams.length}`);
        if (event.streams && event.streams[0]) {
          setRemoteStreams(prev => ({ ...prev, [userId]: event.streams[0] }));
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          if (pc.signalingState !== "stable") return;
          console.log(`[WebRTC] Sending offer to ${userId}`);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { target: userId, caller: socket.id, sdp: offer });
        } catch (e) { console.error(`[WebRTC] Negotiation error:`, e); }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] State with ${userId}: ${pc.connectionState}`);
      };

      return pc;
    };

    const startMeeting = (adminStatus: boolean) => {
      socket.on("connect", () => {
        setIsConnected(true);
        console.log(`[Signaling] Connected as ${socket.id}`);
      });

      socket.on("join-approved", () => {
        console.log("[Signaling] APPROVED. Transitioning to room...");
        setIsWaiting(false);
        if (session?.user) {
          socket.emit("ready-to-connect", roomId, (session.user as any).id, session.user.name);
        }
      });

      socket.on("user-connected", async (userId: string, userName: string) => {
        console.log(`[Signaling] Connecting to ${userName}...`);
        setRemoteUserNames(prev => ({ ...prev, [userId]: userName }));
        peersRef.current[userId] = createPeerConnection(userId, socket);
      });

      socket.on("room-participants", (users: { userId: string, userName: string }[]) => {
        users.forEach(u => setRemoteUserNames(prev => ({ ...prev, [u.userId]: u.userName })));
      });

      socket.on("offer", async (payload) => {
        console.log(`[Signaling] Offer from ${payload.caller}`);
        let pc = peersRef.current[payload.caller];
        if (!pc || pc.signalingState === "closed") {
          pc = createPeerConnection(payload.caller, socket);
          peersRef.current[payload.caller] = pc;
        }
        
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { target: payload.caller, caller: socket.id, sdp: answer });
        } catch (e) { console.error(`[WebRTC] Answer error:`, e); }
      });

      socket.on("answer", async (payload) => {
        const pc = peersRef.current[payload.caller];
        if (pc && pc.signalingState !== "closed") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
      });

      socket.on("ice-candidate", async (incoming) => {
        const pc = peersRef.current[incoming.caller];
        if (pc && pc.signalingState !== "closed") {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(incoming.candidate));
          } catch (e) {}
        }
      });

      socket.on("user-disconnected", (userId: string) => {
        if (peersRef.current[userId]) {
          try { peersRef.current[userId].close(); } catch (e) {}
          delete peersRef.current[userId];
        }
        setRemoteStreams(prev => { const n = {...prev}; delete n[userId]; return n; });
        setRemoteUserNames(prev => { const n = {...prev}; delete n[userId]; return n; });
      });

      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (!isMounted) return;
          console.log("[Media] Local stream acquired");
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
          
          Object.entries(peersRef.current).forEach(([id, pc]) => {
            if (pc.signalingState !== "closed") {
              console.log(`[Media] Adding tracks to active PC: ${id}`);
              stream.getTracks().forEach(track => pc.addTrack(track, stream));
            }
          });
        })
        .catch(err => {
          console.error("[Media] Error:", err);
          toast.error("Camera/Mic access failed");
        });

      if (session?.user) {
        socket.emit("join-room", roomId, (session.user as any).id, session.user.name, adminStatus);
      }
    };

    const checkAdminStatus = async () => {
       try {
         const res = await fetch(`/api/meetings/${roomId}`);
         const data = await res.json();
         const isUserAdmin = data.adminId === (session.user as any).id;
         setIsAdmin(isUserAdmin);
         startMeeting(isUserAdmin);
       } catch (e) {
         startMeeting(false);
       }
    };

    checkAdminStatus();

    return () => {
      isMounted = false;
      socket.disconnect();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      Object.values(peersRef.current).forEach(pc => pc.close());
    };
  }, [roomId, session, status, router]);

  const toggleMute = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); }
  };

  const toggleVideo = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsVideoOff(!t.enabled); }
  };

  const leaveRoom = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    router.push("/");
  };

  if (status === "loading") return <div className="h-screen flex items-center justify-center bg-neutral-900 text-white">Loading...</div>;
  if (isRejected) return <div className="h-screen flex flex-col items-center justify-center bg-neutral-900 text-white p-6">Access Denied</div>;
  if (isWaiting) return <div className="h-screen flex flex-col items-center justify-center bg-neutral-900 text-white">Waiting for host...</div>;

  const participantCount = Object.keys(remoteUserNames).length + 1;

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-white overflow-hidden">
      <div className="flex-1 p-4 grid gap-4 place-items-center overflow-y-auto auto-rows-fr" style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))`
      }}>
        <div className="relative w-full h-full aspect-video bg-black rounded-xl overflow-hidden border border-neutral-800 flex items-center justify-center">
          {isVideoOff ? (
            <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold">{session?.user?.name?.charAt(0)}</div>
          ) : (
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          )}
          <div className="absolute bottom-4 left-4 text-sm bg-black/60 px-3 py-1.5 rounded-md">You {isAdmin && "(Host)"}</div>
        </div>

        {Object.keys(remoteUserNames).map((id) => (
          <div key={id} className="relative w-full h-full aspect-video bg-black rounded-xl overflow-hidden border border-neutral-800 flex items-center justify-center">
            {remoteStreams[id] ? (
              <video autoPlay playsInline ref={el => { if(el) el.srcObject = remoteStreams[id] }} className="w-full h-full object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-neutral-800 flex items-center justify-center text-3xl font-bold animate-pulse">{remoteUserNames[id]?.charAt(0)}</div>
            )}
            <div className="absolute bottom-4 left-4 text-sm bg-black/60 px-3 py-1.5 rounded-md">{remoteUserNames[id]}</div>
          </div>
        ))}
      </div>

      {isAdmin && waitingUsers.length > 0 && (
        <div className="absolute top-6 right-6 w-80 bg-neutral-800 border border-neutral-700 rounded-lg p-4 shadow-2xl">
           <h3 className="font-semibold mb-4">Waiting to join ({waitingUsers.length})</h3>
           {waitingUsers.map(user => (
             <div key={user.userId} className="flex items-center justify-between bg-neutral-900 p-2 rounded-md mb-2">
                <span className="text-sm truncate">{user.userName}</span>
                <div className="flex gap-1">
                   <Button size="icon" variant="ghost" className="text-red-400" onClick={() => socketRef.current?.emit("reject-user", roomId, user.userId)}><X className="h-4 w-4" /></Button>
                   <Button size="icon" variant="ghost" className="text-green-400" onClick={() => { socketRef.current?.emit("approve-user", roomId, user.userId); setWaitingUsers(prev => prev.filter(u => u.userId !== user.userId)); }}><Check className="h-4 w-4" /></Button>
                </div>
             </div>
           ))}
        </div>
      )}

      <div className="h-20 bg-neutral-950 border-t border-neutral-800 flex items-center justify-center gap-4 px-6">
        <Button variant={isMuted ? "destructive" : "secondary"} size="icon" className="rounded-full" onClick={toggleMute}>{isMuted ? <MicOff /> : <Mic />}</Button>
        <Button variant={isVideoOff ? "destructive" : "secondary"} size="icon" className="rounded-full" onClick={toggleVideo}>{isVideoOff ? <VideoOff /> : <VideoIcon />}</Button>
        <Button variant="destructive" size="icon" className="rounded-full w-16" onClick={leaveRoom}><PhoneOff /></Button>
        <div className="ml-4 flex items-center gap-2 text-neutral-400"><Users className="h-4 w-4" /> {participantCount}</div>
      </div>
    </div>
  );
}
