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
      const pc = new RTCPeerConnection(iceServers);
      
      if (localStreamRef.current) {
        console.log(`[WebRTC] Adding ${localStreamRef.current.getTracks().length} local tracks to PC for ${userId}`);
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
      } else {
        console.warn(`[WebRTC] No local stream available yet when creating PC for ${userId}`);
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`[WebRTC] Generated ICE candidate for ${userId}`);
          socket.emit("ice-candidate", { target: userId, caller: socket.id, candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        console.log(`[WebRTC] ONTRACK: Received remote track from ${userId}. Stream count: ${event.streams.length}`);
        if (event.streams && event.streams[0]) {
          setRemoteStreams(prev => {
            console.log(`[WebRTC] Updating remote stream for ${userId}`);
            return { ...prev, [userId]: event.streams[0] };
          });
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          console.log(`[WebRTC] Negotiation needed for ${userId}. Signaling state: ${pc.signalingState}`);
          if (pc.signalingState !== "stable") return;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          console.log(`[WebRTC] Sending offer to ${userId}`);
          socket.emit("offer", { target: userId, caller: socket.id, sdp: offer });
        } catch (e) { console.error(`[WebRTC] Negotiation error for ${userId}:`, e); }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE Connection State with ${userId}: ${pc.iceConnectionState}`);
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection State with ${userId}: ${pc.connectionState}`);
      };

      return pc;
    };

    const startMeeting = (adminStatus: boolean) => {
      socket.on("connect", () => {
        setIsConnected(true);
        console.log(`[Signaling] Connected to server: ${signalingServer} with ID: ${socket.id}`);
      });

      socket.on("waiting-for-admin", () => {
        console.log("[Signaling] Room exists but admin not present. Waiting...");
        setIsWaiting(true);
      });
      
      socket.on("join-approved", () => {
        console.log("[Signaling] Join approved by admin. Ready to connect.");
        setIsWaiting(false);
        if (session?.user) {
          socket.emit("ready-to-connect", roomId, (session.user as any).id, session.user.name);
        }
      });

      socket.on("request-to-join", (user: WaitingUser) => {
        console.log(`[Signaling] Admin: ${user.userName} wants to join.`);
        setWaitingUsers(prev => prev.find(u => u.userId === user.userId) ? prev : [...prev, user]);
        toast.info(`${user.userName} wants to join`);
      });

      socket.on("user-connected", async (userId: string, userName: string) => {
        console.log(`[Signaling] User ready to connect: ${userName} (${userId})`);
        setRemoteUserNames(prev => ({ ...prev, [userId]: userName }));
        
        const pc = createPeerConnection(userId, socket);
        peersRef.current[userId] = pc;
      });

      socket.on("room-participants", (users: { userId: string, userName: string }[]) => {
        console.log(`[Signaling] Received existing room participants: ${users.length}`);
        users.forEach(u => {
          console.log(`[Signaling] Adding participant: ${u.userName}`);
          setRemoteUserNames(prev => ({ ...prev, [u.userId]: u.userName }));
        });
      });

      socket.on("offer", async (payload) => {
        console.log(`[Signaling] Received offer from ${payload.caller}`);
        let pc = peersRef.current[payload.caller];
        if (!pc) {
          console.log(`[Signaling] PC not found for offerer ${payload.caller}. Creating now.`);
          pc = createPeerConnection(payload.caller, socket);
          peersRef.current[payload.caller] = pc;
        }
        
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          console.log(`[WebRTC] Remote description set for ${payload.caller}`);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log(`[WebRTC] Sending answer to ${payload.caller}`);
          socket.emit("answer", { target: payload.caller, caller: socket.id, sdp: answer });
        } catch (e) { console.error(`[WebRTC] Answer error for ${payload.caller}:`, e); }
      });

      socket.on("answer", async (payload) => {
        console.log(`[Signaling] Received answer from ${payload.caller}`);
        const pc = peersRef.current[payload.caller];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          console.log(`[WebRTC] Final remote description set for ${payload.caller}. Connection should establish.`);
        } else {
          console.error(`[Signaling] Received answer from ${payload.caller} but no PC exists!`);
        }
      });

      socket.on("ice-candidate", async (incoming) => {
        const pc = peersRef.current[incoming.caller];
        if (pc) {
          try {
            console.log(`[WebRTC] Adding ICE candidate from ${incoming.caller}`);
            await pc.addIceCandidate(new RTCIceCandidate(incoming.candidate));
          } catch (e) { console.error("[WebRTC] ICE candidate error:", e); }
        }
      });

      socket.on("user-disconnected", (userId: string) => {
        if (peersRef.current[userId]) {
          peersRef.current[userId].close();
          delete peersRef.current[userId];
        }
        setRemoteStreams(prev => { const n = {...prev}; delete n[userId]; return n; });
        setRemoteUserNames(prev => { const n = {...prev}; delete n[userId]; return n; });
      });

      // Get Media
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (!isMounted) return;
          console.log("Local stream acquired");
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
          
          // Add tracks to any ALREADY existing peer connections
          // This will trigger onnegotiationneeded on those PCs
          Object.values(peersRef.current).forEach(pc => {
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
          });
        })
        .catch(err => {
          console.error("Media error:", err);
          setError("Camera blocked or in use. You can still join.");
          toast.error("Could not access camera/microphone");
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
