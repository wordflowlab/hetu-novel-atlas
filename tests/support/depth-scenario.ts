import assert from "node:assert/strict";
import { newProject } from "../../src/domain/model.ts";
import { newDepth } from "../../src/domain/depth.ts";
export function fixtureContent(ev: any) {
  const p = newProject("雨港图鉴深化"),
    node = (id: string, name: string, kind: string) => ({
      id,
      name,
      kind,
      summary: "固定片段的专业投影",
      status: "extracted",
      evidence: [ev],
      canonical_source_index: null,
      entity_ref: null,
      attributes: [],
    });
  p.nodes = [
    node("lin", "林溪", "character"),
    node("chen", "陈舟", "character"),
    node("post", "旧邮局", "location"),
    node("harbor", "雨港渡口", "location"),
    node("unknown", "山中旧路", "location"),
    node("letter", "旧信", "item"),
  ];
  p.events = [1, 2, 3].map((n) => ({
    id: "e" + n,
    title: ["初见旧信", "赶往渡口", "归还来信"][n - 1],
    summary: "所读范围内的事件",
    participants: ["lin"],
    story_time: null,
    narrative_order: n,
    evidence: [ev],
  }));
  const geometry = (id: string, node_id: string, x: number) => ({
    id,
    node_id,
    space: "雨港示意",
    mode: "schematic",
    coordinate_system: null,
    unit: null,
    parent_id: null,
    x,
    y: 100,
    evidence: [ev],
  });
  const observation = (
    id: string,
    event_id: string,
    numeric_value: number | null,
    value: string,
  ) => ({
    id,
    kind: "attribute",
    entity_id: "lin",
    other_id: null,
    event_id,
    key: "信任",
    value,
    numeric_value,
    unit: numeric_value === null ? null : "作者显式量表",
    basis: "observed",
    perspective: null,
    evidence: [ev],
    depends_on_ids: [],
  });
  p.depth = {
    ...newDepth(),
    geometries: [geometry("g1", "post", 0), geometry("g2", "harbor", 100)],
    routes: [
      {
        id: "route",
        entity_id: "lin",
        from: "post",
        to: "harbor",
        event_id: "e2",
        duration: "数日后",
        distance: null,
        unit: null,
        evidence: [ev],
      },
    ],
    observations: [
      observation("o1", "e1", 2, "略微信任"),
      observation("o2", "e2", 1, "信任下降"),
      {
        ...observation("relation", "e2", null, "由信任转为怀疑"),
        kind: "relation",
        other_id: "chen",
        perspective: "lin",
      },
      {
        ...observation("item", "e3", null, "return"),
        kind: "item",
        entity_id: "letter",
        other_id: "chen",
        key: "transfer",
      },
      {
        ...observation("appearance", "e1", null, "mention"),
        kind: "appearance",
        key: "appearance",
      },
    ],
    extractions: [],
  };
  return p;
}
export async function runDepthScenario(c: any, refs: any[], ev: any) {
  let r = await c.invoke("save_project", {
      content: fixtureContent(ev),
      source_refs: refs,
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "depth-create",
    }),
    serial = 0;
  const write = async (a: string, i: any) =>
    (r = await c.invoke(a, {
      object_id: r.object.object_id,
      expected_revision: r.object.revision,
      expected_sha256: r.sha256,
      operation_key: "depth-" + ++serial,
      ...i,
    }));
  const read = (a: string, i: any = {}) =>
    c.invoke(a, {
      object_id: r.object.object_id,
      revision: r.object.revision,
      ...i,
    });
  await write("save_depth", { depth: r.object.content.depth });
  await write("put_place_geometry", {
    geometry: r.object.content.depth.geometries[0],
  });
  await write("put_route_segment", { route: r.object.content.depth.routes[0] });
  await write("put_observation", {
    observation: r.object.content.depth.observations[0],
  });
  await write("put_extraction_run", {
    extraction: {
      id: "read",
      extractor_version: "agent-reviewed-1",
      blocks: [
        {
          id: "block0",
          source_index: 0,
          status: "completed",
          error: "",
          result_ids: ["lin", "e1", "o1"],
        },
      ],
      ambiguities: ["山中旧路位置未知"],
    },
  });
  const out = await read("get_projection_bundle");
  assert.equal(out.routes[0].distance, null);
  assert.equal(out.growth[0].points[1].numeric_value, 1);
  assert.equal(out.items[0].holder, "chen");
  assert.equal(out.unknown_locations.length, 1);
  const affected = await read("preview_projection_update", {
    changed_source_indices: [0],
  });
  assert.ok(affected.affected.some((x: any) => x.id === "o2"));
  assert.equal(affected.unchanged_projection, true);
  const previous = {
    owner_plugin_id: "org.wordflowlab.novel-atlas",
    object_id: r.object.object_id,
    revision: r.object.revision,
    sha256: r.sha256,
  };
  await write("save_depth", {
    depth: { ...r.object.content.depth, basis_refs: [previous] },
  });
  const basis = await read("inspect_basis", { basis_index: 0 });
  assert.equal(basis.record.sha256, previous.sha256);
  return r;
}
