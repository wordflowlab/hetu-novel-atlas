import { validateDepth } from "./depth.ts";
import manifest from "../../contracts/plugin-manifest.json" with { type: "json" };
import {
  canonical,
  clone,
  requireValue as need,
} from "../../vendor/project-store.ts";
import * as validators from "./validators.ts";
export { canonical, clone };
export const PLUGIN_ID = manifest.id,
  KIND = manifest.contributions.data[0].kind,
  WORK_KIND = "novel";
export const effects = new Set(
  manifest.contributions.actions
    .filter((a) => a.effect === "managed_write")
    .map((a) => a.id),
);
export function validateAction(action: string, input: unknown) {
  const f = (validators as any)[action];
  need(f, "未知专业动作。", "not_found");
  need(f(input), "动作参数不符合Schema：" + JSON.stringify(f.errors));
}
export function validate(p: any) {
  const f = (validators as any).project;
  need(f(p), "专业数据不符合Schema：" + JSON.stringify(f.errors));
  validateDepth(p);
  for (const [k, list] of Object.entries(p))
    if (
      Array.isArray(list) &&
      list.some((v) => v && typeof v === "object" && "id" in v)
    ) {
      const ids = list.map((v) => v.id);
      need(new Set(ids).size === ids.length, "重复专业ID：" + k);
    }
  {
    const ids = new Set(p.nodes.map((x: any) => x.id));
    for (const v of p.relations)
      need(ids.has(v.from) && ids.has(v.to), "关系端点不存在。");
    for (const v of p.events)
      need(
        v.participants.every((id: string) => ids.has(id)),
        "事件参与者不存在。",
      );
    need(
      new Set(p.layout.map((x: any) => x.node_id)).size === p.layout.length,
      "布局重复。",
    );
    for (const v of p.layout) need(ids.has(v.node_id), "布局节点不存在。");
    for (const v of p.nodes)
      if (v.status === "canonical_projection")
        need(
          v.canonical_source_index !== null && v.entity_ref,
          "正式设定投影需要固定实体。",
        );
  }
}
export function newProject(title = "未命名方案"): any {
  return {
    format_version: 1,
    title,
    nodes: [],
    relations: [],
    events: [],
    layout: [],
  };
}
export function sourceIndices(p: any): number[] {
  const out: number[] = [];
  function visit(v: any) {
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if ((k === "source_index" || k.endsWith("_source_index")) && x !== null)
        out.push(x as number);
      else if (
        [
          "source_indices",
          "scope_indices",
          "resolution_source_indices",
        ].includes(k)
      )
        out.push(...(x as number[]));
      else visit(x);
    }
  }
  visit(p);
  return out;
}
export function projection(p: any, view: string) {
  const kinds: Record<string, string[]> = {
    characters: ["character", "group"],
    locations: ["location"],
    items: ["item", "concept"],
  };
  if (kinds[view])
    return {
      view,
      nodes: p.nodes.filter((x: any) => kinds[view].includes(x.kind)),
    };
  if (view === "timeline")
    return {
      view,
      events: [...p.events].sort(
        (a, b) => a.narrative_order - b.narrative_order,
      ),
      time_basis: "叙事顺序；未知故事时间保留null",
    };
  if (view === "growth")
    return {
      view,
      nodes: p.nodes.map((x: any) => ({
        id: x.id,
        name: x.name,
        attributes: x.attributes,
      })),
      events: p.events,
    };
  return {
    view,
    nodes: p.nodes,
    relations: p.relations,
    events: p.events,
    layout: p.layout,
    layout_basis: "示意布局，不代表真实地理",
  };
}
