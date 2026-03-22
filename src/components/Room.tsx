"use client";

import { useEffect, useRef, useState, useCallback, memo, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Users, 
  Monitor, MonitorOff, UserPlus, X, Check, Shield, MessageSquare, 
  Smile, Share2, Info, Send, Copy, RefreshCw, Hand, Pin, PinOff, MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// --- Types ---
interface ParticipantOverlayProps {
  number?: number;
  name: string;
  image?: string | null;
  isMe?: boolean;
  isAdmin?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isHandRaised?: boolean;
  isSharing?: boolean;
  isPinned?: boolean;
  isPresentation?: boolean;
}

interface UserState {
  isMuted: boolean;
  isVideoOff: boolean;
  isHandRaised: boolean;
  isSharing: boolean;
  screenStreamId?: string;
  cameraStreamId?: string;
  image?: string | null;
}

interface ChatMessage { userId: string; userName: string; text: string; timestamp: string; }

// --- Sub-components ---

const ParticipantOverlay = memo(({ number, name, isMe, isMuted, isHandRaised, isSharing, isPinned, isPresentation }: ParticipantOverlayProps) => (
  <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between z-10">
    <div className="flex justify-end gap-2">
      {isPinned && <div className="bg-blue-600/90 p-1.5 rounded-full backdrop-blur-md border border-white/10 shadow-lg pointer-events-auto cursor-pointer"><Pin className="w-3.5 h-3.5 text-white fill-current" /></div>}
      {isHandRaised && <div className="bg-yellow-500 p-1.5 rounded-full backdrop-blur-md border border-white/10 shadow-lg animate-bounce"><Hand className="w-3.5 h-3.5 text-black fill-current" /></div>}
    </div>
    <div className="flex items-center gap-2 max-w-[90%]">
      <div className="bg-[#202124]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-2 text-white shadow-xl overflow-hidden shrink-0 text-xs">
        {number && <span className="font-bold text-blue-300 shrink-0">{number}.</span>}
        <span className="font-semibold truncate">{isPresentation ? `${name}'s Presentation` : (isMe ? `${name} (You)` : name)}</span>
        {isPresentation && <span className="text-[9px] bg-blue-600 px-1.5 py-0.5 rounded-sm font-black tracking-widest uppercase text-white ml-1">Presentation</span>}
        {isMuted && !isPresentation && <MicOff className="w-3.5 h-3.5 text-red-400 shrink-0 ml-1" />}
      </div>
    </div>
  </div>
));
ParticipantOverlay.displayName = "ParticipantOverlay";

const VideoTile = memo(({ stream, isVideoOff, name, image, overlayProps, isLocal, isMuted }: { 
  stream: MediaStream | null; isVideoOff?: boolean; name: string; image?: string | null; overlayProps: ParticipantOverlayProps; isLocal?: boolean; isMuted?: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (videoRef.current && stream && !isVideoOff) {
      if (videoRef.current.srcObject !== stream) videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, isVideoOff]);

  return (
    <div className={cn("relative bg-[#1a1b1e] rounded-2xl overflow-hidden shadow-2xl border-2 flex items-center justify-center group transition-all duration-500 w-full h-full", overlayProps.isPinned ? "border-blue-500 ring-4 ring-blue-500/20" : "border-transparent hover:border-white/5")}>
      {!isVideoOff && stream ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal || isMuted} className={cn("w-full h-full object-contain transition-transform duration-700", isLocal && !overlayProps.isPresentation && "scale-x-[-1]")} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-4">
          <Avatar className="w-24 h-24 sm:w-36 sm:h-32 text-4xl shadow-2xl border-4 border-white/5">
            {image && <AvatarImage src={image} className="object-cover" />}
            <AvatarFallback className={cn("text-white font-black uppercase transition-colors duration-500", isLocal ? "bg-blue-600" : "bg-[#5f6368]")}>
              {name.charAt(0)}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      <ParticipantOverlay {...overlayProps} isMe={isLocal} name={name} image={image} isVideoOff={isVideoOff} />
    </div>
  );
});
VideoTile.displayName = "VideoTile";

const OverflowTile = memo(({ count, onClick }: { count: number; onClick: () => void }) => (
  <div onClick={onClick} className="relative bg-[#3c4043] rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center justify-center group cursor-pointer hover:bg-[#4a4e52] transition-all duration-300 w-full h-full border-2 border-transparent">
    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#5f6368] flex items-center justify-center mb-3 shadow-lg border border-white/10 group-hover:bg-blue-600 group-hover:scale-110 transition-all"><span className="text-xl font-black text-white">+{count}</span></div>
    <span className="text-xs text-neutral-300 font-bold tracking-tight uppercase text-center px-2 font-mono">View {count} more</span>
  </div>
));
OverflowTile.displayName = "OverflowTile";

export default function Room({ roomId }: { roomId: string }) {
  const { data: session, status } = useSession();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteUserNames, setRemoteUserNames] = useState<Record<string, { name: string, image?: string | null }>>({});
  const [remoteStates, setRemoteStates] = useState<Record<string, UserState>>({});
  
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [pinnedUser, setPinnedUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [waitingUsers, setWaitingUsers] = useState<any[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"chat" | "participants" | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const initializedRef = useRef(false);
  const makingOfferRef = useRef<Record<string, boolean>>({});
  const router = useRouter();
  const currentUserId = (session?.user as any)?.id;

  const sortedParticipants = useMemo(() => {
    const list: any[] = [];
    if (!currentUserId) return list;
    
    list.push({ id: currentUserId, name: session?.user?.name || "You", image: session?.user?.image, isMe: true, isAdmin, isMuted, isVideoOff, isHandRaised, isSharing: false, isPinned: pinnedUser === currentUserId, stream: localStream });
    if (isScreenSharing && localScreenStream) list.push({ id: currentUserId + "-screen", name: session?.user?.name || "You", isMe: true, isSharing: true, isPinned: pinnedUser === currentUserId + "-screen", isPresentation: true, stream: localScreenStream, isVideoOff: false });

    Object.entries(remoteUserNames).forEach(([id, data]) => {
      const state = remoteStates[id] || { isMuted: false, isVideoOff: false, isHandRaised: false, isSharing: false };
      const cameraStream = state.cameraStreamId ? remoteStreams[state.cameraStreamId] : null;
      list.push({ id, name: data.name, image: data.image, isMe: false, isAdmin: false, ...state, isSharing: false, isPinned: pinnedUser === id, stream: cameraStream });
      if (state.isSharing && state.screenStreamId) {
        const screenStream = remoteStreams[state.screenStreamId];
        if (screenStream) list.push({ id: id + "-screen", name: data.name, isMe: false, isAdmin: false, isSharing: true, isPinned: pinnedUser === id + "-screen", isPresentation: true, stream: screenStream, isVideoOff: false });
      }
    });

    return list.sort((a, b) => {
      if (a.isPresentation !== b.isPresentation) return a.isPresentation ? -1 : 1;
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      return 0;
    });
  }, [currentUserId, session?.user, isAdmin, isMuted, isVideoOff, isHandRaised, isScreenSharing, localStream, localScreenStream, remoteUserNames, remoteStates, remoteStreams, pinnedUser]);

  const activePresenter = useMemo(() => sortedParticipants.find(p => p.isPresentation), [sortedParticipants]);
  const visibleParticipants = sortedParticipants.slice(0, sidebarTab ? (activePresenter ? 4 : 6) : 12);
  const overflowCount = sortedParticipants.length - visibleParticipants.length;

  const getGridClass = (count: number) => {
    if (count === 1) return "grid-cols-1 max-w-5xl";
    if (count === 2) return "grid-cols-1 sm:grid-cols-2 max-w-6xl";
    return "grid-cols-2 sm:grid-cols-3 max-w-7xl";
  };

  const triggerNegotiation = async (userId: string) => {
    const pc = peersRef.current[userId];
    if (!pc || pc.signalingState !== "stable") return;
    try {
      makingOfferRef.current[userId] = true;
      await pc.setLocalDescription();
      socketRef.current?.emit("offer", { target: userId, sdp: pc.localDescription });
    } catch (err) { console.error(`[WebRTC] Negotiation error for ${userId}:`, err); }
    finally { makingOfferRef.current[userId] = false; }
  };

  const getMedia = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: 1.7777 }, 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });
      localStreamRef.current = stream; setLocalStream(stream);
      Object.entries(peersRef.current).forEach(([id, pc]) => { if (pc.signalingState !== "closed") stream.getTracks().forEach(track => pc.addTrack(track, stream)); });
      return stream;
    } catch (err) { toast.error("Camera failed."); return null; }
  };

  useEffect(() => {
    if (status !== "authenticated" || !currentUserId || initializedRef.current) return;
    initializedRef.current = true;

    const signalingServer = process.env.NEXT_PUBLIC_SIGNALING_SERVER || window.location.origin;
    const socket = io(signalingServer, { path: "/socket.io/", transports: ["websocket"], reconnection: true, withCredentials: true });
    socketRef.current = socket;

    const createPeerConnection = (userId: string) => {
      if (peersRef.current[userId]) return peersRef.current[userId];
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peersRef.current[userId] = pc;
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
      }
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localScreenStreamRef.current!));
      }
      
      pc.onicecandidate = ({ candidate }) => { if (candidate) socket.emit("ice-candidate", { target: userId, candidate }); };
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          setRemoteStreams(prev => ({ ...prev, [stream.id]: stream }));
          setRemoteStates(prev => {
            const userState = prev[userId] || { isMuted: false, isVideoOff: false, isHandRaised: false, isSharing: false };
            if (stream.id !== userState.screenStreamId && !userState.cameraStreamId) return { ...prev, [userId]: { ...userState, cameraStreamId: stream.id } };
            return prev;
          });
        }
      };
      pc.onnegotiationneeded = () => triggerNegotiation(userId);
      return pc;
    };

    socket.on("connect", () => {
      fetch(`/api/meetings/${roomId}`).then(res => res.json()).then(data => {
        const isUserAdmin = data.adminId === currentUserId; setIsAdmin(isUserAdmin);
        socket.emit("join-room", roomId, currentUserId, session?.user?.name, isUserAdmin, data.invitedEmails?.includes(session?.user?.email), session?.user?.image);
      });
    });

    socket.on("join-approved", async () => {
      setIsWaiting(false);
      // Fast join: notify ready immediately, get media in parallel
      socket.emit("ready-to-connect", roomId, currentUserId, session?.user?.name, session?.user?.image);
      getMedia();
    });

    socket.on("request-to-join", (user: any) => setWaitingUsers(prev => prev.find(u => u.userId === user.userId) ? prev : [...prev, user]));
    
    socket.on("user-connected", (userId: string, userName: string, userImage: string | null) => {
      setRemoteUserNames(prev => ({ ...prev, [userId]: { name: userName, image: userImage } }));
      createPeerConnection(userId);
    });

    socket.on("room-participants", (users: any[]) => users.forEach(u => {
      setRemoteUserNames(prev => ({ ...prev, [u.userId]: { name: u.userName, image: u.userImage } }));
      createPeerConnection(u.userId);
    }));

    socket.on("offer", async ({ sdp, caller }) => {
      const pc = peersRef.current[caller] || createPeerConnection(caller);
      const polite = currentUserId < caller;
      if (!polite && (makingOfferRef.current[caller] || pc.signalingState !== "stable")) return;
      try {
        await pc.setRemoteDescription(sdp);
        await pc.setLocalDescription();
        socket.emit("answer", { target: caller, sdp: pc.localDescription });
      } catch (err) { console.error("Offer error:", err); }
    });

    socket.on("answer", async ({ sdp, caller }) => { const pc = peersRef.current[caller]; if (pc) await pc.setRemoteDescription(sdp); });
    socket.on("ice-candidate", async ({ candidate, caller }) => { const pc = peersRef.current[caller]; if (pc) try { await pc.addIceCandidate(candidate); } catch (e) {} });
    
    socket.on("user-disconnected", (userId: string) => {
      if (peersRef.current[userId]) { peersRef.current[userId].close(); delete peersRef.current[userId]; }
      setRemoteUserNames(prev => { const n = {...prev}; delete n[userId]; return n; });
      setRemoteStates(prev => { const n = {...prev}; delete n[userId]; return n; });
    });

    socket.on("user-mute-status", ({ userId, isMuted }) => setRemoteStates(prev => ({ ...prev, [userId]: { ...prev[userId], isMuted } })));
    socket.on("user-video-status", ({ userId, isVideoOff }) => setRemoteStates(prev => ({ ...prev, [userId]: { ...prev[userId], isVideoOff } })));
    socket.on("user-hand-status", ({ userId, isRaised }) => setRemoteStates(prev => ({ ...prev, [userId]: { ...prev[userId], isHandRaised: isRaised } })));
    socket.on("user-screen-share-status", ({ userId, isSharing, streamId }) => {
      setRemoteStates(prev => ({ ...prev, [userId]: { ...prev[userId], isSharing, screenStreamId: streamId } }));
    });

    socket.on("chat-message", (message: any) => setMessages(prev => [...prev, message]));
    socket.on("waiting-for-admin", () => setIsWaiting(true));
    return () => { socket.disconnect(); };
  }, [roomId, currentUserId, session?.user, status]);

  const toggleMute = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); socketRef.current?.emit("toggle-mute", roomId, currentUserId, !t.enabled); }
  };

  const toggleVideo = () => {
    const t = localStreamRef.current?.getVideoTracks()[0]; 
    if (t) { 
      t.enabled = !t.enabled; 
      const next = !t.enabled;
      setIsVideoOff(next); 
      socketRef.current?.emit("toggle-video", roomId, currentUserId, next);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      localScreenStreamRef.current?.getTracks().forEach(t => t.stop()); setIsScreenSharing(false); setLocalScreenStream(null); localScreenStreamRef.current = null;
      socketRef.current?.emit("toggle-screen-share", roomId, currentUserId, false, null);
      Object.keys(peersRef.current).forEach(id => triggerNegotiation(id));
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        localScreenStreamRef.current = stream; setLocalScreenStream(stream); setIsScreenSharing(true);
        socketRef.current?.emit("toggle-screen-share", roomId, currentUserId, true, stream.id);
        Object.values(peersRef.current).forEach(pc => pc.addTrack(stream.getVideoTracks()[0], stream));
        stream.getVideoTracks()[0].onended = () => toggleScreenShare();
        Object.keys(peersRef.current).forEach(id => triggerNegotiation(id));
      } catch (err) { console.error("ScreenShare Error:", err); }
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim() || !socketRef.current) return;
    const msg = { userId: currentUserId, userName: session?.user?.name || "Unknown", text: newMessage, timestamp: new Date().toISOString() };
    socketRef.current.emit("chat-message", roomId, msg); setMessages(prev => [...prev, msg]); setNewMessage("");
  };

  const leaveRoom = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localScreenStreamRef.current?.getTracks().forEach(t => t.stop());
    router.push("/");
  };

  if (status === "loading") return <div className="h-screen flex items-center justify-center bg-[#202124] text-white">Loading...</div>;
  if (isRejected) return <div className="h-screen flex items-center justify-center bg-[#202124] text-white font-black uppercase tracking-widest">Access Denied</div>;
  if (isWaiting) return <div className="h-screen flex items-center justify-center bg-[#202124] text-white font-black tracking-widest animate-pulse">Waiting for host...</div>;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-[#202124] text-white overflow-hidden relative select-none font-sans">
        <div className="flex-1 flex overflow-hidden relative">
          <div className={cn("flex-1 flex flex-col items-center justify-center p-4 transition-all duration-500 ease-in-out", sidebarTab ? "mr-[350px]" : "mr-0")}>
            {activePresenter ? (
              <div className="w-full h-full flex flex-col md:flex-row gap-4 max-w-[1600px]">
                <div className="flex-[7] min-h-0 bg-black rounded-3xl overflow-hidden relative shadow-2xl border border-white/5"><VideoTile stream={activePresenter.stream} name={activePresenter.name} image={activePresenter.image} overlayProps={{ ...activePresenter }} isLocal={activePresenter.isMe} /></div>
                <div className="flex-[2] md:w-72 overflow-y-auto flex flex-row md:flex-col gap-4 p-1 content-start scrollbar-hide">
                  {sortedParticipants.filter(p => p.id !== activePresenter.id).slice(0, 5).map((p, i) => (
                    <div key={p.id} className="w-full aspect-video shrink-0"><VideoTile stream={p.stream} isVideoOff={p.isVideoOff} name={p.name} image={p.image} overlayProps={{ ...p, number: i + 2 }} isLocal={p.isMe} isMuted={p.isMuted} /></div>
                  ))}
                  {sortedParticipants.length > 6 && <div className="w-full aspect-video shrink-0"><OverflowTile count={sortedParticipants.length - 6} onClick={() => setSidebarTab("participants")} /></div>}
                </div>
              </div>
            ) : (
              <div className={cn("grid gap-4 w-full h-full transition-all duration-500 items-center justify-items-center place-content-center", getGridClass(visibleParticipants.length + (overflowCount > 0 ? 1 : 0)))}>
                {visibleParticipants.map((p, index) => (
                  <div key={p.id} className="aspect-video relative group cursor-pointer w-full h-full" onClick={() => setPinnedUser(pinnedUser === p.id ? null : p.id)}><VideoTile stream={p.stream} isVideoOff={p.isVideoOff} name={p.name} image={p.image} overlayProps={{ ...p, number: index + 1 }} isLocal={p.isMe} isMuted={p.isMuted} /></div>
                ))}
                {overflowCount > 0 && <div className="aspect-video w-full h-full"><OverflowTile count={overflowCount} onClick={() => setSidebarTab("participants")} /></div>}
              </div>
            )}
          </div>
          <div className={cn("fixed top-4 right-4 bottom-28 w-[340px] bg-white text-neutral-900 rounded-3xl shadow-2xl flex flex-col z-40 transition-transform duration-500 ease-in-out border border-neutral-200 overflow-hidden", sidebarTab ? "translate-x-0" : "translate-x-[400px]")}>
            <div className="p-5 border-b flex items-center justify-between"><h3 className="font-black text-xl capitalize flex items-center gap-2 tracking-tighter">{sidebarTab}</h3><Button variant="ghost" size="icon" className="rounded-full hover:bg-neutral-100" onClick={() => setSidebarTab(null)}><X /></Button></div>
            <ScrollArea className="flex-1 p-4">
              {sidebarTab === "participants" ? (
                <div className="space-y-3">
                  {sortedParticipants.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-neutral-50 transition-colors border border-transparent hover:border-neutral-100 shadow-sm">
                      <Avatar className="h-11 w-11 shrink-0 shadow-sm">
                        {p.image && <AvatarImage src={p.image} className="object-cover" />}
                        <AvatarFallback className={cn("text-white font-black", p.isMe ? "bg-blue-600" : "bg-neutral-500")}>{p.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col flex-1 min-w-0"><span className="text-sm font-bold truncate">{p.isPresentation ? `${p.name}'s Presentation` : p.name} {p.isMe && "(You)"}</span><div className="flex gap-2 items-center">{p.isAdmin && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black tracking-widest uppercase">Host</span>}{p.isPresentation && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-black tracking-widest uppercase text-white">Presenting</span>}</div></div>
                      <div className="flex gap-1.5 text-neutral-400">{p.isMuted && <MicOff className="w-4 h-4 text-red-500" />}{p.isVideoOff && <VideoOff className="w-4 h-4 text-neutral-400" />}{p.isHandRaised && <Hand className="w-4 h-4 text-yellow-500 fill-current" />}<Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setPinnedUser(pinnedUser === p.id ? null : p.id)}><Pin className={cn("w-4 h-4", p.isPinned ? "text-blue-600 fill-current" : "text-neutral-300")} /></Button></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 px-2">
                  {messages.map((m, i) => (
                    <div key={i} className="flex flex-col gap-1.5"><div className="flex items-center justify-between px-1"><span className="text-[10px] font-black text-neutral-900 uppercase tracking-tighter">{m.userName}</span><span className="text-[9px] text-neutral-400 font-bold">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><div className="text-sm text-neutral-700 bg-neutral-100 p-3 rounded-2xl rounded-tl-none inline-block w-fit max-w-[95%] break-words shadow-sm border border-neutral-200/50 leading-relaxed font-medium">{m.text}</div></div>
                  ))}
                </div>
              )}
            </ScrollArea>
            {sidebarTab === "chat" && (
              <div className="p-5 border-t flex gap-3 items-center bg-neutral-50/50">
                 <Input placeholder="Send a message" className="bg-white border-neutral-200 rounded-2xl h-12 px-5 text-sm shadow-sm focus-visible:ring-blue-500 font-medium" value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} />
                 <Button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 rounded-2xl h-12 w-12 p-0 shrink-0 shadow-lg shadow-blue-600/20"><Send className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        </div>
        <div className="h-24 bg-[#202124] flex items-center justify-between px-8 z-50">
          <div className="hidden md:flex items-center gap-4 w-1/4 opacity-50 font-black tracking-widest text-xs uppercase">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="flex items-center gap-4">
            <Button variant={isMuted ? "destructive" : "secondary"} size="icon" className="rounded-full h-12 w-12 bg-[#3c4043] border-none text-white hover:bg-[#4a4e52] transition-all hover:scale-110 active:scale-95 shadow-lg" onClick={toggleMute}>{isMuted ? <MicOff /> : <Mic />}</Button>
            <Button variant={isVideoOff ? "destructive" : "secondary"} size="icon" className="rounded-full h-12 w-12 bg-[#3c4043] border-none text-white hover:bg-[#4a4e52] transition-all hover:scale-110 active:scale-95 shadow-lg" onClick={toggleVideo}>{isVideoOff ? <VideoOff /> : <VideoIcon />}</Button>
            <Button variant={isHandRaised ? "default" : "secondary"} size="icon" className={cn("rounded-full h-12 w-12 border-none transition-all hover:scale-110 active:scale-95 shadow-lg", isHandRaised ? "bg-yellow-500 text-black" : "bg-[#3c4043] text-white hover:bg-[#4a4e52]")} onClick={() => { const next = !isHandRaised; setIsHandRaised(next); socketRef.current?.emit("toggle-hand", roomId, currentUserId, next); }}><Hand /></Button>
            <Button variant={isScreenSharing ? "default" : "secondary"} size="icon" className={cn("rounded-full h-12 w-12 border-none transition-all hover:scale-110 active:scale-95 shadow-lg", isScreenSharing ? "bg-blue-600 text-white" : "bg-[#3c4043] text-white hover:bg-[#4a4e52]")} onClick={toggleScreenShare}><Monitor /></Button>
            <Button variant="destructive" className="rounded-full px-8 h-12 ml-4 font-black tracking-tighter uppercase shadow-xl shadow-red-600/20 hover:scale-105 active:scale-95" onClick={leaveRoom}><PhoneOff className="mr-2 w-5 h-5" /> Leave</Button>
          </div>
          <div className="flex items-center gap-3 w-1/4 justify-end">
            <Button variant="ghost" size="icon" className={cn("rounded-full h-11 w-11 transition-all", sidebarTab === "participants" ? "bg-blue-600/20 text-blue-400" : "text-neutral-400 hover:bg-white/5")} onClick={() => setSidebarTab(sidebarTab === "participants" ? null : "participants")}><Users /><span className="absolute -top-1 -right-1 bg-blue-600 text-[10px] rounded-full px-1.5 border border-[#202124]">{sortedParticipants.length}</span></Button>
            <Button variant="ghost" size="icon" className={cn("rounded-full h-11 w-11 relative transition-all", sidebarTab === "chat" ? "bg-blue-600/20 text-blue-400" : "text-neutral-400 hover:bg-white/5")} onClick={() => setSidebarTab(sidebarTab === "chat" ? null : "chat")}><MessageSquare /></Button>
          </div>
        </div>
        {isAdmin && waitingUsers.length > 0 && (
          <div className="absolute top-6 left-6 w-80 bg-white text-neutral-900 rounded-3xl p-6 shadow-2xl z-50 border border-neutral-200 animate-in fade-in zoom-in-95 duration-500">
             <h3 className="font-black text-xs mb-5 flex items-center gap-2 text-blue-600 uppercase tracking-widest"><Shield className="h-4 w-4" /> Entry Request</h3>
             <div className="space-y-4">
               {waitingUsers.map(user => (
                 <div key={user.userId} className="flex items-center justify-between bg-neutral-50 p-4 rounded-2xl border border-neutral-100"><span className="text-sm font-black truncate flex-1 mr-3">{user.userName}</span><div className="flex gap-2"><Button size="sm" variant="ghost" className="text-red-600 font-bold hover:bg-red-50" onClick={() => { socketRef.current?.emit("reject-user", roomId, user.userId); setWaitingUsers(prev => prev.filter(u => u.userId !== user.userId)); }}>Deny</Button><Button size="sm" className="bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-md" onClick={() => { socketRef.current?.emit("approve-user", roomId, user.userId); setWaitingUsers(prev => prev.filter(u => u.userId !== user.userId)); }}>Admit</Button></div></div>
               ))}
             </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
