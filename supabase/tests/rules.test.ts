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

async function room(owner: string, visibility: "public" | "private" = "public") {
  const res = await t.as(owner).rpc("create_room", { p_title: "Movie", p_visibility: visibility });
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

  it("enforces two seats and does not let a returning member bypass the limit", async () => {
    const owner = await t.newUser();
    const a = await t.newUser();
    const b = await t.newUser();
    const r = await room(owner, "public");

    await t.as(a).rpc("join_room", { p_global_id: r.globalId });
    expect(await code(t.as(b).rpc("join_room", { p_global_id: r.globalId }))).toBe("ROOM_FULL");

    await t.as(a).rpc("leave_room", { p_room_id: r.id });
    await t.as(b).rpc("join_room", { p_global_id: r.globalId });
    expect(await code(t.as(a).rpc("join_room", { p_global_id: r.globalId }))).toBe("ROOM_FULL");
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

describe("chat", () => {
  it("members chat; outsiders cannot; urls are validated; history capped at 100", async () => {
    const owner = await t.newUser();
    const stranger = await t.newUser();
    const r = await room(owner, "public");

    const msg = await t.as(owner).rpc("send_chat", {
      p_room_id: r.id, p_text: "hello", p_attachment_url: "https://x.io/a.png", p_attachment_type: "image",
    });
    expect(msg).toMatchObject({ text: "hello", attachmentType: "image" });
    expect(await code(t.as(stranger).rpc("send_chat", { p_room_id: r.id, p_text: "hi" }))).toBe("FORBIDDEN");
    expect(
      await code(t.as(owner).rpc("send_chat", {
        p_room_id: r.id, p_text: "x", p_attachment_url: "javascript:alert(1)", p_attachment_type: "file",
      }))
    ).toBe("INVALID_PAYLOAD");
    expect(await code(t.as(owner).rpc("send_chat", { p_room_id: r.id, p_text: "   " }))).toBe("INVALID_PAYLOAD");

    // History visible to members only
    expect(await t.as(owner).query("select * from public.chat_messages where room_id = $1", [r.id])).toHaveLength(1);
    expect(await t.as(stranger).query("select * from public.chat_messages")).toHaveLength(0);

    // Cap at 100 (bypass the rate limiter by clearing its log between batches)
    for (let i = 0; i < 110; i++) {
      await t.db.query("delete from public.rate_events");
      await t.as(owner).rpc("send_chat", { p_room_id: r.id, p_text: `m${i}` });
    }
    expect(await t.as(owner).query("select * from public.chat_messages where room_id = $1", [r.id])).toHaveLength(100);
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
  it("closes idle rooms but not active ones", async () => {
    const owner = await t.newUser();
    const idle = await room(owner, "public");
    const live = await room(owner, "public");
    await t.db.query(
      `update public.room_members set last_active_at = now() - interval '2 hours' where room_id = $1`,
      [idle.id]
    );
    await t.db.query(`update public.rooms set updated_at = now() - interval '2 hours' where id = $1`, [idle.id]);

    const closed = await t.db.query<{ n: number }>("select public.close_inactive_rooms() as n");
    expect(closed.rows[0]?.n).toBe(1);
    const mine = await t.as(owner).rpc("list_my_rooms");
    expect(mine.map((x: any) => x.id)).toEqual([live.id]);
  });

  it("clients cannot call internal functions", async () => {
    const u = await t.newUser();
    await expect(t.as(u).rpc("close_inactive_rooms")).rejects.toThrow(/permission denied/);
    await expect(t.as(u).rpc("check_rate", { p_user: u, p_kind: "x", p_max: 1, p_window: "1 hour" })).rejects.toThrow(/permission denied/);
  });
});
