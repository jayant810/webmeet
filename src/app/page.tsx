"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Video, Keyboard, Link as LinkIcon, Plus, Copy, Check, LogOut } from "lucide-react";    
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSession, signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);

  if (status === "loading") return <div className="h-screen flex items-center justify-center">Loading...</div>;
  if (!session) {
    router.push("/login");
    return null;
  }

  const createMeeting = async (isInstant = true) => {
    const roomId = uuidv4();
    try {
      // Create meeting in database via an API route (we'll create this next)
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });

      if (!res.ok) throw new Error("Failed to create meeting");

      if (isInstant) {
        router.push(`/room/${roomId}`);
      } else {
        const link = `${window.location.origin}/room/${roomId}`;
        setGeneratedLink(link);
        setIsDialogOpen(true);
      }
    } catch (error) {
      toast.error("Error creating meeting");
      console.error(error);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const joinMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      const code = roomCode.trim().split("/").pop();
      router.push(`/room/${code}`);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Video className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-semibold text-gray-700">WebMeet</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{session.user?.name}</p>
            <p className="text-xs text-gray-500">{session.user?.email}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="cursor-pointer border">
                <AvatarImage src={session.user?.image || ""} />
                <AvatarFallback>{session.user?.name?.charAt(0)}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => signOut()} className="text-red-600 cursor-pointer">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 -mt-10">
        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-medium text-gray-800 mb-4 leading-tight">
              Video meetings for everyone.
            </h1>
            <p className="text-lg text-gray-500 mb-8">
              Connect, collaborate, and celebrate from anywhere with WebMeet.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-md h-12 px-6">
                    <Video className="w-5 h-5 mr-2" />
                    New meeting
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => createMeeting(false)} className="py-3 cursor-pointer">
                    <LinkIcon className="w-4 h-4 mr-2" />
                    Create a meeting for later
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => createMeeting(true)} className="py-3 cursor-pointer">
                    <Plus className="w-4 h-4 mr-2" />
                    Start an instant meeting
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <form onSubmit={joinMeeting} className="flex w-full sm:w-auto items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input 
                    placeholder="Enter a code or link" 
                    className="pl-10 h-12 border-gray-300 focus:border-blue-500 focus:ring-blue-500 rounded-md"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                  />
                </div>
                <Button 
                  type="submit"
                  variant="ghost" 
                  disabled={!roomCode.trim()}
                  className="text-blue-600 font-medium hover:bg-blue-50 h-12 px-4"
                >
                  Join
                </Button>
              </form>
            </div>

            <div className="mt-8 pt-8 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                <span className="text-blue-600 cursor-pointer hover:underline">Learn more</span> about WebMeet
              </p>
            </div>
          </div>
          
          <div className="hidden lg:flex justify-center">
             <div className="relative w-80 h-80 rounded-full bg-blue-50 flex items-center justify-center">
                <div className="w-64 h-64 rounded-full bg-blue-100 flex items-center justify-center">
                  <Video className="w-32 h-32 text-blue-600 opacity-80" />
                </div>
             </div>
          </div>
        </div>
      </main>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Here&apos;s the link to your meeting</DialogTitle>
            <DialogDescription>
              Copy this link and send it to people you want to meet with. Be sure to save it so you can use it later too.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 bg-slate-100 p-3 rounded-md mt-2">
            <div className="grid flex-1 gap-2">
              <p className="text-sm font-medium break-all">
                {generatedLink}
              </p>
            </div>
            <Button size="icon" variant="ghost" onClick={copyToClipboard} className="h-8 w-8">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
