"use client";
// ============================================================
// VideoMeet — ported from SparkMeet VideoMeet.jsx
// All WebRTC signaling, screen sharing, and chat logic is
// preserved verbatim. Only the styling (MUI → Tailwind) and
// the socket server URL have been adapted for GURUKOOL.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api } from "./ui";

// ── STUN config (preserved from SparkMeet) ──────────────────
const peerConfigConnections: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type VideoEntry = {
  socketId: string;
  stream: MediaStream;
  autoplay: boolean;
  playsinline: boolean;
};

type ChatMessage = { sender: string; data: string };

interface Props {
  roomCode: string;         // e.g. "my-room-123"
  displayName: string;      // GURUKOOL user's name
  onLeave: () => void;      // called when user ends the call
}

// Module-level peer connections map (preserved from SparkMeet).
// SparkMeet uses the legacy addStream / onaddstream WebRTC API (not in TS lib types).
// We preserve the original implementation unchanged, so the map is typed as unknown.
// eslint-disable-next-line prefer-const, @typescript-eslint/no-explicit-any
let connections: Record<string, any> = {};

export default function VideoMeet({ roomCode, displayName, onLeave }: Props) {
  const socketRef = useRef<Socket | null>(null);
  const socketIdRef = useRef<string>("");
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = useRef<VideoEntry[]>([]);

  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [video, setVideo] = useState<boolean | undefined>(undefined);
  const [audio, setAudio] = useState<boolean | undefined>(undefined);
  const [screen, setScreen] = useState<boolean | undefined>(undefined);
  const [screenAvailable, setScreenAvailable] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [remoteScreenShares, setRemoteScreenShares] = useState<Record<string, boolean>>({});

  // ── 1. Get permissions on mount (preserved from SparkMeet) ──
  useEffect(() => {
    getPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPermissions = async () => {
    try {
      const vidPerm = await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null);
      setVideoAvailable(!!vidPerm);
      const audPerm = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      setAudioAvailable(!!audPerm);
      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

      if (vidPerm || audPerm) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: !!vidPerm,
          audio: !!audPerm,
        });
        window.localStream = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }
    } catch (e) {
      console.error("Permission error", e);
    }
  };

  // ── 2. Re-negotiate when video/audio toggles (from SparkMeet) ──
  useEffect(() => {
    if (video !== undefined && audio !== undefined) {
      getUserMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, audio]);

  // ── 3. Screen share when screen state changes (from SparkMeet) ──
  useEffect(() => {
    if (screen !== undefined) getDisplayMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const getUserMediaSuccess = (stream: MediaStream) => {
    try { window.localStream?.getTracks().forEach((t) => t.stop()); } catch {}
    window.localStream = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    for (const id in connections) {
      if (id === socketIdRef.current) continue;
      connections[id].addStream(stream);
      connections[id].createOffer().then((desc: RTCSessionDescriptionInit) => {
        connections[id].setLocalDescription(desc).then(() => {
          socketRef.current?.emit("signal", id, JSON.stringify({ sdp: connections[id].localDescription }));
        });
      });
    }

    stream.getTracks().forEach((track) => {
      track.onended = () => {
        setVideo(false);
        setAudio(false);
        try { if (localVideoRef.current?.srcObject) { (localVideoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop()); } } catch {}
        const bs = blackSilence();
        window.localStream = bs;
        if (localVideoRef.current) localVideoRef.current.srcObject = bs;
        for (const id in connections) {
          connections[id].addStream(bs);
          connections[id].createOffer().then((desc: RTCSessionDescriptionInit) => {
            connections[id].setLocalDescription(desc).then(() => {
              socketRef.current?.emit("signal", id, JSON.stringify({ sdp: connections[id].localDescription }));
            });
          });
        }
      };
    });
  };

  const getUserMedia = () => {
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      navigator.mediaDevices.getUserMedia({ video: !!video, audio: !!audio })
        .then(getUserMediaSuccess)
        .catch(console.error);
    } else {
      try { (localVideoRef.current?.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop()); } catch {}
    }
  };

  const getDisplayMediaSuccess = (stream: MediaStream) => {
    try { window.localStream?.getTracks().forEach((t) => t.stop()); } catch {}
    window.localStream = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    socketRef.current?.emit("screen-share-status", true);

    for (const id in connections) {
      if (id === socketIdRef.current) continue;
      connections[id].addStream(stream);
      connections[id].createOffer().then((desc: RTCSessionDescriptionInit) => {
        connections[id].setLocalDescription(desc).then(() => {
          socketRef.current?.emit("signal", id, JSON.stringify({ sdp: connections[id].localDescription }));
        });
      });
    }

    stream.getTracks().forEach((track) => {
      track.onended = () => {
        setScreen(false);
        socketRef.current?.emit("screen-share-status", false);
        const bs = blackSilence();
        window.localStream = bs;
        if (localVideoRef.current) localVideoRef.current.srcObject = bs;
        getUserMedia();
      };
    });
  };

  const getDisplayMedia = () => {
    if (screen && navigator.mediaDevices.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        .then(getDisplayMediaSuccess)
        .catch(() => setScreen(false));
    }
  };

  const gotMessageFromServer = (fromId: string, message: string) => {
    const signal = JSON.parse(message);
    if (fromId === socketIdRef.current) return;

    if (signal.sdp) {
      connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
        if (signal.sdp.type === "offer") {
          connections[fromId].createAnswer().then((desc: RTCSessionDescriptionInit) => {
            connections[fromId].setLocalDescription(desc).then(() => {
              socketRef.current?.emit("signal", fromId, JSON.stringify({ sdp: connections[fromId].localDescription }));
            });
          });
        }
      });
    }
    if (signal.ice) {
      connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice));
    }
  };

  // ── Join call (triggered by "Connect" button) ───────────────
  const getMedia = () => {
    setVideo(videoAvailable);
    setAudio(audioAvailable);
    connectToSocketServer();
  };

  const connectToSocketServer = () => {
    // Connect to the GURUKOOL custom server Socket.IO endpoint
    socketRef.current = io({ path: "/api/socket", transports: ["websocket"] });

    socketRef.current.on("signal", gotMessageFromServer);

    socketRef.current.on("screen-share-status", (peerId: string, isSharing: boolean) => {
      setRemoteScreenShares((cur) => {
        const next = { ...cur };
        if (isSharing) next[peerId] = true;
        else delete next[peerId];
        return next;
      });
    });

    socketRef.current.on("connect", () => {
      // Use room code (URL-keyed, same as SparkMeet's window.location.href strategy)
      socketRef.current!.emit("join-call", roomCode);
      socketIdRef.current = socketRef.current!.id!;

      socketRef.current!.on("chat-message", addMessage);

      socketRef.current!.on("user-left", (id: string) => {
        setVideos((v) => v.filter((entry) => entry.socketId !== id));
      });

      socketRef.current!.on("user-joined", (id: string, clients: string[]) => {
        clients.forEach((socketListId) => {
          connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

          connections[socketListId].onicecandidate = (event: RTCPeerConnectionIceEvent) => {
            if (event.candidate) {
              socketRef.current?.emit("signal", socketListId, JSON.stringify({ ice: event.candidate }));
            }
          };


          connections[socketListId].onaddstream = (event: { stream: MediaStream }) => {
            const videoExists = videoRef.current.find((v) => v.socketId === socketListId);
            if (videoExists) {
              setVideos((vids) => {
                const updated = vids.map((v) =>
                  v.socketId === socketListId ? { ...v, stream: event.stream! } : v
                );
                videoRef.current = updated;
                return updated;
              });
            } else {
              const newEntry: VideoEntry = {
                socketId: socketListId,
                stream: event.stream!,
                autoplay: true,
                playsinline: true,
              };
              setVideos((vids) => {
                const updated = [...vids, newEntry];
                videoRef.current = updated;
                return updated;
              });
            }
          };

          if (window.localStream) {
  
            connections[socketListId].addStream(window.localStream);
          } else {
            const bs = blackSilence();
            window.localStream = bs;
  
            connections[socketListId].addStream(bs);
          }
        });

        if (id === socketIdRef.current) {
          for (const id2 in connections) {
            if (id2 === socketIdRef.current) continue;
            try {
    
              connections[id2].addStream(window.localStream);
            } catch {}
            connections[id2].createOffer().then((desc: RTCSessionDescriptionInit) => {
              connections[id2].setLocalDescription(desc).then(() => {
                socketRef.current?.emit("signal", id2, JSON.stringify({ sdp: connections[id2].localDescription }));
              });
            });
          }
        }
      });
    });
  };

  // ── Helpers (preserved from SparkMeet) ──────────────────────
  const silence = () => {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst = oscillator.connect(ctx.createMediaStreamDestination()) as MediaStreamAudioDestinationNode;
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };
  const black = ({ width = 640, height = 480 } = {}) => {
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    canvas.getContext("2d")!.fillRect(0, 0, width, height);
    const stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };
  const blackSilence = (...args: Parameters<typeof black>) =>
    new MediaStream([black(...args), silence()]);

  const addMessage = (data: string, sender: string, socketIdSender: string) => {
    setMessages((prev) => [...prev, { sender, data }]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages((n) => n + 1);
    }
  };

  const handleEndCall = () => {
    try { (localVideoRef.current?.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop()); } catch {}
    socketRef.current?.disconnect();
    // Clear module-level connections map
    for (const key in connections) delete connections[key];
    // Record meeting in history
    api("/api/meetings/add", { method: "POST", body: JSON.stringify({ meeting_code: roomCode }) }).catch(() => {});
    onLeave();
  };

  const handleSendMessage = () => {
    if (!message.trim()) return;
    socketRef.current?.emit("chat-message", message, displayName);
    setMessage("");
  };

  // ── Lobby (before joining) ───────────────────────────────────
  if (video === undefined) {
    return (
      <div className="flex flex-col items-center gap-6 p-8">
        <video ref={localVideoRef} autoPlay muted className="w-80 rounded-xl bg-gray-900" />
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-1">Joining as <b>{displayName}</b></p>
          <p className="text-xs text-gray-400">Room: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{roomCode}</code></p>
        </div>
        <button
          onClick={getMedia}
          className="btn-primary px-8 py-3 text-base"
        >
          Join Meeting
        </button>
      </div>
    );
  }

  // ── Active call UI ───────────────────────────────────────────
  return (
    <div className="relative h-full min-h-screen overflow-hidden bg-[#010430]">

      {/* Chat panel */}
      {showChat && (
        <div className="absolute right-0 top-0 z-20 flex h-[90vh] w-72 flex-col rounded-l-2xl border-l border-white/10 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b p-4">
            <h3 className="font-semibold text-gray-900">In-call Chat</h3>
            <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-xs text-center text-gray-400 mt-8">No messages yet</p>
            ) : messages.map((m, i) => (
              <div key={i} className="text-sm">
                <span className="font-semibold text-blue-700">{m.sender}</span>
                <p className="text-gray-800 mt-0.5">{m.data}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t p-3">
            <input
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type a message…"
            />
            <button onClick={handleSendMessage} className="btn-primary px-3 py-2 text-xs">Send</button>
          </div>
        </div>
      )}

      {/* Screen share stage */}
      {videos.some((v) => remoteScreenShares[v.socketId]) && (
        <section className="absolute inset-0 z-10 grid place-items-center bg-[#080b14] p-6 pb-24">
          {videos.filter((v) => remoteScreenShares[v.socketId]).map((v) => (
            <div key={`screen-${v.socketId}`} className="relative h-full w-full grid place-items-center">
              <video
                ref={(ref) => { if (ref) ref.srcObject = v.stream; }}
                autoPlay playsInline
                className="w-full h-full object-contain bg-[#080b14]"
              />
              <span className="absolute left-3.5 top-3.5 rounded-full border border-white/10 bg-gray-900/85 px-3 py-1.5 text-xs text-white">
                Screen shared by participant
              </span>
            </div>
          ))}
        </section>
      )}

      {/* Remote participants */}
      {!videos.some((v) => remoteScreenShares[v.socketId]) && (
        <div className="flex flex-wrap gap-2.5 p-3">
          {videos.map((v) => (
            <div key={v.socketId} className="overflow-hidden rounded-xl border border-white/10">
              <video
                ref={(ref) => { if (ref) ref.srcObject = v.stream; }}
                autoPlay playsInline
                className="h-[20vh] w-[40vw] min-w-[220px] rounded-xl object-cover bg-gray-900"
              />
            </div>
          ))}
        </div>
      )}

      {/* Local video preview */}
      <video
        ref={localVideoRef}
        autoPlay muted
        className="absolute bottom-20 left-5 z-30 h-[20vh] w-[min(24vw,240px)] rounded-xl border border-white/25 bg-gray-900 object-cover"
      />

      {/* Controls bar */}
      <div className="absolute bottom-0 z-40 flex w-full items-center justify-center gap-3 py-4">
        {/* Mic */}
        <button
          onClick={() => setAudio((a) => !a)}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition ${audio ? "bg-white/20 hover:bg-white/30" : "bg-red-600 hover:bg-red-700"}`}
          title={audio ? "Mute" : "Unmute"}
        >
          {audio ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4zm-2 18.93A8.001 8.001 0 014 12H2a10 10 0 0010 10v-2.07zM22 12h-2a8 8 0 01-6 7.93V22a10 10 0 0010-10h-2zM12 20v2"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
          )}
        </button>

        {/* End call */}
        <button
          onClick={handleEndCall}
          className="flex h-13 w-13 h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg"
          title="End call"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
        </button>

        {/* Camera */}
        <button
          onClick={() => setVideo((v) => !v)}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition ${video ? "bg-white/20 hover:bg-white/30" : "bg-red-600 hover:bg-red-700"}`}
          title={video ? "Turn off camera" : "Turn on camera"}
        >
          {video ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M21 6.5l-4-4-15 15 4 4 2-2h8c.55 0 1-.45 1-1v-3.5l4 4V7l-4 3.5V7c0-.28-.11-.53-.29-.71L21 6.5zm-4 10.5H8l3-3h1.5l2 2H17v-2.5l4 3.5v-6l-4 3.5V17z"/></svg>
          )}
        </button>

        {/* Screen share */}
        {screenAvailable && (
          <button
            onClick={() => setScreen((s) => !s)}
            className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition ${screen ? "bg-blue-600 hover:bg-blue-700" : "bg-white/20 hover:bg-white/30"}`}
            title={screen ? "Stop sharing" : "Share screen"}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
          </button>
        )}

        {/* Chat */}
        <button
          onClick={() => { setShowChat((c) => !c); setNewMessages(0); }}
          className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
          title="Chat"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
          {newMessages > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white">
              {newMessages > 9 ? "9+" : newMessages}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// Extend Window to allow localStream
declare global {
  interface Window { localStream: MediaStream; }
}
