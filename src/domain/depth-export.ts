import { bundle } from "./depth.ts";
const esc = (s: unknown) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function depthHtml(p: any) {
  const b = bundle(p),
    name = (id: string) =>
      esc(p.nodes.find((n: any) => n.id === id)?.name ?? id),
    event = (id: string) =>
      esc(p.events.find((e: any) => e.id === id)?.title ?? id);
  const evidence = (v: any) =>
    (v.evidence ?? [])
      .map(
        (e: any) =>
          `<blockquote>${esc(e.quote)}<small>固定来源 ${e.source_index + 1}，UTF-8 ${e.byte_start}–${e.byte_end}</small></blockquote>`,
      )
      .join("");
  const table = (heads: string[], rows: string[][]) =>
    `<table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const maps = b.spaces
    .map((s) => {
      const points = s.geometries.filter((g: any) => g.x !== null),
        xs = points.map((g: any) => g.x),
        ys = points.map((g: any) => g.y),
        position = new Map<string, any>();
      for (const g of points)
        position.set(g.node_id, {
          x:
            60 +
            ((g.x - Math.min(...xs)) /
              Math.max(1, Math.max(...xs) - Math.min(...xs))) *
              620,
          y:
            50 +
            ((g.y - Math.min(...ys)) /
              Math.max(1, Math.max(...ys) - Math.min(...ys))) *
              210,
        });
      const lines = b.routes
        .filter((r: any) => position.has(r.from) && position.has(r.to))
        .map((r: any) => {
          const a = position.get(r.from),
            z = position.get(r.to);
          return `<line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}"/>`;
        })
        .join("");
      const nodes = points
        .map((g: any) => {
          const c = position.get(g.node_id);
          return `<circle cx="${c.x}" cy="${c.y}" r="6"/><text x="${c.x + 10}" y="${c.y}">${name(g.node_id)}</text>`;
        })
        .join("");
      return `<section><h3>${esc(s.space)}</h3><p>${esc(s.basis)}</p>${points.length ? `<svg viewBox="0 0 850 320" role="img" aria-label="离线地点与行程图">${lines}${nodes}</svg>` : "<p>拓扑位置；无地理坐标。</p>"}${table(
        ["地点", "位置", "依据"],
        s.geometries.map((g: any) => [
          name(g.node_id),
          g.x === null
            ? "坐标未知"
            : `${g.x}, ${g.y} ${esc(g.unit ?? "示意位置")}`,
          evidence(g),
        ]),
      )}</section>`;
    })
    .join("");
  const changes = b.growth
    .map((g: any) => {
      const values = g.points.map((o: any) => o.numeric_value),
        orders = g.points.map(
          (o: any) =>
            p.events.find((e: any) => e.id === o.event_id).narrative_order,
        ),
        low = Math.min(...values),
        high = Math.max(...values);
      const coords = g.points.map((o: any, i: number) => ({
        x:
          60 +
          ((orders[i] - Math.min(...orders)) /
            Math.max(1, Math.max(...orders) - Math.min(...orders))) *
            620,
        y: 240 - ((o.numeric_value - low) / Math.max(1, high - low)) * 190,
      }));
      const svg =
        g.representation === "curve"
          ? `<svg viewBox="0 0 850 300" role="img" aria-label="离线属性变化曲线"><polyline fill="none" stroke="currentColor" points="${coords.map((c: any) => c.x + "," + c.y).join(" ")}"/>${coords.map((c: any, i: number) => `<circle cx="${c.x}" cy="${c.y}" r="5"/><text x="${c.x + 10}" y="${c.y - 10}">${values[i]}</text><text x="${c.x}" y="280">${orders[i]}</text>`).join("")}</svg>`
          : "";
      return `<section><h3>${name(g.entity_id)} ${esc(g.key)} ${esc(g.unit ?? "定性阶段")}，${esc(g.basis)}</h3>${svg}${table(
        ["叙事事件", "变化", "依据"],
        g.points.map((o: any) => [
          event(o.event_id),
          esc(o.numeric_value ?? o.value),
          evidence(o),
        ]),
      )}</section>`;
    })
    .join("");
  return `<section id="depth-map"><h2>地图与行程</h2>${maps}<h3>未知位置</h3><p>${b.unknown_locations.map((n: any) => esc(n.name)).join("、") || "无新增未知位置"}</p>${table(
    ["人物", "行程", "事件", "耗时／距离", "依据"],
    b.routes.map((r: any) => [
      name(r.entity_id),
      name(r.from) + " → " + name(r.to),
      event(r.event_id),
      esc(r.duration ?? "未知耗时") +
        " / " +
        (r.distance === null ? "未知距离" : r.distance + " " + esc(r.unit)),
      evidence(r),
    ]),
  )}</section><section id="depth-growth"><h2>变化曲线与阶段</h2><p>${esc(b.time_basis)}</p>${changes}<h3>单向关系阶段</h3>${table(
    ["起点", "终点", "变化", "叙述视角", "依据"],
    b.relationships.map((o: any) => [
      name(o.entity_id),
      name(o.other_id),
      esc(o.value) + " / " + esc(o.basis),
      esc(o.perspective ?? "未指定"),
      evidence(o),
    ]),
  )}</section><section id="depth-items"><h2>器物流转</h2>${b.items
    .map(
      (item: any) =>
        `<h3>${name(item.entity_id)}</h3><p>${item.holder ? "观察到持有人：" + name(item.holder) : "持有人未知或已销毁"}</p>${table(
          ["事件", "流转", "目标", "依据"],
          item.transfers.map((o: any) => [
            event(o.event_id),
            esc(o.value) + " / " + esc(o.basis),
            o.other_id ? name(o.other_id) : "未知",
            evidence(o),
          ]),
        )}`,
    )
    .join(
      "",
    )}</section><section id="depth-coverage"><h2>阅读与抽取覆盖</h2>${table(
    ["人物", "事件", "提及／出场／视角", "依据"],
    b.appearances.map((o: any) => [
      name(o.entity_id),
      event(o.event_id),
      esc(o.value),
      evidence(o),
    ]),
  )}${b.extractions
    .map(
      (x: any) =>
        `<h3>完成 ${x.completed} / ${x.total}</h3>${table(
          ["固定来源", "状态", "失败原因"],
          x.blocks.map((block: any) => [
            String(block.source_index + 1),
            esc(block.status),
            esc(block.error),
          ]),
        )}<p>${x.ambiguities.map(esc).join("；")}</p>`,
    )
    .join("")}</section>`;
}
