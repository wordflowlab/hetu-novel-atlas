import React from "react";
import { bundle } from "../domain/depth.ts";
const values:Record<string,string>={acquire:"取得",gift:"赠予",borrow:"借用",return:"归还",destroy:"销毁",unknown:"未知流转",mention:"被提及",present:"实际登场",viewpoint:"叙述视角"};
const basis: Record<string, string> = {
  observed: "已发生",
  planned: "规划",
  hypothesis: "假设",
};
export function DepthView({
  p,
  tab,
  evidence,
}: {
  p: any;
  tab: string;
  evidence: (v: any) => React.ReactNode;
}) {
  const b = bundle(p),
    name = (id: string) =>
      p.nodes.find((n: any) => n.id === id)?.name ?? "对象待核对",
    event = (id: string) =>
      p.events.find((e: any) => e.id === id)?.title ?? "事件待核对";
  const record = (o: any) => (
    <article key={o.id}>
      <h3>
        {name(o.entity_id)}
        {o.other_id ? " → " + name(o.other_id) : ""}
      </h3>
      <p>
        {o.kind==="item"?"流转":o.kind==="appearance"?"出场":o.key}：{values[o.value]??o.value}，{basis[o.basis]}，{event(o.event_id)}
      </p>
      {o.perspective && <p>叙述视角：{o.perspective}</p>}
      {evidence(o)}
    </article>
  );
  if (tab === "map")
    return (
      <section aria-label="地图与行程">
        <h2>地图与行程</h2>
        {b.spaces.map((s) => (
          <section key={s.space}>
            <h3>{s.space}</h3>
            <p className="muted">{s.basis}</p>
            <SpaceMap space={s} routes={b.routes} name={name} />
            {s.geometries.map((g: any) => (
              <p key={g.id}>
                {name(g.node_id)}：
                {g.x === null
                  ? "拓扑位置，坐标未知"
                  : g.x + ", " + g.y + " " + (g.unit ?? "示意位置")}
                {evidence(g)}
              </p>
            ))}
          </section>
        ))}
        <h3>位置未知</h3>
        {b.unknown_locations.map((n: any) => (
          <p key={n.id}>{n.name}</p>
        ))}
        <h3>人物行程</h3>
        {b.routes.map((r: any) => (
          <article key={r.id}>
            <h3>
              {name(r.entity_id)}：{name(r.from)} → {name(r.to)}
            </h3>
            <p>
              {event(r.event_id)}，{r.duration ?? "耗时未知"}，
              {r.distance === null ? "距离未知" : r.distance + " " + r.unit}
            </p>
            {evidence(r)}
          </article>
        ))}
      </section>
    );
  if (tab === "changes")
    return (
      <section aria-label="变化曲线与阶段">
        <h2>成长与变化</h2>
        <p className="muted">
          横轴为叙事顺序；不同单位、定性变化和未来规划分别呈现。
        </p>
        {b.growth.map((g: any, i: number) => (
          <section key={i}>
            <h3>
              {name(g.entity_id)}：{g.key} {g.unit ?? "定性阶段"}，
              {basis[g.basis]}
            </h3>
            {g.representation === "curve" && <Curve points={g.points} p={p} />}
            <table>
              <thead>
                <tr>
                  <th>事件</th>
                  <th>变化</th>
                  <th>依据</th>
                </tr>
              </thead>
              <tbody>
                {g.points.map((o: any) => (
                  <tr key={o.id}>
                    <td>{event(o.event_id)}</td>
                    <td>{o.numeric_value ?? o.value}</td>
                    <td>{evidence(o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <h2>关系阶段</h2>
        {b.relationships.map(record)}
      </section>
    );
  if (tab === "transfers")
    return (
      <section aria-label="器物流转">
        <h2>器物流转</h2>
        {b.items.map((item: any) => (
          <section key={item.entity_id}>
            <h3>{name(item.entity_id)}</h3>
            <p>
              {item.holder_status === "destroyed"
                ? "已有销毁依据"
                : item.holder
                  ? "观察到的持有人：" + name(item.holder)
                  : "当前持有人未知或有歧义"}
            </p>
            {item.transfers.map(record)}
          </section>
        ))}
      </section>
    );
  return (
    <section aria-label="阅读与抽取覆盖">
      <h2>出场与阅读索引</h2>
      {b.appearances.map(record)}
      <h2>抽取覆盖</h2>
      {b.extractions.map((x: any) => (
        <section key={x.id}>
          <h3>
            完成 {x.completed} / {x.total}
          </h3>
          <p>{x.extractor_version}</p>
          {x.blocks.map((block: any) => (
            <p key={block.id}>
              固定来源 {block.source_index + 1}：
              {block.status === "completed"
                ? "已完成"
                : block.status === "failed"
                  ? "失败：" + block.error
                  : "未读"}
            </p>
          ))}
          {x.ambiguities.map((a: string, i: number) => (
            <p key={i}>待核对：{a}</p>
          ))}
        </section>
      ))}
    </section>
  );
}
function SpaceMap({
  space,
  routes,
  name,
}: {
  space: any;
  routes: any[];
  name: (id: string) => string;
}) {
  const points = space.geometries.filter((g: any) => g.x !== null),
    unknown = space.geometries.filter((g: any) => g.x === null);
  const scale = (v: number, min: number, max: number, length: number) =>
    60 + ((v - min) / Math.max(1, max - min)) * length;
  const xs = points.map((g: any) => g.x),
    ys = points.map((g: any) => g.y),
    coords = new Map<string, { x: number; y: number }>();
  for (const g of points)
    coords.set(g.node_id, {
      x: scale(g.x, Math.min(...xs), Math.max(...xs), 660),
      y: scale(g.y, Math.min(...ys), Math.max(...ys), 220),
    });
  unknown.forEach((g: any, i: number) =>
    coords.set(g.node_id, {
      x: 70 + (i % 6) * 125,
      y: 360 + Math.floor(i / 6) * 70,
    }),
  );
  const height = unknown.length
    ? 420 + Math.ceil(unknown.length / 6) * 70
    : 350;
  return (
    <svg
      viewBox={"0 0 850 " + height}
      role="img"
      aria-label="地点与行程图"
      className="depth-chart"
    >
      {routes
        .filter((r) => coords.has(r.from) && coords.has(r.to))
        .map((r) => {
          const a = coords.get(r.from)!,
            b = coords.get(r.to)!;
          return (
            <line
              key={r.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="currentColor"
            />
          );
        })}
      {space.geometries.map((g: any) => {
        const c = coords.get(g.node_id)!;
        return (
          <g key={g.id}>
            <circle cx={c.x} cy={c.y} r={7} fill="currentColor" />
            <text x={c.x + 12} y={c.y + 5} fill="currentColor">
              {name(g.node_id)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
function Curve({ points, p }: { points: any[]; p: any }) {
  const values = points.map((o) => o.numeric_value),
    orders = points.map(
      (o) => p.events.find((e: any) => e.id === o.event_id).narrative_order,
    ),
    min = Math.min(...values),
    max = Math.max(...values);
  const coords = points.map((o, i) => ({
    x:
      60 +
      ((orders[i] - Math.min(...orders)) /
        Math.max(1, Math.max(...orders) - Math.min(...orders))) *
        650,
    y: 260 - ((o.numeric_value - min) / Math.max(1, max - min)) * 210,
  }));
  return (
    <svg
      viewBox="0 0 850 310"
      role="img"
      aria-label="有据属性变化曲线"
      className="depth-chart"
    >
      <polyline
        points={coords.map((c) => c.x + "," + c.y).join(" ")}
        fill="none"
        stroke="currentColor"
      />
      {coords.map((c, i) => (
        <g key={points[i].id}>
          <circle cx={c.x} cy={c.y} r={5} fill="currentColor" />
          <text x={c.x + 10} y={c.y - 10} fill="currentColor">
            {values[i]}
          </text>
          <text x={c.x} y={290} fill="currentColor">
            {orders[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
