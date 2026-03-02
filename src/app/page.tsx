"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Video, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");

  const startMeeting = () => {
    const roomId = uuidv4();
    router.push(`/room/${roomId}`);
  };

  const joinMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      router.push(`/room/${roomCode.trim()}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-900">
      <header className="p-4 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Video className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-slate-800">WebMeet</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center lg:flex-row lg:text-left lg:gap-20">
        <div className="max-w-xl">
          <h1 className="text-4xl sm:text-5xl font-normal text-slate-900 mb-6 tracking-tight">
            Premium video meetings. Now free for everyone.
          </h1>
          <p className="text-lg text-slate-600 mb-10">
            We re-engineered the service we built for secure business meetings, WebMeet, to make it free and available for all.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Button onClick={startMeeting} size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-md h-12 px-6">
              <Video className="w-5 h-5 mr-2" />
              New meeting
            </Button>
            
            <form onSubmit={joinMeeting} className="flex w-full sm:w-auto items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Keyboard className="w-5 h-5 text-slate-500" />
                </div>
                <Input
                  type="text"
                  placeholder="Enter a code or link"
                  className="pl-10 h-12 rounded-md"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                />
              </div>
              <Button type="submit" variant="ghost" className="h-12 px-4 text-slate-600 hover:text-blue-600" disabled={!roomCode.trim()}>
                Join
              </Button>
            </form>
          </div>
          
          <div className="mt-8 border-t pt-6 text-sm text-slate-500">
            <a href="#" className="text-blue-600 hover:underline">Learn more</a> about WebMeet.
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="relative w-80 h-80 rounded-full border border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden shadow-sm">
             <div className="flex flex-col items-center space-y-4 text-slate-400">
               <Video className="w-16 h-16" />
               <span className="text-sm font-medium">Get a link you can share</span>
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}
