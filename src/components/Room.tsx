"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function Room({ roomId }: { roomId: string }) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const router = useRouter();

  // Ice servers (STUN)
  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  useEffect(() => {
    let isMounted = true;

    // Initialize socket connection
    const socket = io({
      path: "/socket.io/",
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (isMounted) setIsConnected(true);
    });

    // Request user media
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        setLocalStream(stream);
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Wait for socket to be connected to get an ID
        const joinRoom = () => {
          if (socket.id) {
            socket.emit("join-room", roomId, socket.id);
          } else {
            socket.once("connect", () => {
              socket.emit("join-room", roomId, socket.id);
            });
          }
        };

        joinRoom();

        // A new user has connected, initialize a peer connection to them
        socket.on("user-connected", async (userId: string) => {
          if (!userId) return;
          const pc = createPeerConnection(userId, stream, socket);
          peersRef.current[userId] = pc;

          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("offer", {
              target: userId,
              caller: socket.id,
              sdp: offer,
            });
          } catch (e) {
            console.error("Error creating offer", e);
          }
        });

        // We received an offer from another user
        socket.on("offer", async (payload: { caller: string, sdp: RTCSessionDescriptionInit }) => {
          const pc = createPeerConnection(payload.caller, stream, socket);
          peersRef.current[payload.caller] = pc;

          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit("answer", {
              target: payload.caller,
              caller: socket.id,
              sdp: answer,
            });
          } catch (e) {
            console.error("Error handling offer", e);
          }
        });

        // We received an answer to our offer
        socket.on("answer", async (payload: { caller: string, sdp: RTCSessionDescriptionInit }) => {
          const pc = peersRef.current[payload.caller];
          if (pc) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } catch (e) {
              console.error("Error setting remote description from answer", e);
            }
          }
        });

        // We received an ICE candidate
        socket.on("ice-candidate", async (incoming: { caller: string, candidate: RTCIceCandidateInit }) => {
          const pc = peersRef.current[incoming.caller];
          if (pc && pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(incoming.candidate));
            } catch (e) {
              console.error("Error adding received ice candidate", e);
            }
          }
        });

        // A user disconnected
        socket.on("user-disconnected", (userId: string) => {
          if (peersRef.current[userId]) {
            peersRef.current[userId].close();
            delete peersRef.current[userId];
          }
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
        });
      })
      .catch((err) => {
        console.error("Failed to get local stream", err);
        if (isMounted) {
          setError("Failed to access camera and microphone. Please ensure permissions are granted.");
        }
      });

    return () => {
      isMounted = false;
      socket.disconnect();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      Object.values(peersRef.current).forEach((pc) => pc.close());
      peersRef.current = {};
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const createPeerConnection = (userId: string, stream: MediaStream, socket: Socket) => {
    const pc = new RTCPeerConnection(iceServers);

    // Add local tracks to peer connection
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Send local ICE candidates to the remote peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          target: userId,
          caller: socket.id,
          candidate: event.candidate,
        });
      }
    };

    // When we receive remote tracks, add them to state
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStreams((prev) => ({
          ...prev,
          [userId]: event.streams[0],
        }));
      }
    };

    return pc;
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const leaveRoom = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    socketRef.current?.disconnect();
    router.push("/");
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-white p-6 text-center">
        <VideoOff className="w-16 h-16 mb-4 text-red-500" />
        <h2 className="text-2xl font-bold mb-2">Camera/Microphone Error</h2>
        <p className="text-neutral-400 max-w-md mb-6">{error}</p>
        <Button onClick={() => router.push("/")} variant="secondary">Return Home</Button>
      </div>
    );
  }

  // Calculate layout grid based on participant count
  const participantCount = Object.keys(remoteStreams).length + 1; // including local user
  let gridClass = "grid-cols-1";
  if (participantCount === 2) gridClass = "sm:grid-cols-2";
  else if (participantCount >= 3 && participantCount <= 4) gridClass = "grid-cols-2";
  else if (participantCount >= 5 && participantCount <= 9) gridClass = "grid-cols-3";
  else if (participantCount >= 10) gridClass = "grid-cols-4";

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-white">
      <div className={`flex-1 p-4 grid gap-4 place-items-center overflow-y-auto ${gridClass} auto-rows-fr`}>
        {/* Local Video */}
        <div className="relative w-full h-full max-h-[80vh] aspect-video bg-black rounded-xl overflow-hidden shadow-lg border border-neutral-800 flex items-center justify-center">
          {isVideoOff ? (
            <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold">
              You
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform scale-x-[-1]"
            />
          )}
          <div className="absolute bottom-4 left-4 text-sm font-medium bg-black/60 px-3 py-1.5 rounded-md backdrop-blur-sm flex items-center gap-2">
            You {isMuted && <MicOff className="w-4 h-4 text-red-500" />}
          </div>
        </div>

        {/* Remote Videos */}
        {Object.entries(remoteStreams).map(([id, stream]) => (
          <div key={id} className="relative w-full h-full max-h-[80vh] aspect-video bg-black rounded-xl overflow-hidden shadow-lg border border-neutral-800 flex items-center justify-center">
            <VideoComponent stream={stream} />
            <div className="absolute bottom-4 left-4 text-sm font-medium bg-black/60 px-3 py-1.5 rounded-md backdrop-blur-sm">
              Participant
            </div>
          </div>
        ))}
      </div>

      <div className="h-20 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between px-6">
        <div className="text-neutral-400 font-medium hidden sm:flex items-center gap-2">
           <span className="truncate max-w-[200px] bg-neutral-900 px-3 py-1.5 rounded-md border border-neutral-800 text-xs font-mono select-all">
             {roomId}
           </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant={isMuted ? "destructive" : "secondary"}
            size="icon"
            className={`rounded-full h-12 w-12 transition-colors ${!isMuted ? 'bg-neutral-800 hover:bg-neutral-700 text-white' : ''}`}
            onClick={toggleMute}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button
            variant={isVideoOff ? "destructive" : "secondary"}
            size="icon"
            className={`rounded-full h-12 w-12 transition-colors ${!isVideoOff ? 'bg-neutral-800 hover:bg-neutral-700 text-white' : ''}`}
            onClick={toggleVideo}
          >
            {isVideoOff ? <VideoOff className="h-5 w-5" /> : <VideoIcon className="h-5 w-5" />}
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
          {!isConnected && <span className="text-xs text-yellow-500 animate-pulse">Connecting...</span>}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">{participantCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoComponent({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Basic track checking to simulate video off state
  const [hasVideo, setHasVideo] = useState(true);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      
      const checkVideo = () => {
        const videoTrack = stream.getVideoTracks()[0];
        setHasVideo(!!(videoTrack && videoTrack.enabled));
      };

      checkVideo();
      // Optional: listen for track changes
      stream.onaddtrack = checkVideo;
      stream.onremovetrack = checkVideo;
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${hasVideo ? '' : 'hidden'}`}
      />
      {!hasVideo && (
         <div className="w-24 h-24 rounded-full bg-blue-800 flex items-center justify-center text-3xl font-bold">
            U
         </div>
      )}
    </>
  );
}
