"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Users, 
  Monitor, MonitorOff, UserPlus, X, Check, Shield, MoreVertical 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  
  // Admin & Waiting Room State
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
    ],
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?callbackUrl=/room/${roomId}`);
      return;
    }

    if (status !== "authenticated" || !session) return;

    let isMounted = true;
    const signalingServer = process.env.NEXT_PUBLIC_SIGNALING_SERVER || window.location.origin;
    const socket = io(signalingServer, {
      path: "/socket.io/",
      transports: ["websocket"]
    });
    socketRef.current = socket;

    const createPeerConnection = (userId: string, stream: MediaStream, socket: Socket) => {
      const pc = new RTCPeerConnection(iceServers);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", { target: userId, caller: socket.id, candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStreams(prev => ({ ...prev, [userId]: event.streams[0] }));
        }
      };

      return pc;
    };

    const startMeeting = (adminStatus: boolean) => {
      // 1. Set up listeners IMMEDIATELY (before getUserMedia)
      socket.on("connect", () => setIsConnected(true));
      
      socket.on("waiting-for-admin", () => setIsWaiting(true));
      
      socket.on("join-approved", () => {
        console.log("Join approved, notifying room...");
        setIsWaiting(false);
        socket.emit("ready-to-connect", roomId, (session?.user as any).id, session?.user?.name);
      });

      socket.on("join-rejected", () => {
        setIsWaiting(false);
        setIsRejected(true);
      });

      socket.on("request-to-join", (user: WaitingUser) => {
        setWaitingUsers((prev) => {
          if (prev.find(u => u.userId === user.userId)) return prev;
          return [...prev, user];
        });
        toast.info(`${user.userName} wants to join`);
      });

      // Handle incoming connections and WebRTC signaling
      socket.on("user-connected", async (userId: string, userName: string) => {
        console.log("User connected:", userName);
        setRemoteUserNames(prev => ({ ...prev, [userId]: userName }));
        
        // Use local stream if available, otherwise join without sending media
        const pc = createPeerConnection(userId, localStreamRef.current || new MediaStream(), socket);
        peersRef.current[userId] = pc;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { target: userId, caller: socket.id, sdp: offer });
        } catch (e) { console.error(e); }
      });

      socket.on("offer", async (payload) => {
        console.log("Received offer from:", payload.caller);
        const pc = createPeerConnection(payload.caller, localStreamRef.current || new MediaStream(), socket);
        peersRef.current[payload.caller] = pc;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { target: payload.caller, caller: socket.id, sdp: answer });
        } catch (e) { console.error(e); }
      });

      socket.on("answer", async (payload) => {
        const pc = peersRef.current[payload.caller];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      });

      socket.on("ice-candidate", async (incoming) => {
        const pc = peersRef.current[incoming.caller];
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(incoming.candidate));
          } catch (e) { console.error("Error adding ICE candidate", e); }
        }
      });

      socket.on("user-disconnected", (userId: string) => {
        console.log("User disconnected:", userId);
        if (peersRef.current[userId]) {
          peersRef.current[userId].close();
          delete peersRef.current[userId];
        }
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        setRemoteUserNames((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      });

      // 2. Try to get media
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (!isMounted) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }

          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.error("Media access error:", err);
          setError("Could not access camera/mic.");
        });

      // 3. Emit join-room
      socket.emit("join-room", roomId, (session?.user as any).id, session?.user?.name, adminStatus);
    };

    // Check if user is the admin (owner) of the room
    const checkAdminStatus = async () => {
       try {
         const res = await fetch(`/api/meetings/${roomId}`);
         const data = await res.json();
         const isUserAdmin = data.adminId === (session?.user as any).id;
         setIsAdmin(isUserAdmin);
         startMeeting(isUserAdmin);
       } catch (e) {
         console.error("Error checking admin status", e);
         startMeeting(false);
       }
    };

    checkAdminStatus();

    return () => {
      isMounted = false;
      socket.disconnect();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      Object.values(peersRef.current).forEach(pc => pc.close());
    };
  }, [roomId, session, status, router]);

  const toggleMute = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        setIsScreenSharing(true);

        const videoTrack = stream.getVideoTracks()[0];
        
        Object.values(peersRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === "video");
          if (sender) sender.replaceTrack(videoTrack);
        });

        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        videoTrack.onended = () => stopScreenShare();
      } catch (e) {
        console.error("Error sharing screen", e);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    setIsScreenSharing(false);
    
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      Object.values(peersRef.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(videoTrack);
      });
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    }
  };

  const approveUser = (userId: string) => {
    socketRef.current?.emit("approve-user", roomId, userId);
    setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
  };

  const rejectUser = (userId: string) => {
    socketRef.current?.emit("reject-user", roomId, userId);
    setWaitingUsers(prev => prev.filter(u => u.userId !== userId));
  };

  const leaveRoom = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    router.push("/");
  };

  if (status === "loading") {
    return <div className="h-screen flex items-center justify-center bg-neutral-900 text-white">Loading session...</div>;
  }

  if (isRejected) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-white p-6 text-center">
        <Shield className="w-16 h-16 mb-4 text-red-500" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-neutral-400 mb-6">The meeting host declined your request to join.</p>
        <Button onClick={() => router.push("/")} variant="secondary">Return Home</Button>
      </div>
    );
  }

  if (isWaiting) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-white p-6 text-center">
        <div className="relative mb-8">
           <div className="w-20 h-20 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
           <Users className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-blue-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Waiting to join...</h2>
        <p className="text-neutral-400">The meeting host will let you in soon.</p>
      </div>
    );
  }

  const participantCount = Object.keys(remoteUserNames).length + 1;

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-white overflow-hidden">
      <div className="flex-1 p-4 grid gap-4 place-items-center overflow-y-auto auto-rows-fr" style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))`
      }}>
        {/* Local Video */}
        <div className="relative w-full h-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg border border-neutral-800 flex items-center justify-center group">
          {isVideoOff && !isScreenSharing ? (
            <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold">
              {session?.user?.name?.charAt(0)}
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${!isScreenSharing ? 'scale-x-[-1]' : ''}`}
            />
          )}
          <div className="absolute bottom-4 left-4 text-sm font-medium bg-black/60 px-3 py-1.5 rounded-md backdrop-blur-sm flex items-center gap-2">
            You {isAdmin && <Shield className="w-3 h-3 text-blue-400" />} {isMuted && <MicOff className="w-4 h-4 text-red-500" />}
          </div>
        </div>

        {/* Remote Videos - Map over UserNames to show everyone even without video yet */}
        {Object.keys(remoteUserNames).map((id) => (
          <div key={id} className="relative w-full h-full aspect-video bg-black rounded-xl overflow-hidden shadow-lg border border-neutral-800 flex items-center justify-center">
            {remoteStreams[id] ? (
              <VideoComponent stream={remoteStreams[id]} />
            ) : (
              <div className="w-24 h-24 rounded-full bg-neutral-800 flex items-center justify-center text-3xl font-bold animate-pulse">
                {remoteUserNames[id]?.charAt(0) || "U"}
              </div>
            )}
            <div className="absolute bottom-4 left-4 text-sm font-medium bg-black/60 px-3 py-1.5 rounded-md backdrop-blur-sm">
              {remoteUserNames[id] || "Participant"}
            </div>
          </div>
        ))}
      </div>

      {/* Admin Notification / Waiting List Panel */}
      {isAdmin && waitingUsers.length > 0 && (
        <div className="absolute top-6 right-6 w-80 bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl p-4 animate-in fade-in slide-in-from-top-4">
           <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-400" /> Waiting to join
              </h3>
              <span className="bg-blue-600 text-[10px] px-1.5 py-0.5 rounded-full">{waitingUsers.length}</span>
           </div>
           <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {waitingUsers.map(user => (
                <div key={user.userId} className="flex items-center justify-between bg-neutral-900/50 p-2 rounded-md border border-neutral-700">
                   <span className="text-sm truncate mr-2">{user.userName}</span>
                   <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => rejectUser(user.userId)}>
                         <X className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-green-400/10" onClick={() => approveUser(user.userId)}>
                         <Check className="h-4 w-4" />
                      </Button>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {/* Controls Bar */}
      <div className="h-20 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between px-6">
        <div className="text-neutral-400 font-medium hidden sm:flex items-center gap-2">
           <div className="bg-neutral-900 px-4 py-2 rounded-md border border-neutral-800 flex items-center gap-2">
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Meeting ID:</span>
              <span className="text-sm font-mono text-blue-400 select-all">{roomId}</span>
           </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant={isMuted ? "destructive" : "secondary"}
            size="icon"
            className="rounded-full h-12 w-12 bg-neutral-800 hover:bg-neutral-700 text-white border-none"
            onClick={toggleMute}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button
            variant={isVideoOff ? "destructive" : "secondary"}
            size="icon"
            className="rounded-full h-12 w-12 bg-neutral-800 hover:bg-neutral-700 text-white border-none"
            onClick={toggleVideo}
          >
            {isVideoOff ? <VideoOff className="h-5 w-5" /> : <VideoIcon className="h-5 w-5" />}
          </Button>
          
          <Button
            variant={isScreenSharing ? "default" : "secondary"}
            size="icon"
            className={`rounded-full h-12 w-12 border-none ${isScreenSharing ? 'bg-green-600 hover:bg-green-700' : 'bg-neutral-800 hover:bg-neutral-700'} text-white`}
            onClick={toggleScreenShare}
          >
            {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
          </Button>

          <Button
            variant="destructive"
            size="icon"
            className="rounded-full h-12 w-16 px-4 hover:bg-red-700"
            onClick={leaveRoom}
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="hidden sm:flex items-center gap-4 text-neutral-400 bg-neutral-900 px-4 py-2 rounded-full border border-neutral-800">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">{participantCount}</span>
          </div>
          {isAdmin && (
            <div className="h-4 w-[1px] bg-neutral-700" />
          )}
          {isAdmin && (
            <Shield className="h-4 w-4 text-blue-500" />
          )}
        </div>
      </div>
    </div>
  );
}

function VideoComponent({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(true);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      const checkVideo = () => setHasVideo(!!(stream.getVideoTracks()[0]?.enabled));
      checkVideo();
      stream.addEventListener("addtrack", checkVideo);
      stream.addEventListener("removetrack", checkVideo);
      return () => {
        stream.removeEventListener("addtrack", checkVideo);
        stream.removeEventListener("removetrack", checkVideo);
      };
    }
  }, [stream]);

  return (
    <>
      <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-cover ${hasVideo ? '' : 'hidden'}`} />
      {!hasVideo && (
         <div className="w-24 h-24 rounded-full bg-neutral-800 flex items-center justify-center text-3xl font-bold">U</div>
      )}
    </>
  );
}
