import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb, type TestDb } from "./harness.js";

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
});

// Failures arrive either as a raised error or as a returned {error: CODE}
const code = (p: Promise<unknown>) =>
  p.then(
    (res) => (res && typeof res === "object" && "error" in res ? String((res as any).error) : "OK"),
    (e: Error) => e.message.replace(/^.*?(?=[A-Z_]{5,}$)/, "")
  );

async function room(
  owner: string,
  visibility: "public" | "private" = "public",
  extra: Record<string, unknown> = {}
) {
  const res = await t.as(owner).rpc("create_room", { p_title: "Movie", p_visibility: visibility, ...extra });
  return {
    id: res.snapshot.room.id as string,
    globalId: res.snapshot.room.globalId as string,
    privateCode: (res.ownerAccess?.privateCode ?? null) as string | null,
  };
}

const play = (user: string, roomId: string, extra: Record<string, unknown> = {}) =>
  t.as(user).rpc("player_command", {
    p_room_id: roomId,
    p_command_id: randomUUID(),
    p_type: "play",
    ...extra,
  });

describe("identity", () => {
  it("creates profiles per auth user kind", async () => {
    const anon = await t.newUser();
    const reg = await t.newUser({ anonymous: false, username: "alice" });
    const rows = await t.db.query<{ id: string; kind: string; username: string | null }>(
      "select id, kind, username from public.profiles"
    );
    expect(rows.rows.find((r) => r.id === anon)?.kind).toBe("anonymous");
    expect(rows.rows.find((r) => r.id === reg)).toMatchObject({ kind: "registered", username: "alice" });
  });

  it("upgrades an anonymous user to registered on the same id", async () => {
    const uid = await t.newUser();
    await t.db.query(
      `update auth.users set is_anonymous = false, email = 'a@b.co',
       raw_user_meta_data = '{"username":"bobby"}'::jsonb where id = $1`,
      [uid]
    );
    const rows = await t.db.query<{ kind: string; username: string }>(
      "select kind, username from public.profiles where id = $1",
      [uid]
    );
    expect(rows.rows[0]).toMatchObject({ kind: "registered", username: "bobby" });
  });

  it("backfills a missing profile for an existing auth user", async () => {
    const uid = await t.newUser();
    await t.db.query("delete from public.profiles where id = $1", [uid]);
    await t.as(uid).rpc("ensure_profile");
    const rows = await t.db.query<{ kind: string }>("select kind from public.profiles where id = $1", [uid]);
    expect(rows.rows[0]?.kind).toBe("anonymous");
    // Idempotent
    await t.as(uid).rpc("ensure_profile");
  });

  it("checks username availability case-insensitively", async () => {
    await t.newUser({ anonymous: false, username: "Alice" });
    expect(await t.as(null).rpc("username_available", { p_username: "alice" })).toBe(false);
    expect(await t.as(null).rpc("username_available", { p_username: "carol" })).toBe(true);
  });

  it("lets non-registered rename (becoming nickname) but not registered", async () => {
    const anon = await t.newUser();
    const reg = await t.newUser({ anonymous: false, username: "alice" });
    const renamed = await t.as(anon).rpc("update_display_name", { p_name: "Cinema Fan" });
    expect(renamed).toMatchObject({ kind: "nickname", displayName: "Cinema Fan" });
    expect(await code(t.as(reg).rpc("update_display_name", { p_name: "mallory" }))).toBe("FORBIDDEN");
    expect(await code(t.as(anon).rpc("update_display_name", { p_name: "<b>" }))).toBe("INVALID_PAYLOAD");
  });

  it("rejects unauthenticated calls", async () => {
    await expect(t.as(null).rpc("create_room", {})).rejects.toThrow();
  });
});

