"use client";
// Meeting room page — uses VideoMeet component (ported from SparkMeet)
// URL: /connect/meeting?room=<code>
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { usePersona } from "@/components/connect";

// VideoMeet uses WebRTC + Socket.IO — must be client-only, no SSR
const VideoMeet = dynamic(() => import("@/components/VideoMeet"), { ssr: false });

function MeetingRoom() {
  const params = useSearchParams();
  const router = useRouter();
  const { info } = usePersona();

  const roomCode = params.get("room") ?? "gurukool-room";
  const displayName = info?.current?.label ?? "Student";

  const handleLeave = () => {
    router.push("/connect?tab=meetings");
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#010430]">
      <VideoMeet
        roomCode={roomCode}
        displayName={displayName}
        onLeave={handleLeave}
      />
    </div>
  );
}

export default function MeetingPage() {
  return (
    <Suspense>
      <MeetingRoom />
    </Suspense>
  );
}
