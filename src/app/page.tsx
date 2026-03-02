"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Video, Keyboard, Link as LinkIcon, Plus, Copy, Check } from "lucide-react";
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

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);

  const startInstantMeeting = () => {
    const roomId = uuidv4();
    router.push(`/room/${roomId}`);
  };

  const createMeetingForLater = () => {
    const roomId = uuidv4();
    const link = `${window.location.origin}/room/${roomId}`;
    setGeneratedLink(link);
    setIsDialogOpen(true);
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-md h-12 px-6">
                  <Video className="w-5 h-5 mr-2" />
                  New meeting
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={createMeetingForLater} className="py-3 cursor-pointer">
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Create a meeting for later
                </DropdownMenuItem>
                <DropdownMenuItem onClick={startInstantMeeting} className="py-3 cursor-pointer">
                  <Plus className="w-4 h-4 mr-2" />
                  Start an instant meeting
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
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
