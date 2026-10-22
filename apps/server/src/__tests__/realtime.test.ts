import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { createSocketServer } from "../realtime/socket-server.js";
import { loadConfig } from "../config/env.js";
import { PROTOCOL_VERSION, ClientCommand, ServerEvent } from "@omioroom/contracts";

type Result = { ok: boolean; data?: any; error?: { code: string } };

function call(socket: Socket, event: string, payload: unknown): Promise<Result> {
  return new Promise((resolve) => {
    socket.emit(event, { requestId: randomUUID(), protocolVersion: PROTOCOL_VERSION, payload }, resolve);
  });
}

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe("Realtime protocol (integration)", () => {
  let httpServer: http.Server;
  let url: string;
  let ctx: ReturnType<typeof createSocketServer>;
  const sockets: Socket[] = [];

  const client = async () => {
    const s = connect(url, { transports: ["websocket"], forceNew: true });
    sockets.push(s);
    await new Promise<void>((r) => s.on("connect", () => r()));
    return s;
  };

  beforeAll(async () => {
    httpServer = http.createServer();
    ctx = createSocketServer(httpServer, { ...loadConfig(), nodeEnv: "test", corsOrigins: ["*"] });
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    clearInterval(ctx.cleanupTimer);
    await ctx.io.close();
  });

  it("syncs playback, chat and enforces room authorization", async () => {
    const owner = await client();
    const guest = await client();
    const stranger = await client();

    const created = await call(owner, ClientCommand.ROOM_CREATE, { title: "T", visibility: "public" });
    expect(created.ok).toBe(true);
    const roomId = created.data.snapshot.room.id as string;
    const globalId = created.data.snapshot.room.globalId as string;

    // Stranger who never joined cannot control, read, or chat
    const cmd = { commandId: randomUUID(), roomId, type: "play", position: 1 };
    expect((await call(stranger, ClientCommand.PLAYER_COMMAND, cmd)).error?.code).toBe("FORBIDDEN");
    expect((await call(stranger, ClientCommand.ROOM_GET, { roomId })).error?.code).toBe("ROOM_NOT_FOUND");
    expect(
      (await call(stranger, ClientCommand.CHAT_SEND, { roomId, text: "hi" })).error?.code
    ).toBe("FORBIDDEN");

    // Guest joins, both see playback commands
    const joined = await call(guest, ClientCommand.ROOM_JOIN, { globalId });
    expect(joined.ok).toBe(true);

    const stateAtGuest = waitFor<any>(guest, ServerEvent.PLAYER_STATE);
    const played = await call(owner, ClientCommand.PLAYER_COMMAND, cmd);
    expect(played.ok).toBe(true);
    expect((await stateAtGuest).status).toBe("playing");

    // Chat: broadcast + history
    const msgAtOwner = waitFor<any>(owner, ServerEvent.CHAT_MESSAGE);
    const sent = await call(guest, ClientCommand.CHAT_SEND, {
      roomId,
      text: "hello",
      attachmentUrl: "https://example.com/a.png",
      attachmentType: "image",
    });
    expect(sent.ok).toBe(true);
    expect((await msgAtOwner).text).toBe("hello");
    const history = await call(owner, ClientCommand.CHAT_HISTORY, { roomId });
    expect(history.data).toHaveLength(1);

    // Non-http attachment rejected
    const bad = await call(guest, ClientCommand.CHAT_SEND, {
      roomId,
      text: "x",
      attachmentUrl: "javascript:alert(1)",
      attachmentType: "file",
    });
    expect(bad.error?.code).toBe("INVALID_PAYLOAD");

    // Third participant gets ROOM_FULL
    expect((await call(stranger, ClientCommand.ROOM_JOIN, { globalId })).error?.code).toBe("ROOM_FULL");
  });

  it("supports the three identity modes with different capabilities", async () => {
    const anon = await client();
    const nick = await client();
    const reg1 = await client();
    const reg2 = await client();

    const anonMe = await call(anon, ClientCommand.SESSION_ME, undefined);
    expect(anonMe.data.user.kind).toBe("anonymous");

    const named = await call(nick, ClientCommand.USER_UPDATE_DISPLAY_NAME, { displayName: "Cinema Fan" });
    expect(named.data.kind).toBe("nickname");

    // Anonymous and nickname users have no friends actions
    expect((await call(anon, ClientCommand.FRIEND_LIST, {})).error?.code).toBe("FORBIDDEN");
    expect((await call(nick, ClientCommand.FRIEND_ADD, { username: "someone" })).error?.code).toBe("FORBIDDEN");

    // Registration upgrades the identity
    const r1 = await call(reg1, ClientCommand.USER_REGISTER, { username: "alice", password: "secret12" });
    expect(r1.data.user.kind).toBe("registered");
    const r2 = await call(reg2, ClientCommand.USER_REGISTER, { username: "bob", password: "secret34" });
    expect(r2.ok).toBe(true);

    // Duplicate username, even for a different identity
    expect((await call(nick, ClientCommand.USER_REGISTER, { username: "ALICE", password: "secret56" })).ok).toBe(false);

    // Registered users manage friends; unknown or self targets are rejected
    expect((await call(reg1, ClientCommand.FRIEND_ADD, { username: "bob" })).ok).toBe(true);
    expect((await call(reg1, ClientCommand.FRIEND_ADD, { username: "ghost" })).error?.code).toBe("USER_NOT_FOUND");
    expect((await call(reg1, ClientCommand.FRIEND_ADD, { username: "alice" })).ok).toBe(false);
    expect((await call(reg1, ClientCommand.FRIEND_LIST, {})).data).toHaveLength(1);
    expect((await call(reg2, ClientCommand.FRIEND_LIST, {})).data[0].displayName).toBe("alice");
    // A nickname user cannot be added as a friend even with a matching name
    expect((await call(reg1, ClientCommand.FRIEND_ADD, { username: "Cinema Fan" })).error?.code).toBe("USER_NOT_FOUND");

    // Registered usernames cannot be renamed
    expect((await call(reg1, ClientCommand.USER_UPDATE_DISPLAY_NAME, { displayName: "mallory" })).error?.code).toBe("FORBIDDEN");

    // Login: wrong password and unknown user look identical; correct password works from a new socket
    const other = await client();
    const bad = await call(other, ClientCommand.USER_LOGIN, { username: "alice", password: "wrongpass" });
    const unknown = await call(other, ClientCommand.USER_LOGIN, { username: "nobody", password: "wrongpass" });
    expect(bad.error).toEqual(unknown.error);
    const ok = await call(other, ClientCommand.USER_LOGIN, { username: "Alice", password: "secret12" });
    expect(ok.data.user.kind).toBe("registered");
    expect((await call(other, ClientCommand.FRIEND_LIST, {})).data).toHaveLength(1);
  });
});
