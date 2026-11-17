import { canonical } from "../vendor/project-store.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import manifest from "../contracts/plugin-manifest.json" with { type: "json" };
import { newProject, projection, validate } from "../src/domain/model.ts";
import { memoryCore } from "./support/memory-core.ts";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const before = "雨港。\r\n林溪说：“等一等。” 🌧️\n雨港。\n";
const evidence = {
  source_index: 0,
  byte_start: 0,
  byte_end: 9,
  quote: "雨港。",
};
const node = (id = "lin"): any => ({
  id,
  name: id === "lin" ? "林溪" : "陈舟",
  kind: "character",
  summary: "雨港旧邮局的守信人",
  status: "extracted",
  evidence: [evidence],
  canonical_source_index: null,
  entity_ref: null,
  attributes: [],
});
export function fixture() {
  const c = memoryCore();
  const ref: any = {
    kind: "document",
    work_ref: c.work,
    document_id: "document_original",
    revision_id: "revision_original",
    sha256: sha(before),
  };
  c.sources.set(canonical(ref), { source_ref: ref, content: before });
  return { c, ref, before };
}
const base = (r: any, key: string) => ({
  object_id: r.object.object_id,
  expected_revision: r.object.revision,
  expected_sha256: r.sha256,
  operation_key: key,
});
async function create(c: any, refs: any[] = []) {
  const r = await c.invoke("save_project", {
    content: newProject("雨港来信"),
    source_refs: refs,
    expected_revision: 0,
    expected_sha256: "",
    operation_key: "create",
  });
  assert.equal(r.status, "succeeded", JSON.stringify(r));
  return r.data;
}
function value(r: any) {
  assert.equal(r.status, "succeeded", JSON.stringify(r));
  return r.data;
}
const bad = (r: any, code?: string) => {
  assert.equal(r.status, "failed", JSON.stringify(r));
  if (code) assert.equal(r.error.code, code);
};
test("默认数据与闭合Schema", () => {
  validate(newProject());
  const p = newProject();
  p.extra = true;
  assert.throws(() => validate(p));
});
test("未知动作与多余参数拒绝", async () => {
  const { c } = fixture();
  bad(await c.invoke("not_a_tool", {}), "not_found");
  bad(await c.invoke("list_projects", { secret: "x" }));
});
test("CAS、历史读取、同键重放与异输入冲突", async () => {
  const { c } = fixture();
  let r = await create(c);
  const input = {
    ...base(r, "update"),
    content: { ...r.object.content, title: "第二版" },
  };
  r = value(await c.invoke("save_project", input));
  assert.equal(r.object.revision, 2);
  assert.equal(value(await c.invoke("save_project", input)).sha256, r.sha256);
  bad(
    await c.invoke("save_project", {
      ...input,
      content: { ...input.content, title: "换输入" },
    }),
    "idempotency_conflict",
  );
  bad(
    await c.invoke("save_project", { ...input, operation_key: "old" }),
    "revision_conflict",
  );
  assert.equal(
    value(
      await c.invoke("get_project", {
        object_id: r.object.object_id,
        revision: 1,
      }),
    ).object.content.title,
    "雨港来信",
  );
});
test("响应丢失沿原键恢复，未重复写入", async () => {
  const { c } = fixture();
  const r = await create(c),
    i = {
      ...base(r, "lost"),
      content: { ...r.object.content, title: "丢失响应" },
    };
  c.failAfterWrite = true;
  bad(await c.invoke("save_project", i));
  const op = value(await c.invoke("get_operation", { operation_key: "lost" }));
  assert.equal(op.object.revision, 2);
  assert.equal(value(await c.invoke("save_project", i)).sha256, op.sha256);
  assert.equal(c.writes, 2);
});
test("未知原操作不能继续写", async () => {
  const { c } = fixture();
  c.unknown = true;
  bad(
    await c.invoke("save_project", {
      content: newProject(),
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "unknown",
    }),
    "unknown",
  );
  assert.equal(c.writes, 0);
});
test("固定来源不存在失败", async () => {
  const { c, ref } = fixture();
  const badRef = { ...ref, sha256: "f".repeat(64) };
  bad(
    await c.invoke("save_project", {
      content: newProject(),
      source_refs: [badRef],
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "bad-source",
    }),
    "not_found",
  );
});
test("来源只追加，不重定向旧索引", async () => {
  const { c, ref } = fixture();
  const r = await create(c, [ref]);
  bad(
    await c.invoke("save_project", {
      ...base(r, "replace"),
      source_refs: [],
      content: r.object.content,
    }),
    "hetu.stale_evidence",
  );
});
test("列表、搜索、比较和固定导出分块", async () => {
  const { c } = fixture();
  let r = await create(c);
  assert.equal(
    value(await c.invoke("list_projects", { query: "雨港" })).objects.length,
    1,
  );
  r = value(
    await c.invoke("save_project", {
      ...base(r, "second"),
      content: { ...r.object.content, title: "雨港新版" },
    }),
  );
  assert.deepEqual(
    value(
      await c.invoke("compare_versions", {
        object_id: r.object.object_id,
        from_revision: 1,
        to_revision: 2,
      }),
    ).changes,
    ["title"],
  );
  let out = "",
    offset = 0;
  do {
    const x = value(
      await c.invoke("export_project", {
        object_id: r.object.object_id,
        revision: 2,
        format: "json",
        offset,
        max_bytes: 71,
      }),
    );
    assert.equal(sha(x.content), x.content_sha256);
    out += x.content;
    if (x.next_offset === null) break;
    offset = x.next_offset;
  } while (true);
  assert.equal(JSON.parse(out).project.title, "雨港新版");
  bad(
    await c.invoke("export_project", {
      object_id: r.object.object_id,
      format: "json",
      offset: 999999,
    }),
  );
});
test("专业对象大小与标题字节预算", async () => {
  const { c } = fixture();
  const p = newProject("雨".repeat(180));
  bad(
    await c.invoke("save_project", {
      content: p,
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "long",
    }),
  );
});
{
  test("图鉴关系、事件与布局引用不悬空", async () => {
    const { c, ref } = fixture();
    let r = await create(c, [ref]);
    r = value(await c.invoke("put_node", { ...base(r, "lin"), node: node() }));
    r = value(
      await c.invoke("put_node", { ...base(r, "chen"), node: node("chen") }),
    );
    r = value(
      await c.invoke("put_relation", {
        ...base(r, "relation"),
        relation: {
          id: "r",
          from: "lin",
          to: "chen",
          kind: "旧友",
          summary: "共同守候",
          evidence: [evidence],
        },
      }),
    );
    bad(
      await c.invoke("remove_node", {
        ...base(r, "remove-used"),
        node_id: "lin",
      }),
    );
    bad(
      await c.invoke("put_relation", {
        ...base(r, "missing"),
        relation: {
          id: "m",
          from: "unknown",
          to: "chen",
          kind: "未知",
          summary: "",
          evidence: [],
        },
      }),
    );
    r = value(
      await c.invoke("put_event", {
        ...base(r, "event"),
        event: {
          id: "e1",
          title: "来信",
          summary: "收到来信",
          participants: ["lin"],
          story_time: null,
          narrative_order: 3,
          evidence: [evidence],
        },
      }),
    );
    const timeline = value(
      await c.invoke("get_projection", {
        object_id: r.object.object_id,
        view: "timeline",
      }),
    );
    assert.equal(timeline.events[0].story_time, null);
    bad(
      await c.invoke("set_layout", {
        ...base(r, "layout"),
        layout: [{ node_id: "unknown", x: 0, y: 0 }],
      }),
    );
  });
  test("恶意文本离线导出不执行、不加载网络、不默认含全文", async () => {
    const { c, ref } = fixture();
    let r = await create(c, [ref]);
    r = value(
      await c.invoke("put_node", {
        ...base(r, "evil"),
        node: {
          ...node(),
          name: "</script><script>globalThis.pwned=1</script>",
        },
      }),
    );
    const out = value(
      await c.invoke("export_project", {
        object_id: r.object.object_id,
        format: "html",
        max_bytes: 100000,
      }),
    );
    assert.ok(!out.content.includes("<script>"));
    assert.ok(out.content.includes("&lt;/script&gt;"));
    assert.ok(out.content.includes("default-src 'none'"));
    assert.ok(!out.content.includes(before));
  });
  test("投影共享同源专业数据，unknown位置不填伪坐标", () => {
    const p = newProject();
    p.nodes = [node()];
    assert.equal(projection(p, "characters").nodes.length, 1);
    assert.deepEqual(projection(p, "locations").nodes, []);
    assert.deepEqual(projection(p, "relations").layout, []);
  });
}
test("同包Skill与动作Schema齐全", async () => {
  const { readFile } = await import("node:fs/promises");
  const skill = manifest.contributions.skills[0];
  for (const file of [
    skill.entry,
    "skills/" + skill.name + "/references/workflow.md",
    "skills/" + skill.name + "/references/operations.md",
  ])
    assert.ok((await readFile(file, "utf8")).length > 100);
  for (const action of manifest.contributions.actions) {
    assert.ok(action.input_schema.required);
    assert.ok(
      action.effect === "read" || action.input_schema.properties.operation_key,
    );
  }
});

