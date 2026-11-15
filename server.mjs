// Custom Next.js server with Socket.IO — ported from SparkMeet socketManager.js
// Preserves all original SparkMeet signaling logic unchanged.

import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// ── SparkMeet in-memory state (preserved exactly) ─────────────────────────
let connections = {};
let messages = {};
let timeOnline = {};
let screenShares = {};

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // ── Socket.IO server (ported verbatim from SparkMeet socketManager.js) ──
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["*"],
      credentials: true,
    },
    path: "/api/socket",
  });

  io.on("connection", (socket) => {
    socket.on("join-call", (path) => {
      if (connections[path] === undefined) {
        connections[path] = [];
      }
      connections[path].push(socket.id);
      timeOnline[socket.id] = new Date();

      for (let a = 0; a < connections[path].length; a++) {
        io.to(connections[path][a]).emit("user-joined", socket.id, connections[path]);
      }

      connections[path].forEach((peerId) => {
        if (screenShares[peerId]) io.to(socket.id).emit("screen-share-status", peerId, true);
      });

      if (messages[path] !== undefined) {
        for (let a = 0; a < messages[path].length; ++a) {
          io.to(socket.id).emit(
            "chat-message",
            messages[path][a]["data"],
            messages[path][a]["sender"],
            messages[path][a]["socket-id-sender"]
          );
        }
      }
    });

    socket.on("signal", (toId, message) => {
      io.to(toId).emit("signal", socket.id, message);
    });

    socket.on("screen-share-status", (isSharing) => {
      screenShares[socket.id] = Boolean(isSharing);
      const room =
        Object.values(connections).find((members) => members.includes(socket.id)) || [];
      room.forEach((peerId) =>
        io.to(peerId).emit("screen-share-status", socket.id, Boolean(isSharing))
      );
      if (!isSharing) delete screenShares[socket.id];
    });

    socket.on("chat-message", (data, sender) => {
      const [matchingRoom, found] = Object.entries(connections).reduce(
        ([room, isFound], [roomKey, roomValue]) => {
          if (!isFound && roomValue.includes(socket.id)) {
            return [roomKey, true];
          }
          return [room, isFound];
        },
        ["", false]
      );

      if (found === true) {
        if (messages[matchingRoom] === undefined) {
          messages[matchingRoom] = [];
        }
        messages[matchingRoom].push({
          sender: sender,
          data: data,
          "socket-id-sender": socket.id,
        });

        connections[matchingRoom].forEach((elem) => {
          io.to(elem).emit("chat-message", data, sender, socket.id);
        });
      }
    });

    socket.on("disconnect", () => {
      delete screenShares[socket.id];
      var diffTime = Math.abs(timeOnline[socket.id] - new Date()); // eslint-disable-line no-unused-vars

      for (const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {
        for (let a = 0; a < v.length; ++a) {
          if (v[a] === socket.id) {
            for (let b = 0; b < connections[k].length; ++b) {
              io.to(connections[k][b]).emit("user-left", socket.id);
            }

            const index = connections[k].indexOf(socket.id);
            connections[k].splice(index, 1);

            if (connections[k].length === 0) {
              delete connections[k];
            }
          }
        }
      }
    });
  });

  const port = process.env.PORT || 3000;
  httpServer.listen(port, () => {
    console.log(`> GURUKOOL ready on http://localhost:${port}`);
  });
});
