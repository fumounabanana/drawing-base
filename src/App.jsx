import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabase.js";

const APP_NAME = "東海産業機械お客様管理";
const CLIENT_PASSWORD = "2035";

const DEFAULT_CLIENTS = ["ABC商事", "山田製作所", "東京物流", "大阪工業", "名古屋電機"];
// ② 工程追加
const STAGES = ["製作", "現場工事", "メンテナンス", "部品", "見積り"];
const FILE_CATEGORIES = ["図面", "見積書", "仕様書", "写真", "その他"];

// ⑤ 製作状況ラベル変更
const PROD_STATUS = {
  done: { label: "製作・工事完了", bg: "#dcfce7", text: "#166534", dot: "#22c55e" },
  none: { label: "未製作",         bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  na:   { label: "製作なし",       bg: "#f1f5f9", text: "#475569", dot: "#94a3b8" },
};
const stageColors = {
  "製作":       { bg: "#dcfce7", text: "#166534" },
  "現場工事":   { bg: "#fef3c7", text: "#92400e" },
  "メンテナンス": { bg: "#fce7f3", text: "#9d174d" },
  "部品":       { bg: "#dbeafe", text: "#1e40af" },
  "見積り":     { bg: "#f3e8ff", text: "#6b21a8" },
};
const categoryColors = {
  "図面":   { bg: "#e0e7ff", text: "#3730a3" },
  "見積書": { bg: "#fef3c7", text: "#92400e" },
  "仕様書": { bg: "#dcfce7", text: "#166534" },
  "写真":   { bg: "#fce7f3", text: "#9d174d" },
  "その他": { bg: "#f1f5f9", text: "#475569" },
};

// 年リスト生成（現在年±5年）
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

// --- utils ---
async function renderPdf(url, containerEl, onProgress) {
  const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs";
  const resp  = await fetch(url);
  const buf   = await resp.arrayBuffer();
  const pdf   = await pdfjs.getDocument({ data: buf }).promise;
  const total = pdf.numPages;
  containerEl.innerHTML = "";
  for (let i = 1; i <= total; i++) {
    if (onProgress) onProgress(i, total);
    const page  = await pdf.getPage(i);
    const vp    = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.cssText = "width:100%;display:block;margin-bottom:8px;border-radius:4px;background:#fff;";
    containerEl.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  }
}

function ProdBadge({ prodStatus, prodDate }) {
  const info = PROD_STATUS[prodStatus] || PROD_STATUS.none;
  return (
    <span style={{ display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:info.bg,color:info.text,whiteSpace:"nowrap" }}>
      <span style={{ width:6,height:6,borderRadius:"50%",background:info.dot,flexShrink:0 }}/>
      {info.label}{prodStatus==="done"&&prodDate?` (${prodDate})`:""}
    </span>
  );
}

function DrawingCard({ drawing, onClick }) {
  // ③ stagesは配列
  const stages = Array.isArray(drawing.stage) ? drawing.stage : (drawing.stage ? [drawing.stage] : []);
  const files = drawing.file_paths || [];
  return (
    <div onClick={onClick}
      style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:12,padding:16,cursor:"pointer",transition:"border-color 0.15s" }}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#3b82f6"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="#334155"}>
      <div style={{ background:"#0f172a",borderRadius:8,height:76,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12,border:"1px solid #1e293b",position:"relative" }}>
        <span style={{ fontSize:34 }}>📁</span>
        {files.length>0 && <span style={{ position:"absolute",top:5,right:5,fontSize:9,background:"#1d4ed8",color:"#fff",padding:"1px 5px",borderRadius:4,fontWeight:600 }}>{files.length}件</span>}
      </div>
      <div style={{ fontSize:13,fontWeight:600,color:"#f1f5f9",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{drawing.name}</div>
      <div style={{ fontSize:11,color:"#475569",marginBottom:5 }}>{drawing.number} · {drawing.revision}</div>
      <div style={{ fontSize:11,color:"#64748b",marginBottom:7 }}>🏢 {drawing.client}</div>
      <div style={{ marginBottom:7 }}><ProdBadge prodStatus={drawing.prod_status} prodDate={drawing.prod_date}/></div>
      {/* ⑦ 工事日程表示 */}
      {drawing.scheduled_date && (
        <div style={{ fontSize:10,color:"#64748b",marginBottom:6 }}>📅 予定：{drawing.scheduled_date}</div>
      )}
      <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
        {stages.map(s => {
          const sc = stageColors[s] || {};
          return <span key={s} style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:20,background:sc.bg,color:sc.text }}>{s}</span>;
        })}
      </div>
    </div>
  );
}