test("正式设定投影保留人物、势力、地点类型与实体ID", async () => {
  const { c, ref } = fixture();
  const bp = {
    kind: "blueprint",
    work_ref: c.work,
    blueprint_id: "blueprint_fixed",
    revision: 2,
    sha256: "b".repeat(64),
  };
  c.sources.set(canonical(bp), {
    blueprint: {
      characters: [
        {
          character_id: "character_lin",
          name: "林溪",
          description: "守信人",
          archived: false,
        },
      ],
      factions: [
        {
          faction_id: "faction_post",
          name: "旧邮局",
          description: "旧港驿站",
          archived: false,
        },
      ],
      locations: [
        {
          location_id: "location_harbor",
          name: "雨港",
          description: "旧港",
          archived: false,
        },
      ],
    },
  });
  const r = await create(c, [ref, bp]);
  const projected = value(
    await c.invoke("project_blueprint", {
      object_id: r.object.object_id,
      source_index: 1,
    }),
  );
  assert.deepEqual(
    projected.nodes.map((n: any) => n.kind),
    ["character", "group", "location"],
  );
  assert.equal(projected.nodes[2].entity_ref, "location_harbor");
  const saved = value(
    await c.invoke("put_node", {
      ...base(r, "canonical"),
      node: projected.nodes[0],
    }),
  );
  assert.equal(saved.object.content.nodes[0].status, "canonical_projection");
});

test("分类投影包含势力与概念，不混入其他目录", () => {
  const p=newProject();
  p.nodes=[node(),{...node("guild"),kind:"group"},{...node("idea"),kind:"concept"},{...node("port"),kind:"location"}];
  assert.deepEqual(projection(p,"characters").nodes.map((v:any)=>v.id),["lin","guild"]);
  assert.deepEqual(projection(p,"items").nodes.map((v:any)=>v.id),["idea"]);
  assert.deepEqual(projection(p,"locations").nodes.map((v:any)=>v.id),["port"]);
});
