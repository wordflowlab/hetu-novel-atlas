/** 离线图鉴只渲染受管专业投影；不执行脚本或取得未选择的正文。 */
const esc = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function offlineHtml(p: any, report: any) {
  const names = new Map(p.nodes.map((n: any) => [n.id, n.name]));
  const node = (n: any) =>
    `<article><h3>${esc(n.name)}</h3><p class="status">${esc(n.status === "canonical_projection" ? "正式设定投影" : n.status === "planned" ? "规划方向" : "抽取候选")}</p><p>${esc(n.summary)}</p><dl>${n.attributes.map((a: any) => `<dt>${esc(a.key)}</dt><dd>${esc(a.value)}</dd>`).join("")}</dl>${n.evidence.map((e: any) => `<blockquote>${esc(e.quote)}<small>固定来源 ${e.source_index + 1}</small></blockquote>`).join("")}</article>`;
  const positions = new Map(
    p.nodes.map((n: any, i: number) => [
      n.id,
      {
        x:
          350 + 230 * Math.cos((i / Math.max(p.nodes.length, 1)) * Math.PI * 2),
        y:
          220 + 155 * Math.sin((i / Math.max(p.nodes.length, 1)) * Math.PI * 2),
      },
    ]),
  );
  const graph = `<svg viewBox="0 0 700 440" role="img" aria-label="关系示意图">${p.relations
    .map((r: any) => {
      const a: any = positions.get(r.from),
        b: any = positions.get(r.to);
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 8}">${esc(r.kind)}</text>`;
    })
    .join("")}${p.nodes
    .map((n: any) => {
      const v: any = positions.get(n.id);
      return `<g transform="translate(${v.x},${v.y})"><circle r="30"/><text text-anchor="middle" dy="5">${esc([...n.name].slice(0, 8).join(""))}</text></g>`;
    })
    .join("")}</svg>`;
  const relations = p.relations
    .map(
      (r: any) =>
        `<tr><td>${esc(names.get(r.from))}</td><td>${esc(r.kind)}</td><td>${esc(names.get(r.to))}</td><td>${esc(r.summary)}</td></tr>`,
    )
    .join("");
  const events = [...p.events]
    .sort((a, b) => a.narrative_order - b.narrative_order)
    .map(
      (e: any) =>
        `<article><h3>${esc(e.title)}</h3><p>叙事顺序 ${e.narrative_order} · 故事时间 ${esc(e.story_time ?? "未知")}</p><p>${esc(e.summary)}</p><p>${e.participants.map((id: string) => esc(names.get(id))).join("、")}</p></article>`,
    )
    .join("");
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(p.title)}</title><style>html{scroll-behavior:auto}body{font:16px/1.75 system-ui;max-width:1100px;margin:32px auto;padding:16px;color:#1a211e;background:#fbfdfc}h1{font-size:28px}h2{font-size:22px;margin-top:40px}h3{font-size:18px}nav{display:flex;gap:20px;flex-wrap:wrap}a{color:#208368}article{border-bottom:1px solid #d7dad9;padding:16px 0}p{white-space:pre-wrap}.status,small{color:#5f6563}small{display:block}pre{white-space:pre-wrap;overflow-wrap:anywhere}svg{width:100%;max-height:500px;background:#eef1f0}line{stroke:#b8bcba}circle{fill:#d6f1e3;stroke:#8bceb6}text{font-size:12px;fill:#1a211e}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #d7dad9}dt{font-weight:600}dd{margin-left:0}</style><h1>${esc(p.title)}</h1><p>固定专业投影 · 布局不代表真实地理 · 未包含整章原文</p><nav><a href="#people">人物</a><a href="#relations">关系</a><a href="#locations">地点</a><a href="#timeline">时间线</a><a href="#items">器物</a><a href="#data">固定数据</a></nav><section id="people"><h2>人物与势力</h2>${
    p.nodes
      .filter((n: any) => ["character", "group"].includes(n.kind))
      .map(node)
      .join("") || "<p>本范围未整理。</p>"
  }</section><section id="relations"><h2>关系</h2>${graph}<table><thead><tr><th>起点</th><th>关系</th><th>终点</th><th>说明</th></tr></thead><tbody>${relations}</tbody></table></section><section id="locations"><h2>地点示意</h2><p>地点由固定来源整理；示意位置不能推断真实地理。</p>${
    p.nodes
      .filter((n: any) => n.kind === "location")
      .map(node)
      .join("") || "<p>位置未知。</p>"
  }</section><section id="timeline"><h2>事件时间线</h2>${events || "<p>本范围未整理。</p>"}</section><section id="items"><h2>器物与概念</h2>${
    p.nodes
      .filter((n: any) => ["item", "concept"].includes(n.kind))
      .map(node)
      .join("") || "<p>本范围未整理。</p>"
  }</section><details id="data"><summary>完整专业数据与固定来源</summary><pre>${esc(JSON.stringify(report, null, 2))}</pre></details></html>`;
}