describe("rooms and private access", () => {
  it("lets one user own several rooms and lists only theirs", async () => {
    const a = await t.newUser();
    const b = await t.newUser();
    await room(a);
    await room(a, "private");
    await room(b);
    expect(await t.as(a).rpc("list_my_rooms")).toHaveLength(2);
    expect(await t.as(b).rpc("list_my_rooms")).toHaveLength(1);
  });

  it("names rooms automatically when no title is given", async () => {
    const a = await t.newUser();
    const res = await t.as(a).rpc("create_room", { p_visibility: "public" });
    expect(res.snapshot.room.title).toMatch(/^[A-Z][a-z]+ [A-Z][A-Za-z ]+$/);
    const named = await t.as(a).rpc("create_room", { p_title: "  Our night  ", p_visibility: "public" });
    expect(named.snapshot.room.title).toBe("Our night");
  });

  it("is idempotent per request id", async () => {
    const a = await t.newUser();
    const rid = randomUUID();
    const r1 = await t.as(a).rpc("create_room", { p_title: "X", p_visibility: "private", p_request_id: rid });
    const r2 = await t.as(a).rpc("create_room", { p_title: "X", p_visibility: "private", p_request_id: rid });
    expect(r2.snapshot.room.id).toBe(r1.snapshot.room.id);
    expect(r2.ownerAccess.privateCode).toBe(r1.ownerAccess.privateCode);
    expect(await t.as(a).rpc("list_my_rooms")).toHaveLength(1);
  });

  it("requires the private code for guests and rejects wrong/old ones", async () => {
    const owner = await t.newUser();
    const guest = await t.newUser();
    const r = await room(owner, "private");

    expect(await code(t.as(guest).rpc("join_room", { p_global_id: r.globalId }))).toBe("PRIVATE_CODE_REQUIRED");
    expect(await code(t.as(guest).rpc("join_room", { p_global_id: r.globalId, p_private_code: "WRONG123" }))).toBe(
      "INVALID_PRIVATE_CODE"
    );
    const ok = await t.as(guest).rpc("join_room", { p_global_id: r.globalId, p_private_code: r.privateCode });
    expect(ok.room.id).toBe(r.id);
    // Members re-enter without the code
    expect((await t.as(guest).rpc("join_room", { p_global_id: r.globalId })).room.id).toBe(r.id);
  });

  it("rotate invalidates the old code; revoke blocks all new joins; id stays", async () => {
    const owner = await t.newUser();
    const g1 = await t.newUser();
    const g2 = await t.newUser();
    const r = await room(owner, "private");

    const rotated = await t.as(owner).rpc("rotate_private_code", { p_room_id: r.id });
    expect(rotated.privateCode).not.toBe(r.privateCode);
    expect(await code(t.as(g1).rpc("join_room", { p_global_id: r.globalId, p_private_code: r.privateCode }))).toBe(
      "INVALID_PRIVATE_CODE"
    );
    await t.as(g1).rpc("join_room", { p_global_id: r.globalId, p_private_code: rotated.privateCode });

    await t.as(owner).rpc("revoke_private_code", { p_room_id: r.id });
    expect(await code(t.as(g2).rpc("join_room", { p_global_id: r.globalId, p_private_code: rotated.privateCode }))).toBe(
      "INVALID_PRIVATE_CODE"
    );
    expect(await code(t.as(g1).rpc("revoke_private_code", { p_room_id: r.id }))).toBe("FORBIDDEN");
    const mine = await t.as(owner).rpc("list_my_rooms");
    expect(mine[0].globalId).toBe(r.globalId);
  });

  it("only the owner changes visibility; code appears only for the owner and never in DTOs", async () => {
    const owner = await t.newUser();
    const guest = await t.newUser();
    const r = await room(owner, "public");

    expect(await code(t.as(guest).rpc("set_visibility", { p_room_id: r.id, p_visibility: "private" }))).toBe("FORBIDDEN");
    const res = await t.as(owner).rpc("set_visibility", { p_room_id: r.id, p_visibility: "private" });
    expect(res.ownerAccess.privateCode).toHaveLength(8);
    expect(res.room.globalId).toBe(r.globalId);
    expect(JSON.stringify(res.room)).not.toContain(res.ownerAccess.privateCode);

    expect(await code(t.as(guest).rpc("join_room", { p_global_id: r.globalId }))).toBe("PRIVATE_CODE_REQUIRED");
    const back = await t.as(owner).rpc("set_visibility", { p_room_id: r.id, p_visibility: "public" });
    expect(back.ownerAccess).toBeNull();
    await t.as(guest).rpc("join_room", { p_global_id: r.globalId });
  });

  it("rejects stale expected revision on visibility change", async () => {
    const owner = await t.newUser();
    const r = await room(owner, "public");
    expect(
      await code(t.as(owner).rpc("set_visibility", { p_room_id: r.id, p_visibility: "private", p_expected_revision: 99 }))
    ).toBe("REVISION_CONFLICT");
  });

  it("enforces the room's participant limit and does not let a returning member bypass it", async () => {
    // limit 3 = owner + 2 guests
    const owner = await t.newUser();
    const a = await t.newUser();
    const b = await t.newUser();
    const c = await t.newUser();
    const r = await room(owner, "public", { p_max_participants: 3 });

    await t.as(a).rpc("join_room", { p_global_id: r.globalId });
    await t.as(b).rpc("join_room", { p_global_id: r.globalId });
    expect(await code(t.as(c).rpc("join_room", { p_global_id: r.globalId }))).toBe("ROOM_FULL");

    await t.as(a).rpc("leave_room", { p_room_id: r.id });
    await t.as(c).rpc("join_room", { p_global_id: r.globalId });
    expect(await code(t.as(a).rpc("join_room", { p_global_id: r.globalId }))).toBe("ROOM_FULL");
  });

  it("supports groups up to 32 and rejects out-of-range limits", async () => {
    const owner = await t.newUser();
    expect(await code(t.as(owner).rpc("create_room", { p_max_participants: 33 }))).toBe("INVALID_PAYLOAD");
    expect(await code(t.as(owner).rpc("create_room", { p_max_participants: 1 }))).toBe("INVALID_PAYLOAD");
    expect(await code(t.as(owner).rpc("create_room", { p_control_mode: "nobody" }))).toBe("INVALID_PAYLOAD");

    const r = await room(owner, "public", { p_max_participants: 32 });
    // 31 guests fit; seats are not capped at two
    for (let i = 0; i < 31; i++) {
      const g = await t.newUser();
      await t.as(g).rpc("join_room", { p_global_id: r.globalId });
    }
    const extra = await t.newUser();
    expect(await code(t.as(extra).rpc("join_room", { p_global_id: r.globalId }))).toBe("ROOM_FULL");
  });

  it("lets only the owner change settings, never below the people inside", async () => {
    const owner = await t.newUser();
    const guest = await t.newUser();
    const r = await room(owner, "public", { p_max_participants: 8 });
    await t.as(guest).rpc("join_room", { p_global_id: r.globalId });

    expect(
      await code(t.as(guest).rpc("update_room_settings", { p_room_id: r.id, p_max_participants: 10, p_control_mode: "owner" }))
    ).toBe("FORBIDDEN");
    expect(
      await code(t.as(owner).rpc("update_room_settings", { p_room_id: r.id, p_max_participants: 1, p_control_mode: "owner" }))
    ).toBe("INVALID_PAYLOAD");
    // two people are inside (owner + guest): limit 2 is allowed, 3 would be fine, below 2 is not
    const ok = await t.as(owner).rpc("update_room_settings", { p_room_id: r.id, p_max_participants: 2, p_control_mode: "selected" });
    expect(ok).toMatchObject({ maxParticipants: 2, controlMode: "selected" });
  });

  it("rate limits join attempts (room id brute force)", async () => {
    const attacker = await t.newUser();
    let limited = false;
    for (let i = 0; i < 20; i++) {
      if ((await code(t.as(attacker).rpc("join_room", { p_global_id: "999999" }))) === "RATE_LIMITED") {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("closed rooms reject everything and disappear from the list", async () => {
    const owner = await t.newUser();
    const r = await room(owner, "private");
    await t.as(owner).rpc("close_room", { p_room_id: r.id });
    expect(await code(play(owner, r.id))).toBe("ROOM_CLOSED");
    expect(await code(t.as(owner).rpc("rotate_private_code", { p_room_id: r.id }))).toBe("ROOM_CLOSED");
    expect(await t.as(owner).rpc("list_my_rooms")).toHaveLength(0);
  });
});

describe("row level security", () => {
  it("hides rooms, members and playback from outsiders; secrets from everyone", async () => {
    const owner = await t.newUser();
    const outsider = await t.newUser();
    const r = await room(owner, "private");

    expect(await t.as(owner).query("select id from public.rooms")).toHaveLength(1);
    expect(await t.as(outsider).query("select id from public.rooms")).toHaveLength(0);
    expect(await t.as(outsider).query("select * from public.room_members")).toHaveLength(0);
    expect(await t.as(outsider).query("select * from public.playback_state")).toHaveLength(0);
    await expect(t.as(owner).query("select * from public.room_secrets")).rejects.toThrow(/permission denied/);
    await expect(t.as(owner).query("select * from public.rate_events")).rejects.toThrow(/permission denied/);
    expect(await code(t.as(outsider).rpc("get_room_snapshot", { p_room_id: r.id }))).toBe("ROOM_NOT_FOUND");
  });

  it("forbids direct writes", async () => {
    const owner = await t.newUser();
    const r = await room(owner, "public");
    await expect(
      t.as(owner).query("update public.rooms set title = 'hacked' where id = $1", [r.id])
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.as(owner).query("update public.playback_state set status = 'playing' where room_id = $1", [r.id])
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.as(owner).query("insert into public.chat_messages (room_id, sender_id, sender_name) values ($1,$2,'x')", [r.id, owner])
    ).rejects.toThrow(/permission denied/);
  });
});

describe("playback", () => {
  it("rejects non-members and offline participants have no special rights", async () => {
    const owner = await t.newUser();
    const stranger = await t.newUser();
    const r = await room(owner, "public");
    expect(await code(play(stranger, r.id))).toBe("FORBIDDEN");
  });

  it("applies commands, bumps revision, and dedups by command id", async () => {
    const owner = await t.newUser();
    const guest = await t.newUser();
    const r = await room(owner, "public");
    await t.as(guest).rpc("join_room", { p_global_id: r.globalId });

    const commandId = randomUUID();
    const first = await t.as(owner).rpc("player_command", {
      p_room_id: r.id, p_command_id: commandId, p_type: "play", p_position: 12.5,
    });
    expect(first).toMatchObject({ status: "playing", anchorPosition: 12.5, revision: 1 });

    const dup = await t.as(owner).rpc("player_command", {
      p_room_id: r.id, p_command_id: commandId, p_type: "play", p_position: 12.5,
    });
    expect(dup.revision).toBe(1);

    const paused = await t.as(guest).rpc("player_command", {
      p_room_id: r.id, p_command_id: randomUUID(), p_type: "pause", p_position: 15,
    });
    expect(paused).toMatchObject({ status: "paused", anchorPosition: 15, revision: 2 });
  });

  it("ignores stale expected revisions", async () => {
    const owner = await t.newUser();
    const r = await room(owner, "public");
    await play(owner, r.id, { p_position: 1 });
    await play(owner, r.id, { p_position: 2 });
    const stale = await play(owner, r.id, { p_position: 99, p_expected_revision: 0 });
    expect(stale.revision).toBe(2);
    expect(stale.anchorPosition).toBe(2);
  });

  it("validates media and playback rate", async () => {
    const owner = await t.newUser();
    const r = await room(owner, "public");
    const change = (media: unknown) =>
      t.as(owner).rpc("player_command", {
        p_room_id: r.id, p_command_id: randomUUID(), p_type: "change-media", p_media: media,
      });

    expect(await code(change({ type: "html5", sourceId: "x", canonicalUrl: "javascript:alert(1)" }))).toBe("MEDIA_UNSUPPORTED");
    expect(await code(change({ type: "evil", sourceId: "x", canonicalUrl: "https://a.com/v.mp4" }))).toBe("MEDIA_UNSUPPORTED");
    const ok = await change({ type: "html5", sourceId: "x", canonicalUrl: "https://a.com/v.mp4" });
    expect(ok.media.canonicalUrl).toBe("https://a.com/v.mp4");
    expect(ok.status).toBe("paused");

    expect(
      await code(t.as(owner).rpc("player_command", {
        p_room_id: r.id, p_command_id: randomUUID(), p_type: "set-rate", p_playback_rate: 10,
      }))
    ).toBe("INVALID_PAYLOAD");
  });

  it("reports server time in ms", async () => {
    const owner = await t.newUser();
    const ms = Number(await t.as(owner).rpc("server_time_ms"));
    expect(Math.abs(ms - Date.now())).toBeLessThan(5000);
  });
});

describe("playback control modes", () => {
  it("'everyone' lets any member control; 'owner' only the owner; 'selected' only picked members", async () => {
    const owner = await t.newUser();
    const a = await t.newUser();
    const b = await t.newUser();
    const r = await room(owner, "public", { p_control_mode: "everyone", p_max_participants: 5 });
    await t.as(a).rpc("join_room", { p_global_id: r.globalId });
    await t.as(b).rpc("join_room", { p_global_id: r.globalId });

    expect((await play(a, r.id)).status).toBe("playing");

    const setMode = (mode: string) =>
      t.as(owner).rpc("update_room_settings", { p_room_id: r.id, p_max_participants: 5, p_control_mode: mode });

    await setMode("owner");
    expect(await code(play(a, r.id))).toBe("FORBIDDEN");
    expect((await play(owner, r.id)).revision).toBeGreaterThan(0);

    await setMode("selected");
    expect(await code(play(a, r.id))).toBe("FORBIDDEN");
    await t.as(owner).rpc("set_member_control", { p_room_id: r.id, p_user_id: a, p_can_control: true });
    expect((await play(a, r.id)).status).toBe("playing");
    expect(await code(play(b, r.id))).toBe("FORBIDDEN");

    // Only the owner hands out control
    expect(await code(t.as(a).rpc("set_member_control", { p_room_id: r.id, p_user_id: b, p_can_control: true }))).toBe("FORBIDDEN");

    // Snapshot reports the viewer's own permission
    expect((await t.as(a).rpc("get_room_snapshot", { p_room_id: r.id })).canControl).toBe(true);
    expect((await t.as(b).rpc("get_room_snapshot", { p_room_id: r.id })).canControl).toBe(false);
    expect((await t.as(owner).rpc("get_room_snapshot", { p_room_id: r.id })).canControl).toBe(true);
  });
});

describe("buffering barrier", () => {
  async function playingRoom() {
    const owner = await t.newUser();
    const guest = await t.newUser();
    const third = await t.newUser();
    const r = await room(owner, "public", { p_max_participants: 4 });
    await t.as(guest).rpc("join_room", { p_global_id: r.globalId });
    await t.as(third).rpc("join_room", { p_global_id: r.globalId });
    await play(owner, r.id, { p_position: 10 });
    return { owner, guest, third, r };
  }
  const report = (u: string, roomId: string, on: boolean) =>
    t.as(u).rpc("report_buffering", { p_room_id: roomId, p_is_buffering: on });

  it("holds the room while someone buffers and resumes everyone together", async () => {
    const { owner, guest, r } = await playingRoom();
    const held = await report(guest, r.id, true);
    expect(held.status).toBe("buffering");
    expect(held.bufferingBy).toEqual([guest]);

    // Another stall joins the wait; resuming needs both
    const second = await report(owner, r.id, true);
    expect(second.bufferingBy.sort()).toEqual([guest, owner].sort());
    const afterOne = await report(guest, r.id, false);
    expect(afterOne.status).toBe("buffering");
    expect(afterOne.bufferingBy).toEqual([owner]);

    const before = Number(await t.as(owner).rpc("server_time_ms"));
    const resumed = await report(owner, r.id, false);
    expect(resumed.status).toBe("playing");
    expect(resumed.bufferingBy).toEqual([]);
    // Resume instant lies slightly ahead of the moment of the call so clients can start together
    expect(Number(resumed.anchorServerTime)).toBeGreaterThan(before + 300);
    expect(resumed.anchorPosition).toBeGreaterThanOrEqual(10);
  });

  it("stops waiting for a client that stays stalled for more than 5 seconds", async () => {
    const { guest, third, r } = await playingRoom();
    await report(guest, r.id, true);
    // Simulate: the stall started 10 s ago
    await t.db.query(
      "update public.playback_state set buffering = jsonb_build_object($2::text, ((extract(epoch from clock_timestamp())*1000)::bigint - 10000)) where room_id = $1",
      [r.id, guest]
    );
    // A different member's timer fires
    const resolved = await t.as(third).rpc("resolve_buffering", { p_room_id: r.id });
    expect(resolved.status).toBe("playing");
    expect(resolved.bufferingBy).toEqual([]);
  });

  it("does not resume early while a fresh stall exists", async () => {
    const { guest, third, r } = await playingRoom();
    await report(guest, r.id, true);
    const early = await t.as(third).rpc("resolve_buffering", { p_room_id: r.id });
    expect(early.status).toBe("buffering");
  });

  it("explicit pause or play clears the wait; paused rooms ignore stalls; outsiders are rejected", async () => {
    const { owner, guest, r } = await playingRoom();
    await report(guest, r.id, true);
    const paused = await t.as(owner).rpc("player_command", {
      p_room_id: r.id, p_command_id: randomUUID(), p_type: "pause", p_position: 12,
    });
    expect(paused).toMatchObject({ status: "paused", bufferingBy: [] });

    const ignored = await report(guest, r.id, true);
    expect(ignored.status).toBe("paused");

    const stranger = await t.newUser();
    expect(await code(report(stranger, r.id, true))).toBe("FORBIDDEN");
  });

  it("viewers without playback control can still report stalls", async () => {
    const owner = await t.newUser();
    const viewer = await t.newUser();
    const r = await room(owner, "public", { p_control_mode: "owner" });
    await t.as(viewer).rpc("join_room", { p_global_id: r.globalId });
    await play(owner, r.id, { p_position: 1 });
    expect((await report(viewer, r.id, true)).status).toBe("buffering");
  });
});

describe("chat", () => {
  const upload = (userId: string, roomId: string, file = `${randomUUID()}.png`) => {
    const path = `${roomId}/${file}`;
    return t
      .as(userId)
      .query("insert into storage.objects (bucket_id, name) values ('chat-attachments', $1)", [path])
      .then(() => path);
  };

  it("members chat; outsiders cannot; history is capped at 100", async () => {
    const owner = await t.newUser();
    const stranger = await t.newUser();
    const r = await room(owner, "public");

    const msg = await t.as(owner).rpc("send_chat", { p_room_id: r.id, p_text: "hello" });
    expect(msg).toMatchObject({ text: "hello", attachmentPath: null });
    expect(await code(t.as(stranger).rpc("send_chat", { p_room_id: r.id, p_text: "hi" }))).toBe("FORBIDDEN");
    expect(await code(t.as(owner).rpc("send_chat", { p_room_id: r.id, p_text: "   " }))).toBe("INVALID_PAYLOAD");

    expect(await t.as(owner).query("select * from public.chat_messages where room_id = $1", [r.id])).toHaveLength(1);
    expect(await t.as(stranger).query("select * from public.chat_messages")).toHaveLength(0);

    for (let i = 0; i < 110; i++) {
      await t.db.query("delete from public.rate_events");
      await t.as(owner).rpc("send_chat", { p_room_id: r.id, p_text: `m${i}` });
    }
    expect(await t.as(owner).query("select * from public.chat_messages where room_id = $1", [r.id])).toHaveLength(100);
  });

  it("accepts only uploaded images from the room's own folder", async () => {
    const owner = await t.newUser();
    const guest = await t.newUser();
    const other = await t.newUser();
    const r = await room(owner, "public");
    const r2 = await room(other, "public");
    await t.as(guest).rpc("join_room", { p_global_id: r.globalId });

    const path = await upload(guest, r.id);
    const sent = await t.as(guest).rpc("send_chat", { p_room_id: r.id, p_text: "", p_attachment_path: path });
    expect(sent).toMatchObject({ attachmentPath: path, attachmentType: "image" });

    // Not a file the sender uploaded
    expect(await code(t.as(owner).rpc("send_chat", { p_room_id: r.id, p_attachment_path: path }))).toBe("INVALID_PAYLOAD");
    // Another room's folder, a missing object, a non-image name, and a URL are all rejected
    const foreign = await upload(other, r2.id);
    expect(await code(t.as(guest).rpc("send_chat", { p_room_id: r.id, p_attachment_path: foreign }))).toBe("INVALID_PAYLOAD");
    expect(await code(t.as(guest).rpc("send_chat", { p_room_id: r.id, p_attachment_path: `${r.id}/${randomUUID()}.png` }))).toBe("INVALID_PAYLOAD");
    const pdf = await upload(guest, r.id, `${randomUUID()}.pdf`);
    expect(await code(t.as(guest).rpc("send_chat", { p_room_id: r.id, p_attachment_path: pdf }))).toBe("INVALID_PAYLOAD");
    expect(await code(t.as(guest).rpc("send_chat", { p_room_id: r.id, p_attachment_path: "https://x.io/a.png" }))).toBe("INVALID_PAYLOAD");
  });

  it("storage rules: members upload and read their room's images, outsiders cannot", async () => {
    const owner = await t.newUser();
    const stranger = await t.newUser();
    const r = await room(owner, "public");

    await upload(owner, r.id);
    await expect(upload(stranger, r.id)).rejects.toThrow(/row-level security|permission denied|violates/i);
    expect(await t.as(owner).query("select * from storage.objects")).toHaveLength(1);
    expect(await t.as(stranger).query("select * from storage.objects")).toHaveLength(0);
  });

  it("rate limits chat floods", async () => {
    const owner = await t.newUser();
    const r = await room(owner, "public");
    let limited = false;
    for (let i = 0; i < 25; i++) {
      if ((await code(t.as(owner).rpc("send_chat", { p_room_id: r.id, p_text: `m${i}` }))) === "RATE_LIMITED") {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});

describe("friends", () => {
  it("is limited to registered users and works mutually", async () => {
    const anon = await t.newUser();
    const alice = await t.newUser({ anonymous: false, username: "alice" });
    const bob = await t.newUser({ anonymous: false, username: "bob" });

    expect(await code(t.as(anon).rpc("list_friends"))).toBe("FORBIDDEN");
    expect(await code(t.as(anon).rpc("add_friend", { p_username: "alice" }))).toBe("FORBIDDEN");

    await t.as(alice).rpc("add_friend", { p_username: "Bob" });
    expect(await t.as(alice).rpc("list_friends")).toEqual([{ userId: bob, displayName: "bob" }]);
    expect((await t.as(bob).rpc("list_friends"))[0].displayName).toBe("alice");

    expect(await code(t.as(alice).rpc("add_friend", { p_username: "ghost" }))).toBe("USER_NOT_FOUND");
    expect(await code(t.as(alice).rpc("add_friend", { p_username: "alice" }))).toBe("INVALID_PAYLOAD");

    await t.as(alice).rpc("remove_friend", { p_user_id: bob });
    expect(await t.as(bob).rpc("list_friends")).toEqual([]);
  });

  it("does not match nickname users by name", async () => {
    const alice = await t.newUser({ anonymous: false, username: "alice" });
    const nick = await t.newUser();
    await t.as(nick).rpc("update_display_name", { p_name: "Cinema Fan" });
    expect(await code(t.as(alice).rpc("add_friend", { p_username: "Cinema Fan" }))).toBe("USER_NOT_FOUND");
  });
});

describe("maintenance", () => {
  it("removes stale anonymous accounts but keeps registered ones and active room members", async () => {
    const stale = await t.newUser();
    const owner = await t.newUser();
    const registered = await t.newUser({ anonymous: false, username: "keeper" });
    const fresh = await t.newUser();
    await room(owner, "public");
    await t.db.query(
      "update auth.users set created_at = now() - interval '90 days', last_sign_in_at = now() - interval '90 days' where id in ($1, $2, $3)",
      [stale, owner, registered]
    );

    const res = await t.db.query<{ n: number }>("select public.cleanup_stale_anonymous_users() as n");
    expect(res.rows[0]?.n).toBe(1);
    const left = await t.db.query<{ id: string }>("select id from public.profiles");
    const ids = left.rows.map((r) => r.id);
    expect(ids).not.toContain(stale);
    expect(ids).toEqual(expect.arrayContaining([owner, registered, fresh]));
  });

  it("closes a room that stayed empty for 5 minutes, but not an occupied or recently emptied one", async () => {
    const owner = await t.newUser();
    const other = await t.newUser();
    const empty = await room(owner, "public");
    const occupied = await room(other, "public");
    const recent = await room(other, "public");
    const tick = async () =>
      (await t.db.query<{ n: number }>("select public.close_inactive_rooms() as n")).rows[0]!.n;
    const stale = (id: string) =>
      t.db.query("update public.member_activity set last_active_at = now() - interval '10 minutes' where room_id = $1", [id]);

    await stale(empty.id);
    await stale(recent.id);

    // First tick only starts the clock
    expect(await tick()).toBe(0);
    // Four minutes later: still open
    await t.db.query("update public.rooms set empty_since = now() - interval '4 minutes' where id in ($1, $2)", [empty.id, recent.id]);
    expect(await tick()).toBe(0);
    // Past five minutes: the empty room closes; the one someone came back to stays and its clock resets
    await t.db.query("update public.rooms set empty_since = now() - interval '6 minutes' where id = $1", [empty.id]);
    await t.db.query("update public.member_activity set last_active_at = now() where room_id = $1", [recent.id]);
    expect(await tick()).toBe(1);

    const mine = await t.as(owner).rpc("list_my_rooms");
    expect(mine).toHaveLength(0);
    const others = (await t.as(other).rpc("list_my_rooms")).map((x: any) => x.id).sort();
    expect(others).toEqual([occupied.id, recent.id].sort());
    const clocks = await t.db.query<{ id: string; empty_since: string | null }>("select id, empty_since from public.rooms where id = $1", [recent.id]);
    expect(clocks.rows[0]?.empty_since).toBeNull();
  });

  it("limits each owner to the room limit (currently one); closing the room frees the slot", async () => {
    // Restore the production limit that the shared harness relaxes
    await t.db.exec("create or replace function public.room_limit_per_user() returns integer language sql immutable as $$ select 1 $$");
    const owner = await t.newUser();
    const rooms = [await room(owner)];
    expect(await code(t.as(owner).rpc("create_room", { p_visibility: "public" }))).toBe("ROOM_LIMIT");
    // Other owners are unaffected
    const someone = await t.newUser();
    await room(someone);

    await t.as(owner).rpc("close_room", { p_room_id: rooms[0]!.id });
    expect((await t.as(owner).rpc("create_room", { p_visibility: "public" })).snapshot.room.id).toBeTruthy();
  });

  it("clients cannot call internal functions", async () => {
    const u = await t.newUser();
    await expect(t.as(u).rpc("close_inactive_rooms")).rejects.toThrow(/permission denied/);
    await expect(t.as(u).rpc("check_rate", { p_user: u, p_kind: "x", p_max: 1, p_window: "1 hour" })).rejects.toThrow(/permission denied/);
  });
});
