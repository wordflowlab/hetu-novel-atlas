import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonical } from "../vendor/project-store.ts";
import { memoryCore } from "./support/memory-core.ts";
import { fixtureContent, runDepthScenario } from "./support/depth-scenario.ts";
import { newProject, validate } from "../src/domain/model.ts";
import { bundle, impact } from "../src/domain/depth.ts";
const ev = { source_index: 0, byte_start: 0, byte_end: 9, quote: "雨港。" },
  p = () => fixtureContent(ev);
test("NAD-01 unknown coordinates remain unknown and schematic is explicit", () => {
  const b = bundle(p());
  assert.equal(b.unknown_locations[0].id, "unknown");
  assert.match(b.spaces[0].basis, /示意/);
  assert.equal(b.routes[0].distance, null);
});
test("NAD-02 coordinate systems, units and parent cycles are validated", () => {
  const a = p();
  a.depth.geometries[0].mode = "coordinate";
  assert.throws(() => validate(a));
  Object.assign(a.depth.geometries[0], {
    unit: "km",
    coordinate_system: "local",
  });
  Object.assign(a.depth.geometries[1], {
    mode: "coordinate",
    unit: "km",
    coordinate_system: "local",
  });
  validate(a);
  Object.assign(a.depth.geometries[1], {
    mode: "coordinate",
    unit: "mile",
    coordinate_system: "local",
  });
  assert.throws(() => validate(a));
});
test("NAD-03 no invented distance from travel duration", () => {
  const b = bundle(p());
  assert.equal(b.routes[0].duration, "数日后");
  assert.equal(b.routes[0].distance, null);
});
test("NAD-04 numeric decline is a curve; qualitative stage is not scored", () => {
  const a = p();
  const b = bundle(a);
  assert.equal(b.growth[0].representation, "curve");
  assert.deepEqual(
    b.growth[0].points.map((x: any) => x.numeric_value),
    [2, 1],
  );
  a.depth.observations[0].numeric_value = null;
  a.depth.observations[0].unit = null;
  assert.equal(
    bundle(a).growth.some((g) => g.representation === "stages"),
    true,
  );
});
test("NAD-05 directional relationship, perspective and plans stay separate", () => {
  const a = p();
  const r = a.depth.observations.find((o: any) => o.kind === "relation");
  r.basis = "planned";
  const x = bundle(a).relationships[0];
  assert.equal(x.entity_id, "lin");
  assert.equal(x.other_id, "chen");
  assert.equal(x.perspective, "lin");
  assert.equal(x.basis, "planned");
});
test("NAD-06 item holder and destruction use exact item ref", () => {
  const a = p();
  assert.equal(bundle(a).items[0].holder, "chen");
  a.depth.observations.find((o: any) => o.kind === "item").value = "destroy";
  assert.equal(bundle(a).items[0].holder_status, "destroyed");
  assert.equal(bundle(a).items[0].holder, null);
});
test("NAD-07 mention is not actual appearance", () => {
  assert.equal(bundle(p()).appearances[0].value, "mention");
});
test("NAD-08 unread and failed blocks never count as complete", () => {
  const a = p();
  a.depth.extractions = [
    {
      id: "x",
      extractor_version: "1",
      blocks: [
        {
          id: "a",
          source_index: 0,
          status: "unread",
          error: "",
          result_ids: [],
        },
      ],
      ambiguities: [],
    },
  ];
  validate(a);
  assert.equal(bundle(a).extractions[0].completed, 0);
  a.depth.extractions[0].blocks[0].result_ids = ["lin"];
  assert.throws(() => validate(a));
});
test("NAD-09 direct and indirect source impact preserves old projection", () => {
  const a = p(),
    old = canonical(a);
  a.depth.observations[1].evidence = [];
  a.depth.observations[1].basis = "hypothesis";
  a.depth.observations[1].depends_on_ids = ["o1"];
  const x = impact(a, [0]);
  assert.ok(x.affected.some((v) => v.id === "o2"));
  assert.equal(x.complete_semantic_recall, false);
  assert.equal(canonical(p()), old);
});
test("NAD-10/11 filters stay on same project; dangling links rejected", () => {
  const a = p();
  const x = bundle(a, ["e1"], ["lin"]);
  assert.equal(x.growth[0].points.length, 1);
  a.nodes = a.nodes.filter((n: any) => n.id !== "harbor");
  assert.throws(() => validate(a));
});
test("NAD-12 topology never stores invented real positions", () => {
  const a = p();
  a.depth.geometries[0].mode = "topology";
  assert.throws(() => validate(a));
  Object.assign(a.depth.geometries[0], { x: null, y: null });
  Object.assign(a.depth.geometries[1], { mode: "topology", x: null, y: null });
  validate(a);
});
test("NAD-13 old v1 unchanged and new action flow uses public fixed sources", async () => {
  const old = newProject();
  validate(old);
  assert.equal("depth" in old, false);
  const c = memoryCore(),
    text = "雨港。\n",
    ref = {
      kind: "document",
      work_ref: c.work,
      document_id: "document_d",
      revision_id: "revision_d",
      sha256: createHash("sha256").update(text).digest("hex"),
    };
  c.sources.set(canonical(ref), { source_ref: ref, content: text });
  await runDepthScenario(
    {
      invoke: async (a: string, i: any) => {
        const r = await c.invoke(a, i);
        assert.equal(r.status, "succeeded", JSON.stringify(r));
        return r.data;
      },
    },
    [ref],
    ev,
  );
});
