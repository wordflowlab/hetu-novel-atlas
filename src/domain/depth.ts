import { requireValue as need, canonical } from "../../vendor/project-store.ts";
export const depthWrites: Record<string, [string, string]> = {
  put_place_geometry: ["geometries", "geometry"],
  put_route_segment: ["routes", "route"],
  put_observation: ["observations", "observation"],
  put_extraction_run: ["extractions", "extraction"],
};
export const newDepth = () => ({
  version: 1,
  geometries: [],
  routes: [],
  observations: [],
  extractions: [],
});
export function validateDepth(p: any) {
  if (!p.depth) return;
  const d = p.depth,
    nodes = new Map<string, any>(p.nodes.map((x: any) => [x.id, x])),
    events = new Set(p.events.map((x: any) => x.id));
  for (const key of ["geometries", "routes", "observations", "extractions"])
    need(
      new Set(d[key].map((x: any) => x.id)).size === d[key].length,
      "深化记录ID重复：" + key,
    );
  for (const g of d.geometries) {
    need(nodes.get(g.node_id)?.kind === "location", "空间几何需要地点引用。");
    need((g.x === null) === (g.y === null), "坐标必须成对提供。");
    if (g.mode === "coordinate")
      need(
        g.x !== null && g.coordinate_system !== null && g.unit !== null,
        "坐标空间需要坐标系、单位和明确坐标。",
      );
    if (g.mode === "topology")
      need(g.x === null && g.y === null, "拓扑位置不保存假地理坐标。");
    if (g.parent_id !== null)
      need(
        d.geometries.some((x: any) => x.id === g.parent_id),
        "父空间不存在。",
      );
    const seen = new Set<string>([g.id]);
    let parent = g.parent_id;
    while (parent !== null) {
      need(!seen.has(parent), "空间包含关系成环。");
      seen.add(parent);
      parent = d.geometries.find((x: any) => x.id === parent).parent_id;
    }
    need(
      d.geometries
        .filter((x: any) => x.space === g.space)
        .every((x: any) => x.mode === g.mode),
      "同一空间不能混用示意、坐标和拓扑定位。",
    );
    for (const other of d.geometries.filter(
      (x: any) =>
        x.space === g.space &&
        x.mode === "coordinate" &&
        g.mode === "coordinate",
    ))
      need(
        other.unit === g.unit &&
          other.coordinate_system === g.coordinate_system,
        "同一坐标空间不能混用单位或坐标系。",
      );
  }
  need(
    new Set(d.geometries.map((g: any) => canonical([g.space, g.node_id])))
      .size === d.geometries.length,
    "同一地点在同一空间的位置重复。",
  );
  for (const r of d.routes) {
    need(
      ["character", "group"].includes(nodes.get(r.entity_id)?.kind),
      "行程需要明确人物或队伍。",
    );
    need(
      nodes.get(r.from)?.kind === "location" &&
        nodes.get(r.to)?.kind === "location" &&
        events.has(r.event_id),
      "行程地点或事件引用无效。",
    );
    need(
      (r.distance === null) === (r.unit === null),
      "距离和单位必须成对提供。",
    );
  }
  for (const o of d.observations) {
    need(
      nodes.has(o.entity_id) &&
        events.has(o.event_id) &&
        (o.other_id === null || nodes.has(o.other_id)),
      "观测实体或事件引用无效。",
    );
    need(
      (o.numeric_value === null) === (o.unit === null),
      "数值观测需要明确量表或单位。",
    );
    if (o.kind === "relation")
      need(o.other_id !== null, "关系观测需要明确方向端点。");
    if (o.kind === "item")
      need(
        nodes.get(o.entity_id)?.kind === "item" &&
          [
            "acquire",
            "gift",
            "borrow",
            "return",
            "destroy",
            "unknown",
          ].includes(o.value),
        "物品观测需要明确器物与流转种类。",
      );
    if (o.kind === "appearance")
      need(
        ["mention", "present", "viewpoint"].includes(o.value),
        "出场需区分提及、实际登场和视角。",
      );
    need(
      o.basis !== "observed" || o.evidence.length > 0,
      "已发生观测需要固定证据。",
    );
  }
  const allRecords = [
    ...p.nodes,
    ...p.relations,
    ...p.events,
    ...d.geometries,
    ...d.routes,
    ...d.observations,
  ];
  need(
    new Set(allRecords.map((x) => x.id)).size === allRecords.length,
    "深化依赖使用的专业ID必须在聚合内唯一。",
  );
  const records = new Set(
    [
      ...p.nodes,
      ...p.relations,
      ...p.events,
      ...d.geometries,
      ...d.routes,
      ...d.observations,
    ].map((x) => x.id),
  );
  for (const o of d.observations)
    need(
      o.depends_on_ids.every((id: string) => records.has(id)),
      "观测依赖不存在。",
    );
  for (const x of d.extractions) {
    need(
      new Set(x.blocks.map((b: any) => b.id)).size === x.blocks.length &&
        new Set(x.blocks.map((b: any) => b.source_index)).size ===
          x.blocks.length,
      "抽取分块ID或来源重复。",
    );
    for (const b of x.blocks) {
      need(
        b.result_ids.every((id: string) => records.has(id)),
        "抽取成果引用不存在。",
      );
      need(
        b.status === "completed" || b.result_ids.length === 0,
        "未读或失败分块不能声称已完成成果。",
      );
      need(b.status !== "failed" || b.error.trim(), "失败分块需要原因。");
    }
  }
}
export function bundle(p: any, eventIds?: string[], entityIds?: string[]) {
  const d = p.depth ?? newDepth();
  const selectEvent = (id: string) => !eventIds || eventIds.includes(id),
    selectEntity = (id: string) => !entityIds || entityIds.includes(id);
  if (eventIds)
    need(
      eventIds.every((id) => p.events.some((x: any) => x.id === id)),
      "筛选事件不存在。",
    );
  if (entityIds)
    need(
      entityIds.every((id) => p.nodes.some((x: any) => x.id === id)),
      "筛选实体不存在。",
    );
  const observations = d.observations.filter(
    (o: any) => selectEvent(o.event_id) && selectEntity(o.entity_id),
  );
  const ordered = (xs: any[]) =>
    [...xs].sort(
      (a, b) =>
        p.events.find((e: any) => e.id === a.event_id).narrative_order -
          p.events.find((e: any) => e.id === b.event_id).narrative_order ||
        a.id.localeCompare(b.id),
    );
  const geometries = d.geometries.filter((g: any) => selectEntity(g.node_id)),
    spaces = [...new Set<string>(geometries.map((g: any) => g.space))].map(
      (space) => ({
        space,
        geometries: geometries.filter((g: any) => g.space === space),
        basis: geometries.some(
          (g: any) => g.space === space && g.mode === "coordinate",
        )
          ? "明确坐标；不计算未知距离"
          : "示意或拓扑；不代表真实地理",
      }),
    );
  const growthGroups = new Map<string, any[]>();
  for (const o of observations.filter((x: any) => x.kind === "attribute")) {
    const key = canonical([o.entity_id, o.key, o.unit, o.basis, o.perspective]);
    growthGroups.set(key, [...(growthGroups.get(key) ?? []), o]);
  }
  const growth = [...growthGroups.values()].map((points) => ({
    entity_id: points[0].entity_id,
    key: points[0].key,
    unit: points[0].unit,
    basis: points[0].basis,
    representation:
      points.every((p) => p.numeric_value !== null) &&
      new Set(
        points.map(
          (o) => p.events.find((e: any) => e.id === o.event_id).narrative_order,
        ),
      ).size === points.length
        ? "curve"
        : "stages",
    points: ordered(points),
  }));
  const items = [
    ...new Set<string>(
      observations
        .filter((o: any) => o.kind === "item")
        .map((o: any) => o.entity_id),
    ),
  ].map((entity_id) => {
    const transfers = ordered(
      observations.filter(
        (o: any) => o.kind === "item" && o.entity_id === entity_id,
      ),
    );
    const occurred = transfers.filter((o) => o.basis === "observed"),
      last = occurred.at(-1),
      sameOrder =
        last &&
        occurred.filter(
          (o) =>
            p.events.find((e: any) => e.id === o.event_id).narrative_order ===
            p.events.find((e: any) => e.id === last.event_id).narrative_order,
        ).length > 1;
    return {
      entity_id,
      transfers,
      holder:
        last && !sameOrder && !["destroy", "unknown"].includes(last.value)
          ? last.other_id
          : null,
      holder_status: sameOrder
        ? "ambiguous"
        : last?.value === "destroy"
          ? "destroyed"
          : last && last.other_id
            ? "observed"
            : "unknown",
    };
  });
  return {
    projection_version: 1,
    time_basis: "明确叙事位置；不按故事标签推算真实时间",
    filters: { event_ids: eventIds ?? null, entity_ids: entityIds ?? null },
    spaces,
    unknown_locations: p.nodes.filter(
      (n: any) =>
        n.kind === "location" &&
        selectEntity(n.id) &&
        !geometries.some((g: any) => g.node_id === n.id && g.x !== null),
    ),
    routes: d.routes.filter(
      (r: any) => selectEvent(r.event_id) && selectEntity(r.entity_id),
    ),
    growth,
    relationships: ordered(
      observations.filter((o: any) => o.kind === "relation"),
    ),
    items,
    appearances: ordered(
      observations.filter((o: any) => o.kind === "appearance"),
    ),
    extractions: d.extractions.map((x: any) => ({
      ...x,
      completed: x.blocks.filter((b: any) => b.status === "completed").length,
      total: x.blocks.length,
    })),
    source_indices: [
      ...new Set<number>(
        [...geometries, ...observations].flatMap((v: any) =>
          v.evidence.map((e: any) => e.source_index),
        ),
      ),
    ],
    literary_review_required: true,
  };
}
export function impact(p: any, changed: number[]) {
  const d = p.depth ?? newDepth(),
    records = [
      ...p.nodes,
      ...p.relations,
      ...p.events,
      ...d.geometries,
      ...d.routes,
      ...d.observations,
    ],
    reasons = new Map<string, string[]>();
  for (const v of records)
    if (v.evidence?.some((e: any) => changed.includes(e.source_index)))
      reasons.set(v.id, ["直接依据来源变化"]);
  let progress = true;
  while (progress) {
    progress = false;
    for (const v of records) {
      if (reasons.has(v.id)) continue;
      const deps = [
        ...(v.depends_on_ids ?? []),
        v.event_id,
        v.node_id,
        v.entity_id,
        v.other_id,
        v.from,
        v.to,
        ...(v.participants ?? []),
      ].filter(Boolean);
      const hits = deps.filter((x) => reasons.has(x));
      if (hits.length) {
        reasons.set(
          v.id,
          hits.map((id) => "依赖受影响记录：" + id),
        );
        progress = true;
      }
    }
  }
  return {
    changed_source_indices: changed,
    affected: [...reasons].map(([id, reasons]) => ({
      id,
      reasons,
      status: "needs_review",
    })),
    coverage: d.extractions.flatMap((x: any) =>
      x.blocks
        .filter((b: any) => changed.includes(b.source_index))
        .map((b: any) => ({
          extraction_id: x.id,
          block_id: b.id,
          status: "needs_review",
        })),
    ),
    unchanged_projection: true,
    complete_semantic_recall: false,
  };
}
export function readDepth(p: any, action: string, i: any): any {
  if (action === "get_projection_bundle")
    return bundle(p, i.event_ids, i.entity_ids);
  if (action === "preview_projection_update")
    return impact(p, i.changed_source_indices);
  return undefined;
}
