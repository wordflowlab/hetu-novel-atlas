import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import manifest from "../../contracts/plugin-manifest.json" with { type: "json" };
import type { ObjectResult, PluginBridge } from "../../vendor/hetu-sdk.ts";
import { KIND, newProject, projection } from "../domain/model.ts";
import "./style.css";
declare global {
  interface Window {
    hetu: PluginBridge;
  }
}
const api = window.hetu,
  title = manifest.display["zh-CN"];
const names: Record<string, string> = {
  continuity: "连贯逻辑",
  characters: "角色关系",
  promises: "情节承诺",
  pacing: "节奏场景",
  prose: "文风表达",
  canon: "设定资料",
  unchecked: "未检查",
  pass: "通过",
  finding: "发现问题",
  inconclusive: "无法判断",
  open: "待处理",
  dismissed: "已忽略",
  resolved: "已复核",
  proposed: "待确认",
  active: "已启用",
  disabled: "已停用",
  extracted: "抽取候选",
  planned: "规划方向",
  canonical_projection: "正式设定投影",
  character: "人物",
  group: "势力",
  location: "地点",
  item: "器物",
  concept: "概念",
  suggestion: "建议",
  minor: "一般",
  major: "重要",
  critical: "关键",
};
const tabsets: Record<string, [string, string][]> = {
  novel_atlas: [
    ["overview", "总览"],
    ["characters", "人物"],
    ["relations", "关系"],
    ["locations", "地点"],
    ["timeline", "时间线"],
    ["growth", "成长"],
    ["items", "器物"],
  ],
};
async function invoke(action: string, input: any = {}) {
  const r: any = await api.invoke(action, input);
  if (r.status !== "succeeded")
    throw Object.assign(
      new Error(r.error?.message ?? "结果未知，请回读原操作。"),
      { code: r.error?.code ?? "unknown" },
    );
  return r.data;
}
function App() {
  const [list, setList] = useState<any[]>([]),
    [record, setRecord] = useState<ObjectResult>(),
    [tab, setTab] = useState(tabsets[KIND][0][0]),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<any>(),
    [order,setOrder]=useState("narrative"),
    [source, setSource] = useState<any>(),
    [editor, setEditor] = useState(""),
    [editing, setEditing] = useState(false),
    [pending, setPending] = useState<any>();
  const p: any = record?.object.content;
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    let cursor: string | undefined;
    const rows: any[] = [];
    do {
      const r = await invoke("list_projects", {
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      rows.push(...r.objects);
      cursor = r.next_cursor ?? undefined;
    } while (cursor);
    setList(rows);
    return rows;
  }
  async function open(id: string, revision?: number) {
    const r = await invoke("get_project", {
      object_id: id,
      ...(revision ? { revision } : {}),
    });
    setRecord(r);
    setSelected(undefined);
    setSource(undefined);
  }
  useEffect(() => {
    void run(async () => {
      const pref: any = await api.host?.("preferences", {});
      if (pref?.theme)
        document.documentElement.style.colorScheme =
          pref.theme === "system" ? "light dark" : pref.theme;
      api.onPreferences?.((v) => {
        document.documentElement.style.colorScheme =
          v.theme === "system" ? "light dark" : v.theme;
      });
      const buffer: any = await api.buffer();
      if (buffer?.pending) setPending(buffer.pending);
      if (typeof buffer?.editor === "string") {
        setEditor(buffer.editor);
        setEditing(true);
      }
      const rows = await refresh();
      if (buffer?.object_id || buffer?.pending?.object_id || rows.length)
        await open(
          buffer?.object_id ?? buffer?.pending?.object_id ?? rows[0].object_id,
          buffer?.baseline?.revision,
        );
    });
  }, []);
  useEffect(() => {
    if (editing || pending)
      void api.buffer({
        editor,
        editing,
        pending,
        object_id: record?.object.object_id,
        baseline: record
          ? { revision: record.object.revision, sha256: record.sha256 }
          : undefined,
      });
  }, [editor, editing, pending, record]);
  async function handoff() {
    await api.host?.("handoff", {
      goal:
        "根据当前固定作品和已有" +
        title +
        "成果，" +
        (query || "完善本页并准备下一轮创作；先读依据，再提出具体方案。"),
      ...(record
        ? {
            object_ref: {
              object_id: record.object.object_id,
              revision: record.object.revision,
              sha256: record.sha256,
            },
          }
        : {}),
    });
    setStatus("已复制接续说明，可粘贴到当前Agent对话");
  }
  function evidence(v: any) {
    return (
      <>
        {(v.evidence ?? []).map((e: any, k: number) => (
          <button
            key={k}
            className="text"
            onClick={() =>
              void run(async () => {
                setSource(
                  await invoke("get_source", {
                    object_id: record!.object.object_id,
                    revision: record!.object.revision,
                    source_index: e.source_index,
                  }),
                );
                setSelected(v);
              })
            }
          >
            查看依据 {e.source_index + 1}
            {e.quote ? "，" + e.quote.slice(0, 24) : ""}
          </button>
        ))}
      </>
    );
  }
  function article(v: any) {
    return (
      <article key={v.id}>
        <div className="row">
          <h3>{v.name ?? v.title ?? v.text ?? v.id}</h3>
          <span className="tag">
            {names[v.status ?? v.disposition ?? v.kind] ??
              v.status ??
              v.disposition ??
              v.kind}
          </span>
        </div>
        {v.summary && <p>{v.summary}</p>}
        {v.description && <p>{v.description}</p>}
        {v.goal && <p>{v.goal}</p>}
        {v.strategy && <p>{v.strategy}</p>}
        {v.scope && (
          <p className="muted">
            适用：{v.scope.kind === "work" ? "当前作品" : v.scope.target} ·{" "}
            {v.origin === "agent_inference" ? "Agent归纳" : "作者陈述"}
          </p>
        )}
        {v.resolution && <p>处理说明：{v.resolution}</p>}
        {v.story_time !== undefined && (
          <p className="muted">
            故事时间：{v.story_time ?? "未知"}，叙事顺序：{v.narrative_order}
          </p>
        )}
        {v.participants?.length > 0 && (
          <p>
            参与者：
            {v.participants
              .map(
                (id: string) =>
                  p.nodes?.find((n: any) => n.id === id)?.name ?? id,
              )
              .join("、")}
          </p>
        )}
        {v.candidates && (
          <div className="compare">
            {v.candidates.map((c: any) => (
              <section key={c.id}>
                <h4>{c.strategy}</h4>
                <p>{c.tradeoffs.join("；")}</p>
                <button
                  onClick={() =>
                    void run(async () =>
                      setSource(
                        await invoke("get_source", {
                          object_id: record!.object.object_id,
                          revision: record!.object.revision,
                          source_index: c.source_index,
                        }),
                      ),
                    )
                  }
                >
                  阅读候选
                </button>
              </section>
            ))}
          </div>
        )}
        {v.patches && (
          <p>
            已记录 {v.patches.length}{" "}
            处固定选区，选区外字节经核验。候选采纳另行决定。
          </p>
        )}
        {v.attributes?.map((a: any) => (
          <p key={a.key}>
            <strong>{a.key}</strong> {a.value}
          </p>
        ))}
        {evidence(v)}
      </article>
    );
  }
  let content: React.ReactNode;
  if (p) {
    {
      const result: any = projection(p, tab);
      content =
        tab === "relations" ? (
          <>
            <h2>人物与关系</h2>
            <RelationshipGraph p={p} />
            <p className="muted">示意位置仅用于阅读，不能推断真实地理。</p>
            {p.relations.map((r: any) => (
              <article key={r.id}>
                <h3>
                  {p.nodes.find((n: any) => n.id === r.from)?.name} →{" "}
                  {p.nodes.find((n: any) => n.id === r.to)?.name}
                </h3>
                <p>
                  {r.kind}，{r.summary}
                </p>
                {evidence(r)}
              </article>
            ))}
          </>
        ) : tab === "timeline" ? (
          <>
            <h2>事件时间线</h2>
            <label>排序 <select aria-label="时间线排序" value={order} onChange={e=>setOrder(e.target.value)}><option value="narrative">叙事顺序</option><option value="story">故事时间文本，未知置后</option></select></label>
            <div className="timeline">{[...result.events].sort((a:any,b:any)=>order==="narrative"?a.narrative_order-b.narrative_order:a.story_time===null?(b.story_time===null?0:1):b.story_time===null?-1:a.story_time.localeCompare(b.story_time)).map(article)}</div>
          </>
        ) : tab === "growth" ? (
          <>
            <h2>人物与器物的变化</h2>
            {p.nodes.filter((n: any) => n.attributes.length).map(article)}
            <h3>相关事件</h3>
            {p.events.map(article)}
          </>
        ) : tab === "overview" ? (
          <>
            <div className="stats">
              <section>
                <strong>{p.nodes.length}</strong>
                <span>实体</span>
              </section>
              <section>
                <strong>{p.relations.length}</strong>
                <span>关系</span>
              </section>
              <section>
                <strong>{p.events.length}</strong>
                <span>事件</span>
              </section>
            </div>
            <h2>作品图鉴</h2>
            {p.nodes.map(article)}
          </>
        ) : (
          <>
            <h2>{tabsets[KIND].find((x) => x[0] === tab)?.[1]}</h2>
            {tab === "locations" && (
              <p className="muted">
                地点示意：只有显式布局的地点才显示坐标，未知位置保持未知。
              </p>
            )}
            {result.nodes?.map(article)}
          </>
        );
    }
  }
  return (
    <div className="app">
      <header>
        <button
          aria-label="返回作品"
          onClick={() =>
            void run(async () => {
              await api.host?.("close_view", {});
            })
          }
        >
          ← 返回
        </button>
        <h1>{title}</h1>
        <select
          aria-label="选择方案"
          disabled={editing || !!pending}
          value={record?.object.object_id ?? ""}
          onChange={(e) => void run(() => open(e.target.value))}
        >
          <option value="">选择方案</option>
          {list.map((x) => (
            <option key={x.object_id} value={x.object_id}>
              {x.title}
            </option>
          ))}
        </select>
        <span className="revision">
          {record ? "修订 " + record.object.revision : ""}
        </span>
        <button
          disabled={busy || editing}
          onClick={() =>
            void run(async () => {
              await refresh();
              if (record) await open(record.object.object_id);
            })
          }
        >
          刷新
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void run(handoff)}
        >
          让AI处理
        </button>
      </header>
      <div className="toolbar">
        <nav aria-label="专业视图">
          {tabsets[KIND].map(([id, label]) => (
            <button
              aria-current={tab === id ? "page" : undefined}
              key={id}
              onClick={() => {
                setTab(id);
                setSource(undefined);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <input
          aria-label="创作目标"
          placeholder="说明创作目标内容"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && (
        <div role="alert" className="error">
          {error} <button onClick={() => setError("")}>收起</button>
        </div>
      )}
      {status && (
        <p role="status" className="status">
          {status}
        </p>
      )}
      {pending && (
        <div className="notice">
          上次保存结果待确认。
          <button
            onClick={() =>
              void run(async () => {
                let r: any;
                try {
                  r = await invoke("get_operation", {
                    operation_key: pending.operation_key,
                  });
                } catch (e) {
                  if ((e as any).code !== "not_found") throw e;
                  r = await invoke("save_project", pending);
                }
                setRecord(r);
                setPending(undefined);
                setEditing(false);
                await api.buffer(null);
                setStatus("原操作已回读");
              })
            }
          >
            回读原操作
          </button>
        </div>
      )}
      <main>
        {busy && <p role="status">正在读取…</p>}
        {!p ? (
          <Empty
            text={
              "尚无" +
              title +
              "方案。向Agent说明创作目标，由Agent读取作品并建立；你可以回来阅读和提出意见。"
            }
          />
        ) : (
          <>
            <div className="heading">
              <h2>{p.title}</h2>
              <span className="muted">
                固定来源 {(record?.object.source_refs ?? []).length} 份
              </span>
            </div>
            {content}
          </>
        )}
        {source && (
          <aside aria-label="固定依据">
            <div className="row">
              <h2>{selected?.title ?? "固定依据"}</h2>
              <button
                onClick={() => {
                  setSource(undefined);
                  setSelected(undefined);
                }}
              >
                关闭依据
              </button>
            </div>
            <pre>
              {typeof source.content === "string"
                ? source.content
                : JSON.stringify(source, null, 2)}
            </pre>
          </aside>
        )}
        <details className="advanced">
          <summary>版本与高级操作</summary>
          <div className="row">
            <button
              onClick={() => {
                setEditor(JSON.stringify(p ?? newProject(), null, 2));
                setEditing(true);
              }}
            >
              编辑专业数据
            </button>
            {record && (
              <>
                <button
                  onClick={() =>
                    void run(async () => {
                      const r = await invoke("compare_versions", {
                        object_id: record.object.object_id,
                        from_revision: 1,
                        to_revision: record.object.revision,
                      });
                      setSource({ content: JSON.stringify(r, null, 2) });
                    })
                  }
                >
                  比较最初修订
                </button>
                <button
                  onClick={() =>
                    void run(async () => {
                      const result: any = await api.host?.("export_file", {
                        action: "export_project",
                        input: {
                          object_id: record.object.object_id,
                          revision: record.object.revision,
                          format: KIND === "novel_atlas" ? "html" : "markdown",
                        },
                        suggested_name:
                          title + (KIND === "novel_atlas" ? ".html" : ".md"),
                      });
                      if (result?.cancelled) {
                        setStatus("已取消交付");
                        return;
                      }
                      setStatus("已准备固定版本交付");
                    })
                  }
                >
                  导出报告
                </button>
              </>
            )}
          </div>
          {editing && (
            <>
              <label>
                高级专业数据
                <textarea
                  aria-label="专业数据"
                  value={editor}
                  onChange={(e) => setEditor(e.target.value)}
                />
              </label>
              <p className="muted">
                仅维护本插件结构；正文与正式设定沿宿主决定。冲突时保留输入。
              </p>
              <button
                disabled={busy || !!pending}
                onClick={() =>
                  void run(async () => {
                    const input = {
                      ...(record ? { object_id: record.object.object_id } : {}),
                      expected_revision: record?.object.revision ?? 0,
                      expected_sha256: record?.sha256 ?? "",
                      source_refs: record?.object.source_refs ?? [],
                      content: JSON.parse(editor),
                      operation_key: crypto.randomUUID(),
                    };
                    setPending(input);
                    await api.buffer({
                      editor,
                      pending: input,
                      object_id: record?.object.object_id,
                      baseline: record
                        ? {
                            revision: record.object.revision,
                            sha256: record.sha256,
                          }
                        : undefined,
                    });
                    let r: any;
                    try {
                      r = await invoke("save_project", input);
                    } catch (e) {
                      const code = (e as any).code;
                      if (
                        code &&
                        code !== "unknown" &&
                        code !== "plugin.failure"
                      ) {
                        setPending(undefined);
                        await api.buffer({
                          editor,
                          editing: true,
                          object_id: record?.object.object_id,
                          baseline: record
                            ? {
                                revision: record.object.revision,
                                sha256: record.sha256,
                              }
                            : undefined,
                        });
                      }
                      throw e;
                    }
                    setRecord(r);
                    setPending(undefined);
                    setEditing(false);
                    await api.buffer(null);
                    await refresh();
                    setStatus("专业修订已保存");
                  })
                }
              >
                保存专业修订
              </button>
              <button
                disabled={!!pending}
                onClick={() => {
                  setEditing(false);
                  void api.buffer(null);
                }}
              >
                取消编辑
              </button>
            </>
          )}
        </details>
      </main>
      <footer>作者决定取舍，Agent维护结构，正文采纳与定稿独立处理</footer>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <section className="empty">
      <h2>从作品出发</h2>
      <p>{text}</p>
    </section>
  );
}
function RelationshipGraph({ p }: { p: any }) {
  const element=useRef<SVGSVGElement>(null);
  const [width,setWidth]=useState(700);
  useEffect(()=>{
    if(!element.current)return;
    const observer=new ResizeObserver(entries=>setWidth(Math.max(280,entries[0].contentRect.width)));
    observer.observe(element.current);
    return ()=>observer.disconnect();
  },[]);

  const positions = new Map<string, { x: number; y: number }>(
    p.nodes.map((n: any, i: number) => {
      const pos = p.layout.find((x: any) => x.node_id === n.id);
      return [
        n.id,
        pos
          ? { x: pos.x, y: pos.y }
          : {
              x:
                350 +
                Math.cos((i / Math.max(1, p.nodes.length)) * Math.PI * 2) * 230,
              y:
                220 +
                Math.sin((i / Math.max(1, p.nodes.length)) * Math.PI * 2) * 150,
            },
      ];
    }),
  );
  const points = [...positions.values()];
  const left = Math.min(0, ...points.map((p) => p.x)) - 60;
  const top = Math.min(0, ...points.map((p) => p.y)) - 60;
  const right = Math.max(700, ...points.map((p) => p.x)) + 60;
  const bottom = Math.max(440, ...points.map((p) => p.y)) + 60;
  const height=360;
  const scale=Math.min((width-96)/(right-left),(height-96)/(bottom-top));
  for (const point of positions.values()) {
    point.x=width/2+(point.x-(left+right)/2)*scale;
    point.y=height/2+(point.y-(top+bottom)/2)*scale;
  }
  return (
    <svg
      ref={element}
      className="graph"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="人物关系示意图"
    >
      <defs><marker id="relation-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="var(--sage-8)" /></marker></defs>
      {p.relations.map((r: any) => {
        const a: any = positions.get(r.from),
          b: any = positions.get(r.to);
        const length=Math.hypot(b.x-a.x,b.y-a.y)||1;
        const dx=(b.x-a.x)/length,dy=(b.y-a.y)/length;
        return (
          <g key={r.id}>
            <line x1={a.x+dx*32} y1={a.y+dy*32} x2={b.x-dx*34} y2={b.y-dy*34} markerEnd="url(#relation-arrow)" />
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6}>
              {r.kind}
            </text>
          </g>
        );
      })}
      {p.nodes.map((n: any) => {
        const pos: any = positions.get(n.id);
        return (
          <g key={n.id} transform={`translate(${pos.x},${pos.y})`}>
            <title>{n.name}</title><circle r="32" />
            <text textAnchor="middle" dy="5">
              {n.name.slice(0, 8)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