function PdfPreviewModal({ previewData, onClose }) {
  const containerRef = useRef(null);
  const [progress, setProgress] = useState({ cur:0, total:0 });
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!previewData || !containerRef.current) return;
    setProgress({ cur:0, total:0 }); setError(null);
    const isPdf = previewData.url.toLowerCase().includes(".pdf") || previewData.type==="PDF";
    if (!isPdf) return;
    renderPdf(previewData.url, containerRef.current, (cur,total) => setProgress({ cur, total }))
      .catch(() => setError("PDFの読み込みに失敗しました"));
  }, [previewData]);
  if (!previewData) return null;
  const isPdf = previewData.url.toLowerCase().endsWith(".pdf") || previewData.type==="PDF";
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:200,display:"flex",flexDirection:"column" }} onClick={onClose}>
      <div style={{ background:"#1e293b",borderBottom:"1px solid #334155",padding:"10px 16px",display:"flex",alignItems:"center",gap:12,flexShrink:0 }} onClick={e=>e.stopPropagation()}>
        <span style={{ fontSize:14,color:"#f1f5f9",fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{previewData.filename}</span>
        <a href={previewData.url} download={previewData.filename} target="_blank" rel="noreferrer"
          style={{ background:"#1d4ed8",color:"#fff",border:"none",borderRadius:7,padding:"7px 16px",fontSize:12,fontWeight:600,cursor:"pointer",textDecoration:"none",flexShrink:0 }}>
          ⬇ ダウンロード
        </a>
        <button onClick={onClose} style={{ background:"#334155",border:"none",borderRadius:8,color:"#94a3b8",width:34,height:34,cursor:"pointer",fontSize:18,flexShrink:0 }}>×</button>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:16,background:"#1e293b" }} onClick={e=>e.stopPropagation()}>
        {isPdf ? (
          <>
            {progress.total===0&&!error&&<div style={{ textAlign:"center",padding:"40px 0",color:"#64748b" }}><div style={{ fontSize:28,marginBottom:10 }}>⏳</div><div>読み込み中...</div></div>}
            {progress.total>0&&progress.cur<progress.total&&<div style={{ textAlign:"center",padding:"12px 0",color:"#64748b",fontSize:12 }}>描画中 {progress.cur}/{progress.total}</div>}
            {error&&<div style={{ textAlign:"center",padding:"40px 0",color:"#ef4444" }}>{error}</div>}
            <div ref={containerRef} style={{ maxWidth:800,margin:"0 auto" }}/>
          </>
        ) : (
          <div style={{ textAlign:"center",padding:"60px 20px",color:"#64748b" }}>
            <div style={{ fontSize:56,marginBottom:16 }}>📄</div>
            <div style={{ fontSize:16,color:"#94a3b8",marginBottom:24 }}>ダウンロードして開いてください</div>
            <a href={previewData.url} download={previewData.filename} target="_blank" rel="noreferrer"
              style={{ background:"#1d4ed8",color:"#fff",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:700,textDecoration:"none" }}>
              ⬇ ダウンロード
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function PasswordModal({ title, onConfirm, onCancel }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const handle = () => {
    if (pw === CLIENT_PASSWORD) { onConfirm(); }
    else { setError(true); setPw(""); }
  };
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:150,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }} onClick={onCancel}>
      <div style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:16,padding:28,width:"100%",maxWidth:340 }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontSize:24,textAlign:"center",marginBottom:10 }}>🔒</div>
        <div style={{ fontSize:15,fontWeight:700,color:"#f1f5f9",textAlign:"center",marginBottom:6 }}>{title}</div>
        <div style={{ fontSize:12,color:"#64748b",textAlign:"center",marginBottom:16 }}>パスワードを入力してください</div>
        <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setError(false);}} onKeyDown={e=>e.key==="Enter"&&handle()}
          placeholder="パスワード" autoFocus
          style={{ width:"100%",background:"#0f172a",border:`1px solid ${error?"#ef4444":"#334155"}`,borderRadius:8,padding:"10px 12px",color:"#e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:6 }}/>
        {error && <div style={{ fontSize:11,color:"#ef4444",marginBottom:10,textAlign:"center" }}>パスワードが違います</div>}
        {!error && <div style={{ marginBottom:10 }}/>}
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onCancel} style={{ flex:1,background:"#334155",color:"#e2e8f0",border:"none",borderRadius:8,padding:"11px 0",fontWeight:600,fontSize:13,cursor:"pointer" }}>キャンセル</button>
          <button onClick={handle} style={{ flex:1,background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",fontWeight:700,fontSize:13,cursor:"pointer" }}>確認</button>
        </div>
      </div>
    </div>
  );
}

// ③ 工程複数選択コンポーネント
function StageSelector({ value, onChange }) {
  const selected = Array.isArray(value) ? value : (value ? [value] : []);
  const toggle = (s) => {
    if (selected.includes(s)) onChange(selected.filter(x=>x!==s));
    else onChange([...selected, s]);
  };
  return (
    <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
      {STAGES.map(s => {
        const sc = stageColors[s] || {};
        const active = selected.includes(s);
        return (
          <button key={s} onClick={()=>toggle(s)}
            style={{ padding:"6px 12px",borderRadius:20,border:`2px solid ${active?(sc.text||"#334155"):"#334155"}`,background:active?(sc.bg||"transparent"):"transparent",color:active?(sc.text||"#e2e8f0"):"#64748b",fontSize:12,fontWeight:active?700:400,cursor:"pointer" }}>
            {s}
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const [drawings, setDrawings]           = useState([]);
  const [clients, setClients]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [saveStatus, setSaveStatus]       = useState("");
  const [search, setSearch]               = useState("");
  const [filterClient, setFilterClient]   = useState("全て");
  const [filterStage, setFilterStage]     = useState("");
  const [filterProd, setFilterProd]       = useState("");
  // ⑦ 工事年フィルター
  const [filterYear, setFilterYear]       = useState("");
  const [sortBy, setSortBy]               = useState("date");
  const [view, setView]                   = useState("grid");
  const [selected, setSelected]           = useState(null);
  const [editMode, setEditMode]           = useState(false);
  const [editForm, setEditForm]           = useState(null);
  const [previewData, setPreviewData]     = useState(null);
  const [showUpload, setShowUpload]       = useState(false);
  const [showClientMgr, setShowClientMgr] = useState(false);
  const [showSidebar, setShowSidebar]     = useState(false);
  // ④ 客先最小化
  const [clientCollapsed, setClientCollapsed] = useState(false);
  // ① 工事日程最小化
  const [yearCollapsed, setYearCollapsed] = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [pwModal, setPwModal]             = useState(null);
  const [clientEdit, setClientEdit]       = useState({});
  const [newClientName, setNewClientName] = useState("");
  // ⑧ ドラッグ並び替え
  const [dragIndex, setDragIndex]         = useState(null);
  const [dragOver, setDragOver]           = useState(null);
  const [dragging, setDragging]           = useState(false);
  const [uploadFiles, setUploadFiles]     = useState([]);
  const [uploading, setUploading]         = useState(false);
  const [pendingCategory, setPendingCategory] = useState("図面");
  // ① 見積番号, ③ 複数工程, ⑥ 予定日
  const [uploadForm, setUploadForm]       = useState({ name:"", number:"", client:"", stages:["製作"], tags:"", prod_status:"none", prod_date:"", scheduled_date:"" });
  const fileRef = useRef();

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: dData }, { data: cData }] = await Promise.all([
        supabase.from("drawings").select("*").order("created_at", { ascending: false }),
        supabase.from("clients").select("*").order("order_index", { ascending: true }),
      ]);
      setDrawings(dData || []);
      const cNames = (cData || []).map(c => c.name);
      if (cNames.length > 0) setClients(cNames);
      else {
        for (const name of DEFAULT_CLIENTS) await supabase.from("clients").insert({ name });
        setClients(DEFAULT_CLIENTS);
      }
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const showSave = (status) => {
    setSaveStatus(status);
    if (status !== "saving") setTimeout(() => setSaveStatus(""), 2000);
  };

  const updateProd = async (id, prod_status, prod_date) => {
    showSave("saving");
    const { error } = await supabase.from("drawings").update({ prod_status, prod_date }).eq("id", id);
    if (!error) {
      setDrawings(ds => ds.map(d => d.id===id ? {...d, prod_status, prod_date} : d));
      setSelected(s => s?.id===id ? {...s, prod_status, prod_date} : s);
      showSave("saved");
    } else showSave("error");
  };

  const getFileUrl = (filePath) => supabase.storage.from("drawings").getPublicUrl(filePath).data.publicUrl;

  const handlePreview = (filePath, filename) => {
    const url = getFileUrl(filePath);
    setPreviewData({ url, filename, type: filename.split(".").pop().toUpperCase() });
  };
  const handleDownload = (filePath, filename) => {
    const url = getFileUrl(filePath);
    const a = document.createElement("a"); a.href=url; a.download=filename; a.target="_blank";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const addUploadFile = (file) => setUploadFiles(prev => [...prev, { file, category: pendingCategory }]);
  const removeUploadFile = (idx) => setUploadFiles(prev => prev.filter((_,i)=>i!==idx));
  const updateFileCategory = (idx, category) => setUploadFiles(prev => prev.map((f,i)=>i===idx?{...f,category}:f));

  const handleUpload = async () => {
    if (!uploadForm.name) return;
    setUploading(true); showSave("saving");
    const uploadedFiles = [];
    for (const { file, category } of uploadFiles) {
      try {
        const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
        const { error } = await supabase.storage.from("drawings").upload(safeName, file, { contentType: file.type });
        if (!error) uploadedFiles.push({ path: safeName, name: file.name, size: `${(file.size/1024/1024).toFixed(1)}MB`, category, ext: file.name.split(".").pop().toUpperCase() });
      } catch {}
    }
    const { error } = await supabase.from("drawings").insert({
      name: uploadForm.name,
      number: uploadForm.number || "",
      client: uploadForm.client || clients[0],
      // ③ stageをJSON配列として保存
      stage: uploadForm.stages,
      date: new Date().toISOString().split("T")[0],
      uploader: "ユーザー",
      type: uploadedFiles[0]?.ext==="PDF" ? "PDF" : "CAD",
      size: uploadedFiles[0]?.size || "—",
      revision: "Rev.1",
      tags: uploadForm.tags.split(",").map(t=>t.trim()).filter(Boolean),
      prod_status: uploadForm.prod_status,
      prod_date: uploadForm.prod_date,
      // ⑥ 予定日
      scheduled_date: uploadForm.scheduled_date || null,
      has_file: uploadedFiles.length > 0,
      file_path: uploadedFiles[0]?.path || null,
      file_paths: uploadedFiles,
    });
    if (!error) { await loadAll(); showSave("saved"); }
    else showSave("error");
    setShowUpload(false); setUploadFiles([]); setUploading(false);
    setUploadForm({ name:"", number:"", client:clients[0]||"", stages:["製作"], tags:"", prod_status:"none", prod_date:"", scheduled_date:"" });
  };

  const startEdit = (d) => {
    const stages = Array.isArray(d.stage) ? d.stage : (d.stage ? [d.stage] : []);
    setEditForm({ ...d, stages, tagsStr: (d.tags||[]).join(", ") });
    setEditMode(true);
  };
  const saveEdit = async () => {
    const { tagsStr, stages, ...rest } = editForm;
    const updated = { ...rest, stage: stages, tags: tagsStr.split(",").map(t=>t.trim()).filter(Boolean) };
    showSave("saving");
    const { error } = await supabase.from("drawings").update(updated).eq("id", updated.id);
    if (!error) { setDrawings(ds=>ds.map(d=>d.id===updated.id?updated:d)); setSelected(updated); setEditMode(false); showSave("saved"); }
    else showSave("error");
  };

  const confirmDelete  = (drawing) => setDeleteTarget(drawing);
  const executeDelete  = async () => {
    if (!deleteTarget) return;
    const files = deleteTarget.file_paths || [];
    for (const f of files) { try { await supabase.storage.from("drawings").remove([f.path]); } catch {} }
    const { error } = await supabase.from("drawings").delete().eq("id", deleteTarget.id);
    if (!error) { setDrawings(ds=>ds.filter(d=>d.id!==deleteTarget.id)); setSelected(null); setEditMode(false); setDeleteTarget(null); showSave("saved"); }
  };

  const requestClientAction = (action, data) => setPwModal({ action, data });
  const handlePwConfirm = () => {
    if (!pwModal) return;
    const { action, data } = pwModal;
    setPwModal(null);
    if (action==="add") doAddClient(data);
    else if (action==="delete") doDeleteClient(data);
    else if (action==="save") doSaveClientEdits();
    else if (action==="reorder") doReorderClients(data);
  };

  const doAddClient = async (name) => {
    if (name && !clients.includes(name)) {
      await supabase.from("clients").insert({ name, order_index: clients.length });
      setClients(prev => [...prev, name]);
    }
    setNewClientName("");
  };
  const doDeleteClient = async (idx) => {
    const name = clients[idx];
    await supabase.from("clients").delete().eq("name", name);
    setClients(prev => prev.filter((_,i)=>i!==idx));
  };
  const doSaveClientEdits = async () => {
    const { data: existing } = await supabase.from("clients").select("*");
    const existingNames = (existing||[]).map(c=>c.name);
    let nc = [...clients];
    Object.entries(clientEdit).forEach(([idx,name])=>{ if(name.trim()) nc[parseInt(idx)]=name.trim(); });
    for (const name of nc) if (!existingNames.includes(name)) await supabase.from("clients").insert({ name });
    for (const name of existingNames) if (!nc.includes(name)) await supabase.from("clients").delete().eq("name",name);
    // order_index更新
    for (let i=0; i<nc.length; i++) await supabase.from("clients").update({ order_index: i }).eq("name", nc[i]);
    setClients(nc); setClientEdit({}); setShowClientMgr(false); showSave("saved");
  };

  // ⑧ ドラッグ並び替え
  const doReorderClients = async (newOrder) => {
    setClients(newOrder);
    for (let i=0; i<newOrder.length; i++) {
      await supabase.from("clients").update({ order_index: i }).eq("name", newOrder[i]);
    }
    showSave("saved");
  };

  const handleDragStart = (e, idx) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const handleDragOver  = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(idx);
  };
  const handleDrop2 = (e, idx) => {
    e.preventDefault();
    const from = dragIndex !== null ? dragIndex : parseInt(e.dataTransfer.getData("text/plain"));
    if (isNaN(from) || from === idx) { setDragIndex(null); setDragOver(null); return; }
    const nc = [...clients];
    const [removed] = nc.splice(from, 1);
    nc.splice(idx, 0, removed);
    requestClientAction("reorder", nc);
    setDragIndex(null); setDragOver(null);
  };

  // フィルタリング
  const filtered = drawings.filter(d => {
    const q = search.toLowerCase();
    if (q && !d.name?.toLowerCase().includes(q) && !d.number?.toLowerCase().includes(q) && !(d.tags||[]).some(t=>t.includes(q))) return false;
    if (filterClient!=="全て" && d.client!==filterClient) return false;
    if (filterStage) {
      const stages = Array.isArray(d.stage) ? d.stage : (d.stage ? [d.stage] : []);
      if (!stages.includes(filterStage)) return false;
    }
    if (filterProd && d.prod_status!==filterProd) return false;
    // ⑦ 年フィルター
    if (filterYear && d.scheduled_date) {
      if (!d.scheduled_date.startsWith(filterYear)) return false;
    } else if (filterYear && !d.scheduled_date) return false;
    return true;
  }).sort((a,b) => {
    if (sortBy==="date")   return new Date(b.created_at)-new Date(a.created_at);
    if (sortBy==="name")   return (a.name||"").localeCompare(b.name||"","ja");
    if (sortBy==="number") return (a.number||"").localeCompare(b.number||"");
    return 0;
  });

  const handleFileDrop = useCallback(e => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) { files.forEach(addUploadFile); setShowUpload(true); }
  }, [pendingCategory]);

  const inp = { background:"#0f172a",border:"1px solid #334155",borderRadius:8,padding:"9px 12px",color:"#e2e8f0",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" };
  const allClients = ["全て",...clients];

  // ④ 最小化付きサイドバー
  const SidebarContent = () => (
    <>
      {/* ④ 客先（最小化対応） */}
      <div
        onClick={()=>setClientCollapsed(v=>!v)}
        style={{ padding:"0 16px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",userSelect:"none" }}>
        <span style={{ fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:"0.08em" }}>客先</span>
        <div style={{ display:"flex",alignItems:"center",gap:6 }}>
          <button onClick={e=>{e.stopPropagation();setShowSidebar(false);setShowClientMgr(true);}}
            style={{ background:"none",border:"1px solid #1d4ed8",color:"#3b82f6",fontSize:10,cursor:"pointer",padding:"1px 6px",borderRadius:4 }}>管理</button>
          <span style={{ color:"#475569",fontSize:12,lineHeight:1 }}>{clientCollapsed?"▶":"▼"}</span>
        </div>
      </div>
      {!clientCollapsed && allClients.map(c=>(
        <button key={c} onClick={()=>{setFilterClient(c);setShowSidebar(false);}}
          style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 20px",background:filterClient===c?"#1d4ed8":"transparent",color:filterClient===c?"#fff":"#94a3b8",border:"none",cursor:"pointer",fontSize:13,fontWeight:filterClient===c?600:400,borderLeft:filterClient===c?"3px solid #60a5fa":"3px solid transparent" }}>
          {c}<span style={{ float:"right",fontSize:11 }}>{c==="全て"?drawings.length:drawings.filter(d=>d.client===c).length}</span>
        </button>
      ))}

      {/* 工程 */}
      <div style={{ padding:"20px 16px 8px",fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:"0.08em" }}>工程</div>
      {["",...STAGES].map(s=>(
        <button key={s} onClick={()=>{setFilterStage(s);setShowSidebar(false);}}
          style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 20px",background:filterStage===s?"#1d4ed8":"transparent",color:filterStage===s?"#fff":"#94a3b8",border:"none",cursor:"pointer",fontSize:13,borderLeft:filterStage===s?"3px solid #60a5fa":"3px solid transparent" }}>
          {s||"全て"}
        </button>
      ))}

      {/* ⑦ 工事日程（年別・折りたたみ対応） */}
      <div
        onClick={()=>setYearCollapsed(v=>!v)}
        style={{ padding:"20px 16px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",userSelect:"none" }}>
        <span style={{ fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:"0.08em" }}>工事日程（年別）</span>
        <span style={{ color:"#475569",fontSize:12,lineHeight:1 }}>{yearCollapsed?"▶":"▼"}</span>
      </div>
      {!yearCollapsed && ["", ...YEARS.map(String)].map(y=>(
        <button key={y} onClick={()=>{setFilterYear(y);setShowSidebar(false);}}
          style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 20px",background:filterYear===y?"#1d4ed8":"transparent",color:filterYear===y?"#fff":"#94a3b8",border:"none",cursor:"pointer",fontSize:13,borderLeft:filterYear===y?"3px solid #60a5fa":"3px solid transparent" }}>
          {y||"全て"}{y && <span style={{ float:"right",fontSize:11 }}>{drawings.filter(d=>d.scheduled_date?.startsWith(y)).length}</span>}
        </button>
      ))}

      {/* 製作状況 */}
      <div style={{ padding:"20px 16px 8px",fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:"0.08em" }}>製作状況</div>
      {[["","全て"],["done","製作・工事完了"],["none","未製作"],["na","製作なし"]].map(([val,label])=>(
        <button key={val} onClick={()=>{setFilterProd(val);setShowSidebar(false);}}
          style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 20px",background:filterProd===val?"#1d4ed8":"transparent",color:filterProd===val?"#fff":"#94a3b8",border:"none",cursor:"pointer",fontSize:13,borderLeft:filterProd===val?"3px solid #60a5fa":"3px solid transparent" }}>
          {val&&<span style={{ display:"inline-block",width:7,height:7,borderRadius:"50%",background:PROD_STATUS[val]?.dot,marginRight:7,verticalAlign:"middle" }}/>}{label}
        </button>
      ))}
    </>
  );

  if (loading) return (
    <div style={{ minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b",fontFamily:"'Noto Sans JP',sans-serif" }}>
      <div style={{ textAlign:"center" }}><div style={{ fontSize:36,marginBottom:12 }}>📐</div><div>読み込み中...</div></div>
    </div>
  );

  const DetailSheet = () => {
    if (!selected) return null;
    const d = editMode ? editForm : selected;
    const files = (d.file_paths) || [];
    const stages = Array.isArray(d.stage) ? d.stage : (d.stage ? [d.stage] : []);
    return (
      <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:50,display:"flex",alignItems:"flex-end",justifyContent:"center" }}
        onClick={()=>{setSelected(null);setEditMode(false);}}>
        <div style={{ background:"#1e293b",borderRadius:"16px 16px 0 0",padding:"20px 18px 32px",width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.5)" }}
          onClick={e=>e.stopPropagation()}>
          <div style={{ width:36,height:4,background:"#334155",borderRadius:2,margin:"0 auto 16px" }}/>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
            <div style={{ fontSize:11,color:"#64748b" }}>{selected.number} / {selected.revision}</div>
            <div style={{ display:"flex",gap:8 }}>
              {!editMode && <button onClick={()=>startEdit(selected)} style={{ background:"#334155",border:"none",borderRadius:8,color:"#94a3b8",padding:"6px 12px",cursor:"pointer",fontSize:12 }}>✏️ 編集</button>}
              <button onClick={()=>{setSelected(null);setEditMode(false);}} style={{ background:"#334155",border:"none",borderRadius:8,color:"#94a3b8",width:32,height:32,cursor:"pointer",fontSize:18 }}>×</button>
            </div>
          </div>

          {editMode ? (
            <>
              {[
                {label:"案件名 *",key:"name"},
                {label:"見積番号",key:"number"}, // ①
                {label:"改訂",key:"revision"},
                {label:"担当者",key:"uploader"},
                {label:"タグ（カンマ区切り）",key:"tagsStr",placeholder:"搬送, ベルト"},
              ].map(({label,key,placeholder})=>(
                <div key={key} style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>{label}</div>
                  <input value={editForm[key]||""} onChange={e=>setEditForm(f=>({...f,[key]:e.target.value}))} placeholder={placeholder||""} style={inp}/>
                </div>
              ))}
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>客先</div>
                  <select value={editForm.client||""} onChange={e=>setEditForm(f=>({...f,client:e.target.value}))} style={inp}>
                    {clients.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>更新日</div>
                  <input type="date" value={editForm.date||""} onChange={e=>setEditForm(f=>({...f,date:e.target.value}))} style={inp}/>
                </div>
              </div>
              {/* ③ 複数工程 */}
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:6 }}>工程（複数選択可）</div>
                <StageSelector value={editForm.stages||[]} onChange={v=>setEditForm(f=>({...f,stages:v}))}/>
              </div>
              {/* ⑥ 予定日 */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>工事・製作予定日</div>
                <input type="date" value={editForm.scheduled_date||""} onChange={e=>setEditForm(f=>({...f,scheduled_date:e.target.value}))} style={inp}/>
              </div>
              {/* ⑤ 製作状況 */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:6 }}>製作状況</div>
                <div style={{ display:"flex",gap:8,marginBottom:8 }}>
                  {Object.entries(PROD_STATUS).map(([key,info])=>(
                    <button key={key} onClick={()=>setEditForm(f=>({...f,prod_status:key,prod_date:key==="done"?(f.prod_date||new Date().toISOString().split("T")[0]):""}))}
                      style={{ flex:1,padding:"8px 0",borderRadius:8,border:`2px solid ${editForm.prod_status===key?info.dot:"#334155"}`,background:editForm.prod_status===key?info.bg:"transparent",color:editForm.prod_status===key?info.text:"#64748b",fontSize:11,cursor:"pointer" }}>
                      {info.label}
                    </button>
                  ))}
                </div>
                {editForm.prod_status==="done" && (<>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>完了日</div>
                  <input type="date" value={editForm.prod_date||""} onChange={e=>setEditForm(f=>({...f,prod_date:e.target.value}))} style={inp}/>
                </>)}
              </div>
              <div style={{ display:"flex",gap:10,marginBottom:10 }}>
                <button onClick={saveEdit} style={{ flex:1,background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,padding:"12px 0",fontWeight:700,fontSize:13,cursor:"pointer" }}>保存</button>
                <button onClick={()=>setEditMode(false)} style={{ flex:1,background:"#334155",color:"#94a3b8",border:"none",borderRadius:8,padding:"12px 0",fontWeight:600,fontSize:13,cursor:"pointer" }}>キャンセル</button>
              </div>
              <button onClick={()=>confirmDelete(selected)} style={{ width:"100%",background:"transparent",color:"#ef4444",border:"1px solid #7f1d1d",borderRadius:8,padding:"11px 0",fontWeight:600,fontSize:13,cursor:"pointer" }}>🗑 この案件を削除</button>
            </>
          ) : (
            <>
              <div style={{ fontSize:18,fontWeight:700,color:"#f1f5f9",marginBottom:3 }}>{d.name}</div>
              <div style={{ fontSize:12,color:"#64748b",marginBottom:10 }}>🏢 {d.client}</div>
              {/* 工程バッジ */}
              {stages.length>0 && (
                <div style={{ display:"flex",gap:5,flexWrap:"wrap",marginBottom:12 }}>
                  {stages.map(s=>{
                    const sc=stageColors[s]||{};
                    return <span key={s} style={{ fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:sc.bg,color:sc.text }}>{s}</span>;
                  })}
                </div>
              )}
              {/* ⑦ 工事予定日 */}
              {d.scheduled_date && (
                <div style={{ background:"#0f172a",borderRadius:8,padding:"8px 12px",marginBottom:12,border:"1px solid #1e3a5f",display:"flex",alignItems:"center",gap:8 }}>
                  <span style={{ fontSize:14 }}>📅</span>
                  <div>
                    <div style={{ fontSize:10,color:"#475569" }}>工事・製作予定日</div>
                    <div style={{ fontSize:13,color:"#60a5fa",fontWeight:600 }}>{d.scheduled_date}</div>
                  </div>
                </div>
              )}
              {/* ファイル一覧 */}
              <div style={{ background:"#0f172a",borderRadius:10,border:"1px solid #1e3a5f",marginBottom:14,overflow:"hidden" }}>
                <div style={{ padding:"10px 14px",fontSize:11,fontWeight:600,color:"#64748b",borderBottom:"1px solid #1e293b" }}>
                  添付ファイル（{files.length}件）
                </div>
                {files.length===0 ? (
                  <div style={{ padding:"14px",fontSize:12,color:"#475569",textAlign:"center" }}>ファイルなし</div>
                ) : files.map((f,i)=>{
                  const cc=categoryColors[f.category]||categoryColors["その他"];
                  return (
                    <div key={i} style={{ display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderBottom:i<files.length-1?"1px solid #1e293b":"none" }}>
                      <span style={{ fontSize:18,flexShrink:0 }}>📄</span>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:12,color:"#e2e8f0",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{f.name}</div>
                        <div style={{ display:"flex",gap:5,marginTop:2 }}>
                          <span style={{ fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:10,background:cc.bg,color:cc.text }}>{f.category}</span>
                          <span style={{ fontSize:10,color:"#475569" }}>{f.size}</span>
                        </div>
                      </div>
                      <div style={{ display:"flex",gap:5,flexShrink:0 }}>
                        <button onClick={()=>handlePreview(f.path,f.name)} style={{ background:"#334155",color:"#e2e8f0",border:"none",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer" }}>👁</button>
                        <button onClick={()=>handleDownload(f.path,f.name)} style={{ background:"#1d4ed820",color:"#60a5fa",border:"none",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer" }}>⬇</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* 製作状況 */}
              <div style={{ background:"#0f172a",borderRadius:10,padding:14,marginBottom:14,border:"1px solid #1e3a5f" }}>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:10,fontWeight:600 }}>製作状況</div>
                <div style={{ display:"flex",gap:6,marginBottom:10,flexWrap:"wrap" }}>
                  {Object.entries(PROD_STATUS).map(([key,info])=>(
                    <button key={key} onClick={()=>updateProd(d.id,key,key==="done"?(d.prod_date||new Date().toISOString().split("T")[0]):"")}
                      style={{ flex:1,padding:"9px 4px",borderRadius:8,border:`2px solid ${d.prod_status===key?info.dot:"#334155"}`,background:d.prod_status===key?info.bg:"transparent",color:d.prod_status===key?info.text:"#64748b",fontWeight:d.prod_status===key?700:400,fontSize:10,cursor:"pointer",minWidth:80 }}>
                      <div style={{ fontSize:12,marginBottom:2 }}>{key==="done"?"✅":key==="none"?"⏳":"—"}</div>{info.label}
                    </button>
                  ))}
                </div>
                {d.prod_status==="done" && (<>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:4 }}>完了日</div>
                  <input type="date" value={d.prod_date||""} onChange={e=>updateProd(d.id,"done",e.target.value)} style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 12px",color:"#e2e8f0",fontSize:13,width:"100%",boxSizing:"border-box" }}/>
                </>)}
                {/* ⑥ 未製作の場合は予定日表示 */}
                {d.prod_status==="none" && (
                  <div style={{ fontSize:12,color:"#ef4444",padding:"6px 10px",background:"rgba(239,68,68,0.08)",borderRadius:8 }}>
                    未製作{d.scheduled_date?` — 予定日：${d.scheduled_date}`:" — 完了後に更新してください"}
                  </div>
                )}
                {d.prod_status==="na" && <div style={{ fontSize:12,color:"#94a3b8",padding:"6px 10px",background:"rgba(148,163,184,0.08)",borderRadius:8 }}>製作対象外です</div>}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12 }}>
                {[["更新日",d.date],["担当者",d.uploader]].map(([label,value])=>(
                  <div key={label} style={{ background:"#0f172a",borderRadius:8,padding:"10px 12px" }}>
                    <div style={{ fontSize:10,color:"#475569",marginBottom:2 }}>{label}</div>
                    <div style={{ fontSize:12,color:"#cbd5e1",fontWeight:500 }}>{value||"—"}</div>
                  </div>
                ))}
              </div>
              {(d.tags||[]).length>0 && (
                <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                  {d.tags.map(t=><span key={t} style={{ background:"#0f172a",border:"1px solid #334155",borderRadius:20,padding:"3px 10px",fontSize:11,color:"#64748b" }}>#{t}</span>)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight:"100vh",background:"#0f172a",color:"#e2e8f0",fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}>

      {pwModal && <PasswordModal title={pwModal.action==="add"?"客先を追加":pwModal.action==="delete"?"客先を削除":pwModal.action==="reorder"?"並び順を保存":"変更を保存"} onConfirm={handlePwConfirm} onCancel={()=>setPwModal(null)}/> (
        <div style={{ position:"fixed",inset:0,zIndex:80,display:"flex" }} onClick={()=>setShowSidebar(false)}>
          <div style={{ width:250,background:"#1e293b",height:"100%",overflowY:"auto",padding:"16px 0",borderRight:"1px solid #334155" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 16px 12px" }}>
              <span style={{ fontWeight:700,fontSize:14,color:"#f1f5f9" }}>絞り込み</span>
              <button onClick={()=>setShowSidebar(false)} style={{ background:"#334155",border:"none",borderRadius:8,color:"#94a3b8",width:30,height:30,cursor:"pointer",fontSize:16 }}>×</button>
            </div>
            <SidebarContent/>
          </div>
          <div style={{ flex:1,background:"rgba(0,0,0,0.5)" }}/>
        </div>
      )}

      <header style={{ background:"#1e293b",borderBottom:"1px solid #334155",padding:"0 14px",display:"flex",alignItems:"center",gap:10,height:54,position:"sticky",top:0,zIndex:40 }}>
        <button onClick={()=>setShowSidebar(true)} style={{ background:"none",border:"none",color:"#94a3b8",cursor:"pointer",padding:4,flexShrink:0,display:"flex",flexDirection:"column",gap:4 }}>
          <span style={{ display:"block",width:20,height:2,background:"#94a3b8",borderRadius:1 }}/>
          <span style={{ display:"block",width:20,height:2,background:"#94a3b8",borderRadius:1 }}/>
          <span style={{ display:"block",width:20,height:2,background:"#94a3b8",borderRadius:1 }}/>
        </button>
        <div style={{ display:"flex",alignItems:"center",gap:8,minWidth:0 }}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none" style={{ flexShrink:0 }}>
            <rect x="3" y="2" width="16" height="21" rx="2" fill="#3b82f6" opacity="0.2" stroke="#3b82f6" strokeWidth="1.5"/>
            <rect x="9" y="6" width="16" height="21" rx="2" fill="#1e293b" stroke="#60a5fa" strokeWidth="1.5"/>
            <line x1="13" y1="11" x2="21" y2="11" stroke="#93c5fd" strokeWidth="1.2"/>
            <line x1="13" y1="15" x2="21" y2="15" stroke="#93c5fd" strokeWidth="1.2"/>
            <line x1="13" y1="19" x2="18" y2="19" stroke="#93c5fd" strokeWidth="1.2"/>
          </svg>
          <span style={{ fontWeight:700,fontSize:13,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{APP_NAME}</span>
        </div>
        <div style={{ flex:1 }}/>
        {saveStatus && (
          <span style={{ fontSize:11,color:saveStatus==="error"?"#ef4444":saveStatus==="saving"?"#64748b":"#22c55e",padding:"3px 8px",background:"#0f172a",borderRadius:6,border:"1px solid #334155",flexShrink:0 }}>
            {saveStatus==="saving"?"保存中...":saveStatus==="saved"?"✓ 保存":"エラー"}
          </span>
        )}
        <span style={{ fontSize:11,color:"#475569",whiteSpace:"nowrap",flexShrink:0 }}>{filtered.length}/{drawings.length}</span>
        <button onClick={()=>setShowUpload(true)} style={{ background:"#3b82f6",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontWeight:600,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0 }}>+ 追加</button>
      </header>

      <div style={{ display:"flex",height:"calc(100vh - 54px)" }}>
        <aside style={{ width:208,background:"#1e293b",borderRight:"1px solid #334155",padding:"14px 0",flexShrink:0,overflowY:"auto",display:"none" }} className="desktop-sidebar">
          <SidebarContent/>
        </aside>
        <main style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
          <div style={{ background:"#1e293b",borderBottom:"1px solid #334155",padding:"10px 12px",display:"flex",alignItems:"center",gap:8 }}>
            <div style={{ flex:1,position:"relative" }}>
              <span style={{ position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#475569",fontSize:14 }}>🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="案件名・番号・タグで検索..." style={{ ...inp,padding:"8px 10px 8px 30px" }}/>
            </div>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ background:"#0f172a",border:"1px solid #334155",color:"#94a3b8",borderRadius:8,padding:"8px",fontSize:12,cursor:"pointer",flexShrink:0 }}>
              <option value="date">日付順</option><option value="name">名前順</option><option value="number">番号順</option>
            </select>
            <div style={{ display:"flex",border:"1px solid #334155",borderRadius:8,overflow:"hidden",flexShrink:0 }}>
              {["grid","list"].map(v=><button key={v} onClick={()=>setView(v)} style={{ padding:"7px 10px",background:view===v?"#334155":"transparent",border:"none",color:view===v?"#e2e8f0":"#64748b",cursor:"pointer",fontSize:14 }}>{v==="grid"?"⊞":"≡"}</button>)}
            </div>
          </div>
          <div style={{ flex:1,overflowY:"auto",padding:12 }}>
            {filtered.length===0 ? (
              <div style={{ textAlign:"center",padding:"60px 20px",color:"#475569" }}><div style={{ fontSize:36,marginBottom:10 }}>📁</div><div>「+ 追加」から登録してください</div></div>
            ) : view==="grid" ? (
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10 }}>
                {filtered.map(d=><DrawingCard key={d.id} drawing={d} onClick={()=>{setSelected(d);setEditMode(false);}}/>)}
              </div>
            ) : (
              <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                {filtered.map(d=>{
                  const stages=Array.isArray(d.stage)?d.stage:(d.stage?[d.stage]:[]);
                  return (
                    <div key={d.id} onClick={()=>{setSelected(d);setEditMode(false);}}
                      style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:10,padding:"12px 14px",cursor:"pointer" }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor="#3b82f6"}
                      onMouseLeave={e=>e.currentTarget.style.borderColor="#334155"}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5 }}>
                        <div>
                          <span style={{ fontSize:13,fontWeight:600,color:"#f1f5f9" }}>{d.name}</span>
                          {(d.file_paths||[]).length>0 && <span style={{ marginLeft:6,fontSize:9,background:"#1d4ed8",color:"#fff",padding:"1px 5px",borderRadius:4,fontWeight:600,verticalAlign:"middle" }}>{d.file_paths.length}件</span>}
                          <div style={{ fontSize:11,color:"#475569",marginTop:1 }}>{d.number} · 🏢 {d.client}{d.scheduled_date?` · 📅 ${d.scheduled_date}`:""}</div>
                        </div>
                        <ProdBadge prodStatus={d.prod_status} prodDate={d.prod_date}/>
                      </div>
                      <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
                        {stages.map(s=>{const sc=stageColors[s]||{};return <span key={s} style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:20,background:sc.bg,color:sc.text }}>{s}</span>;})}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      <DetailSheet/>
      <PdfPreviewModal previewData={previewData} onClose={()=>setPreviewData(null)}/>
      {pwModal && <PasswordModal title={pwModal.action==="add"?"客先を追加":pwModal.action==="delete"?"客先を削除":pwModal.action==="reorder"?"並び順を保存":"変更を保存"} onConfirm={handlePwConfirm} onCancel={()=>setPwModal(null)}/>}

      {showSidebar &&

      {/* 削除確認 */}
      {deleteTarget && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }} onClick={()=>setDeleteTarget(null)}>
          <div style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:16,padding:28,width:"100%",maxWidth:380 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:32,textAlign:"center",marginBottom:12 }}>🗑</div>
            <div style={{ fontSize:15,fontWeight:700,color:"#f1f5f9",textAlign:"center",marginBottom:10 }}>案件を削除しますか？</div>
            <div style={{ background:"#0f172a",border:"1px solid #334155",borderRadius:10,padding:"12px 16px",marginBottom:14,textAlign:"center" }}>
              <div style={{ fontSize:13,color:"#60a5fa",fontWeight:600 }}>「{deleteTarget.name}」</div>
            </div>
            <div style={{ fontSize:12,color:"#94a3b8",textAlign:"center",marginBottom:20 }}>を削除してもよいですか？<br/>添付ファイルも含めて削除されます。</div>
            <div style={{ display:"flex",gap:12 }}>
              <button onClick={()=>setDeleteTarget(null)} style={{ flex:1,background:"#334155",color:"#e2e8f0",border:"none",borderRadius:10,padding:"13px 0",fontWeight:700,fontSize:14,cursor:"pointer" }}>いいえ</button>
              <button onClick={executeDelete} style={{ flex:1,background:"#991b1b",color:"#fff",border:"none",borderRadius:10,padding:"13px 0",fontWeight:700,fontSize:14,cursor:"pointer" }}>はい、削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* ⑧ 客先管理（ドラッグ並び替え付き） */}
      {showClientMgr && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }} onClick={()=>setShowClientMgr(false)}>
          <div style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:16,padding:24,width:"100%",maxWidth:420,maxHeight:"80vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
              <div style={{ fontSize:16,fontWeight:700,color:"#f1f5f9" }}>客先の管理 🔒</div>
              <button onClick={()=>setShowClientMgr(false)} style={{ background:"#334155",border:"none",borderRadius:8,color:"#94a3b8",width:30,height:30,cursor:"pointer",fontSize:16 }}>×</button>
            </div>
            <div style={{ fontSize:11,color:"#475569",marginBottom:14 }}>⠿ をドラッグして並び順を変更できます</div>
            <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:16 }}>
              {clients.map((c,i)=>(
                <div key={i}
                  draggable={true}
                  onDragStart={e=>handleDragStart(e,i)}
                  onDragOver={e=>handleDragOver(e,i)}
                  onDrop={e=>handleDrop2(e,i)}
                  onDragEnd={()=>{setDragIndex(null);setDragOver(null);}}
                  style={{ display:"flex",gap:8,alignItems:"center",background:dragOver===i?"#1e3a5f":dragIndex===i?"#0f2a1a":"transparent",borderRadius:8,padding:"2px 0",transition:"background 0.15s",opacity:dragIndex===i?0.5:1 }}>
                  <span style={{ color:"#475569",fontSize:18,cursor:"grab",padding:"0 4px",flexShrink:0 }}>⠿</span>
                  <input value={clientEdit[i]!==undefined?clientEdit[i]:c} onChange={e=>setClientEdit(prev=>({...prev,[i]:e.target.value}))} style={{ ...inp,flex:1,padding:"8px 10px" }}/>
                  <button onClick={()=>requestClientAction("delete",i)} style={{ background:"#7f1d1d",border:"none",borderRadius:8,color:"#fca5a5",width:34,height:34,cursor:"pointer",fontSize:15,flexShrink:0 }}>🗑</button>
                </div>
              ))}
            </div>
            <div style={{ borderTop:"1px solid #334155",paddingTop:14,marginBottom:14 }}>
              <div style={{ fontSize:11,color:"#64748b",marginBottom:6 }}>客先を追加</div>
              <div style={{ display:"flex",gap:8 }}>
                <input value={newClientName} onChange={e=>setNewClientName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&requestClientAction("add",newClientName)}
                  placeholder="例：株式会社〇〇" style={{ ...inp,flex:1,padding:"8px 10px" }}/>
                <button onClick={()=>requestClientAction("add",newClientName)} style={{ background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer",flexShrink:0 }}>追加</button>
              </div>
            </div>
            <button onClick={()=>requestClientAction("save",null)} style={{ width:"100%",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,padding:"12px 0",fontWeight:700,fontSize:13,cursor:"pointer" }}>変更を保存</button>
          </div>
        </div>
      )}

      {/* アップロード */}
      {showUpload && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:50,display:"flex",alignItems:"flex-end",justifyContent:"center" }} onClick={()=>setShowUpload(false)}>
          <div style={{ background:"#1e293b",borderRadius:"16px 16px 0 0",padding:"20px 18px 32px",width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ width:36,height:4,background:"#334155",borderRadius:2,margin:"0 auto 16px" }}/>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:14 }}>
              <div style={{ fontSize:16,fontWeight:700,color:"#f1f5f9" }}>案件を登録</div>
              <button onClick={()=>setShowUpload(false)} style={{ background:"#334155",border:"none",borderRadius:8,color:"#94a3b8",width:32,height:32,cursor:"pointer",fontSize:18 }}>×</button>
            </div>

            {/* ファイルエリア */}
            <div style={{ background:"#0f172a",borderRadius:10,border:"1px solid #334155",marginBottom:14,overflow:"hidden" }}>
              <div style={{ padding:"10px 14px",fontSize:11,fontWeight:600,color:"#64748b",borderBottom:"1px solid #1e293b",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span>添付ファイル（複数可）</span>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <select value={pendingCategory} onChange={e=>setPendingCategory(e.target.value)}
                    style={{ background:"#1e293b",border:"1px solid #334155",color:"#e2e8f0",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer" }}>
                    {FILE_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                  <button onClick={()=>fileRef.current.click()}
                    style={{ background:"#1d4ed8",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer" }}>+ 追加</button>
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.dwg,.dxf,.xlsx,.xls,.docx,.png,.jpg,.jpeg" multiple style={{ display:"none" }}
                onChange={e=>{ Array.from(e.target.files).forEach(addUploadFile); e.target.value=""; }}/>
              {uploadFiles.length===0 ? (
                <div
                  onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="#3b82f6";}}
                  onDragLeave={e=>{e.currentTarget.style.borderColor="#334155";}}
                  onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor="#334155";Array.from(e.dataTransfer.files).forEach(addUploadFile);}}
                  style={{ padding:"20px 0",textAlign:"center",color:"#475569",fontSize:12,border:"2px dashed #334155",borderRadius:8,margin:8,cursor:"pointer" }}>
                  📁 ここにファイルをドロップ、または上の「追加」ボタンを使用
                </div>
              ) : uploadFiles.map((uf,i)=>{
                const cc=categoryColors[uf.category]||categoryColors["その他"];
                return (
                  <div key={i} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderTop:"1px solid #1e293b" }}>
                    <span style={{ fontSize:18,flexShrink:0 }}>📄</span>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:12,color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{uf.file.name}</div>
                    </div>
                    <select value={uf.category} onChange={e=>updateFileCategory(i,e.target.value)}
                      style={{ background:"#0f172a",border:"1px solid #334155",color:"#e2e8f0",borderRadius:6,padding:"3px 6px",fontSize:10,cursor:"pointer",flexShrink:0 }}>
                      {FILE_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                    </select>
                    <span style={{ fontSize:10,padding:"1px 6px",borderRadius:10,background:cc.bg,color:cc.text,flexShrink:0 }}>{uf.category}</span>
                    <button onClick={()=>removeUploadFile(i)} style={{ background:"#7f1d1d",border:"none",borderRadius:6,color:"#fca5a5",width:24,height:24,cursor:"pointer",fontSize:12,flexShrink:0 }}>×</button>
                  </div>
                );
              })}
            </div>

            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>案件名 *</div>
              <input value={uploadForm.name} onChange={e=>setUploadForm({...uploadForm,name:e.target.value})} placeholder="例：〇〇社 搬送設備" style={inp}/>
            </div>
            {/* ① 見積番号 */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>見積番号</div>
              <input value={uploadForm.number} onChange={e=>setUploadForm({...uploadForm,number:e.target.value})} placeholder="例：EST-2026-001" style={inp}/>
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>タグ（カンマ区切り）</div>
              <input value={uploadForm.tags} onChange={e=>setUploadForm({...uploadForm,tags:e.target.value})} placeholder="例：搬送, ベルト" style={inp}/>
            </div>

            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10 }}>
              <div>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>客先</div>
                <select value={uploadForm.client||clients[0]||""} onChange={e=>setUploadForm({...uploadForm,client:e.target.value})} style={inp}>
                  {clients.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              {/* ⑥ 予定日 */}
              <div>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>工事・製作予定日</div>
                <input type="date" value={uploadForm.scheduled_date} onChange={e=>setUploadForm({...uploadForm,scheduled_date:e.target.value})} style={inp}/>
              </div>
            </div>

            {/* ③ 複数工程選択 */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,color:"#64748b",marginBottom:6 }}>工程（複数選択可）</div>
              <StageSelector value={uploadForm.stages} onChange={v=>setUploadForm({...uploadForm,stages:v})}/>
            </div>

            {/* ⑤ 製作状況 */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,color:"#64748b",marginBottom:6 }}>製作状況</div>
              <div style={{ display:"flex",gap:6,marginBottom:8,flexWrap:"wrap" }}>
                {Object.entries(PROD_STATUS).map(([key,info])=>(
                  <button key={key} onClick={()=>setUploadForm({...uploadForm,prod_status:key,prod_date:key==="done"?(uploadForm.prod_date||new Date().toISOString().split("T")[0]):""})}
                    style={{ flex:1,padding:"8px 4px",borderRadius:8,border:`2px solid ${uploadForm.prod_status===key?info.dot:"#334155"}`,background:uploadForm.prod_status===key?info.bg:"transparent",color:uploadForm.prod_status===key?info.text:"#64748b",fontSize:10,cursor:"pointer",minWidth:80 }}>
                    {info.label}
                  </button>
                ))}
              </div>
              {uploadForm.prod_status==="done" && (<>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>完了日</div>
                <input type="date" value={uploadForm.prod_date} onChange={e=>setUploadForm({...uploadForm,prod_date:e.target.value})} style={inp}/>
              </>)}
            </div>

            <button onClick={handleUpload} disabled={!uploadForm.name||uploading}
              style={{ width:"100%",background:(!uploadForm.name||uploading)?"#1e3a5f":"#1d4ed8",color:(!uploadForm.name||uploading)?"#475569":"#fff",border:"none",borderRadius:10,padding:"13px 0",fontWeight:700,fontSize:14,cursor:(!uploadForm.name||uploading)?"not-allowed":"pointer" }}>
              {uploading?"保存中...":"登録する"}
            </button>
          </div>
        </div>
      )}
      <style>{`@media (min-width: 768px) { .desktop-sidebar { display: block !important; } }`}</style>
    </div>
  );
}
