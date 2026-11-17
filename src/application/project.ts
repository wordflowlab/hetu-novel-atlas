import { offlineHtml } from "../domain/export.ts";
import { createHash } from "node:crypto";
import type { BackendContext, ObjectResult } from "../../vendor/hetu-sdk.ts";
import {
  failure,
  fixed,
  requireValue as need,
  ProjectError,
  ProjectStore,
  success,
} from "../../vendor/project-store.ts";
import {
  canonical,
  clone,
  effects,
  KIND,
  PLUGIN_ID,
  projection,
  sourceIndices,
  validate,
  validateAction,
} from "../domain/model.ts";
const hash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
const bytes = (v: string) => Buffer.from(v, "utf8");
function boundary(b: Buffer, i: number) {
  return i === b.length || (i >= 0 && i < b.length && (b[i] & 0xc0) !== 0x80);
}
function span(text: string, start: number, end: number) {
  const b = bytes(text);
  need(
    start <= end && boundary(b, start) && boundary(b, end),
    "选区越界或不是UTF-8边界。",
  );
  return b.subarray(start, end);
}
function textOf(source: any) {
  need(typeof source?.content === "string", "此来源不是可读取的文稿。");
  return source.content as string;
}
export class Project {
  readonly store: ProjectStore;
  readonly context: BackendContext;
  constructor(context: BackendContext) {
    this.context = context;
    this.store = new ProjectStore(context, PLUGIN_ID, KIND, validate);
  }
  async sources(record: any) {
    return this.store.sources(record.object.source_refs ?? []);
  }
  async check(p: any, refs: any[]) {
    validate(p);
    need(
      sourceIndices(p).every(
        (i) => Number.isInteger(i) && i >= 0 && i < refs.length,
      ),
      "固定来源索引越界。",
    );
    const sources = await this.store.sources(refs);
    const inspect = (v: any) => {
      if (!v || typeof v !== "object") return;
      if ("quote" in v) {
        const text = textOf(sources[v.source_index]);
        need(
          span(text, v.byte_start, v.byte_end).toString("utf8") === v.quote,
          "证据引文与固定来源不一致。",
        );
      }
      for (const x of Object.values(v)) inspect(x);
    };
    inspect(p);
    for (const n of p.nodes)
      if (n.status === "canonical_projection") {
        const source = sources[n.canonical_source_index],
          ref = refs[n.canonical_source_index];
        need(ref.kind === "blueprint", "正式投影必须引用固定设定。");
        const entity = findEntity(source, n.entity_ref);
        need(entity, "固定设定中不存在该实体。");
      }
  }
  async save(input: any, p: any, old?: ObjectResult) {
    const refs = input.source_refs ?? old?.object.source_refs ?? [];
    await this.check(p, refs);
    return this.store.save(input, p, old);
  }
  async invoke(action: string, raw: unknown) {
    try {
      validateAction(action, raw);
      const i: any = clone(raw);
      if (effects.has(action)) {
        const recovered = await this.store.recover(i.operation_key);
        if (recovered) return recovered;
      }
      if (action === "get_operation")
        return this.store.call("hetu.extensions.operations.get", i);
      if (action === "list_projects")
        return this.store.call(
          i.query
            ? "hetu.extensions.objects.search"
            : "hetu.extensions.objects.list",
          { ...i, kind: KIND },
        );
      if (action === "save_project") {
        need(
          i.object_id
            ? i.expected_revision > 0 && i.expected_sha256.length === 64
            : i.expected_revision === 0 && i.expected_sha256 === "",
          "新建或更新基线无效。",
        );
        const old = i.object_id ? await this.store.baseline(i) : undefined;
        return await this.save(i, i.content, old);
      }
      if (action === "compare_versions") {
        const a = await this.store.get(i.object_id, i.from_revision),
          b = await this.store.get(i.object_id, i.to_revision);
        return success({
          from_ref: fixed(a),
          to_ref: fixed(b),
          changes: Object.keys(b.object.content as any).filter(
            (k) =>
              canonical((a.object.content as any)[k]) !==
              canonical((b.object.content as any)[k]),
          ),
        });
      }
      const r = effects.has(action)
          ? await this.store.baseline(i)
          : await this.store.get(i.object_id, i.revision),
        p: any = clone(r.object.content);
      if (effects.has(action)) {
        if (action === "set_layout") p.layout = i.layout;
        else {
          const [verb, item] = action.split("_");
          const fields: Record<string, string> = {
            node: "nodes",
            relation: "relations",
            event: "events",
          };
          const field = fields[item];
          need(field && ["put", "remove"].includes(verb), "未知写动作。");
          const list = p[field];
          if (verb === "put") {
            const at = list.findIndex((x: any) => x.id === i[item].id);
            if (at < 0) list.push(i[item]);
            else list[at] = i[item];
          } else {
            need(
              list.some((x: any) => x.id === i[item + "_id"]),
              "记录不存在。",
            );
            p[field] = list.filter((x: any) => x.id !== i[item + "_id"]);
          }
        }
        return await this.save(i, p, r);
      }
      if (action === "get_project") return success(r);
      if (action === "get_projection")
        return success({ project_ref: fixed(r), ...projection(p, i.view) });
      if (action === "export_project") {
        const report = {
          format: "hetu." + KIND,
          version: 1,
          project_ref: fixed(r),
          work_ref: this.context.work_ref,
          source_refs: r.object.source_refs ?? [],
          project: p,
        };
        const json = JSON.stringify(report, null, 2);
        const markdown =
          "# " +
          p.title +
          "\n\n固定专业报告；采纳与定稿独立决定。\n\n```json\n" +
          json +
          "\n```\n";
        const html = offlineHtml(p, report);
        const content =
            i.format === "json" ? json : i.format === "html" ? html : markdown,
          b = bytes(content),
          offset = i.offset ?? 0;
        need(boundary(b, offset), "导出偏移不是UTF-8边界。");
        let end = Math.min(b.length, offset + (i.max_bytes ?? 32768));
        while (!boundary(b, end)) end--;
        const chunk = b.subarray(offset, end).toString("utf8");
        return success({
          project_ref: fixed(r),
          content: chunk,
          offset,
          next_offset: end === b.length ? null : end,
          total_bytes: b.length,
          content_sha256: hash(chunk),
          media_type:
            i.format === "html"
              ? "text/html"
              : i.format === "json"
                ? "application/json"
                : "text/markdown",
        });
      }
      const sources = await this.sources(r);
      const source = (index: number) => {
        need(index < sources.length, "来源索引越界。");
        return sources[index];
      };
      if (action === "get_source")
        return success({ project_ref: fixed(r), ...source(i.source_index) });
      if (action === "project_blueprint") {
        const s = source(i.source_index),
          ref = (r.object.source_refs ?? [])[i.source_index];
        need(ref.kind === "blueprint", "需要固定设定来源。");
        const entities = entitiesOf(s);
        return success({
          project_ref: fixed(r),
          nodes: entities.map((e: any) => ({
            id: e._entity_ref,
            name: e.name ?? e.title ?? "未命名设定",
            kind: e._kind,
            summary: e.description ?? e.summary ?? "",
            status: "canonical_projection",
            evidence: [],
            canonical_source_index: i.source_index,
            entity_ref: e._entity_ref,
            attributes: [],
          })),
          basis: "固定设定的只读投影候选，不写正式设定",
        });
      }
      throw new ProjectError("未知动作。", "not_found");
    } catch (e) {
      return failure(e);
    }
  }
}
function entitiesOf(source: any): any[] {
  const root = source.blueprint ?? source;
  const content = root.content ?? root;
  const collections = [
    ["characters", "character_id", "character"],
    ["factions", "faction_id", "group"],
    ["locations", "location_id", "location"],
    ["timeline", "event_id", "concept"],
    ["world", "entry_id", "concept"],
    ["rules", "rule_id", "concept"],
  ];
  return collections
    .flatMap(([collection, field, kind]) =>
      (content[collection] ?? [])
        .filter((e: any) => !e.archived)
        .map((e: any) => ({ ...e, _entity_ref: e[field], _kind: kind })),
    )
    .filter((e) => typeof e._entity_ref === "string");
}
function findEntity(source: any, id: string) {
  return entitiesOf(source).find((x) => x._entity_ref === id);
}
