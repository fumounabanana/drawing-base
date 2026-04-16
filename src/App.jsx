import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabase.js";

const DEFAULT_CLIENTS = ["ABC商事", "山田製作所", "東京物流", "大阪工業", "名古屋電機"];
const STAGES = ["設計", "製造", "据付", "メンテナンス"];

const PROD_STATUS = {
  done: { label: "製作済み", bg: "#dcfce7", text: "#166534", dot: "#22c55e" },
  none: { label: "未製作",   bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
  na:   { label: "製作なし", bg: "#f1f5f9", text: "#475569", dot: "#94a3b8" },
};
const stageColors = {
  "設計":         { bg: "#dbeafe", text: "#1e40af" },
  "製造":         { bg: "#dcfce7", text: "#166534" },
  "据付":         { bg: "#fef3c7", text: "#92400e" },
  "メンテナンス": { bg: "#fce7f3", text: "#9d174d" },
};
const typeColors = {
  PDF: { bg: "#fee2e2", text: "#991b1b" },
  CAD: { bg: "#e0e7ff", text: "#3730a3" },
};

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
    canvas.width  = vp.width;
    canvas.height = vp.height;
    canvas.style.cssText = "width:100%;display:block;margin-bottom:8px;border-radius:4px;background:#fff;";
    containerEl.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  }
}

// --- ProdBadge ---
function ProdBadge({ prodStatus, prodDate }) {
  const info = PROD_STATUS[prodStatus] || PROD_STATUS.none;
  return (
    <span style={{ display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:info.bg,color:info.text,whiteSpace:"nowrap" }}>
      <span style={{ width:6,height:6,borderRadius:"50%",background:info.dot,flexShrink:0 }}/>
      {info.label}{prodStatus==="done"&&prodDate?` (${prodDate})`:""}
    </span>
  );
}

// --- DrawingCard ---
function DrawingCard({ drawing, onClick }) {
  const sc = stageColors[drawing.stage] || {};
  const tc = typeColors[drawing.type]   || {};
  return (
    <div onClick={onClick}
      style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:12,padding:16,cursor:"pointer",transition:"border-color 0.15s" }}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#3b82f6"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="#334155"}>
      <div style={{ background:"#0f172a",borderRadius:8,height:76,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12,border:"1px solid #1e293b",position:"relative" }}>
        <span style={{ fontSize:34 }}>{drawing.type==="PDF"?"📄":"📐"}</span>
        {drawing.has_file && <span style={{ position:"absolute",top:5,right:5,fontSize:9,background:"#1d4ed8",color:"#fff",padding:"1px 5px",borderRadius:4,fontWeight:600 }}>保存済</span>}
      </div>
      <div style={{ fontSize:13,fontWeight:600,color:"#f1f5f9",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{drawing.name}</div>
      <div style={{ fontSize:11,color:"#475569",marginBottom:5 }}>{drawing.number} · {drawing.revision}</div>
      <div style={{ fontSize:11,color:"#64748b",marginBottom:7 }}>🏢 {drawing.client}</div>
      <div style={{ marginBottom:7 }}><ProdBadge prodStatus={drawing.prod_status} prodDate={drawing.prod_date}/></div>
      <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
        <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:20,background:sc.bg,color:sc.text }}>{drawing.stage}</span>
        <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:20,background:tc.bg,color:tc.text }}>{drawing.type}</span>
      </div>
    </div>
  );
}

// --- PdfPreviewModal ---
function PdfPreviewModal({ previewData, onClose, onDownload }) {
  const containerRef = useRef(null);
  const [progress, setProgress] = useState({ cur: 0, total: 0 });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!previewData || !containerRef.current) return;
    if (previewData.type !== "PDF") return;
    setProgress({ cur: 0, total: 0 }); setError(null);
    renderPdf(previewData.url, containerRef.current, (cur, total) => setProgress({ cur, total }))
      .catch(() => setError("PDFの読み込みに失敗しました"));
  }, [previewData]);

  if (!previewData) return null;

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
        {previewData.type==="PDF" ? (
          <>
            {progress.total===0 && !error && <div style={{ textAlign:"center",padding:"40px 0",color:"#64748b" }}><div style={{ fontSize:28,marginBottom:10 }}>⏳</div><div>PDFを読み込み中...</div></div>}
            {progress.total>0 && progress.cur<progress.total && <div style={{ textAlign:"center",padding:"16px 0",color:"#64748b",fontSize:12 }}>ページを描画中 {progress.cur} / {progress.total}</div>}
            {error && <div style={{ textAlign:"center",padding:"40px 0",color:"#ef4444" }}><div style={{ fontSize:28,marginBottom:10 }}>⚠️</div><div>{error}</div></div>}
            <div ref={containerRef} style={{ maxWidth:800,margin:"0 auto" }}/>
          </>
        ) : (
          <div style={{ textAlign:"center",padding:"60px 20px",color:"#64748b" }}>
            <div style={{ fontSize:56,marginBottom:16 }}>📐</div>
            <div style={{ fontSize:16,color:"#94a3b8",marginBottom:8 }}>CADファイルはブラウザでプレビューできません</div>
            <div style={{ fontSize:13,marginBottom:24 }}>ダウンロードしてCADソフトで開いてください</div>
            <a href={previewData.url} download={previewData.filename} target="_blank" rel="noreferrer"
              style={{ background:"#1d4ed8",color:"#fff",borderRadius:10,padding:"12px 28px",fontSize:14,fontWeight:700,textDecoration:"none" }}>
              ⬇ ダウンロードして開く
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// --- App ---
export default function App() {
  const [drawings, setDrawings]           = useState([]);
  const [clients, setClients]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [saveStatus, setSaveStatus]       = useState("");
  const [search, setSearch]               = useState("");
  const [filterClient, setFilterClient]   = useState("全て");
  const [filterStage, setFilterStage]     = useState("");
  const [filterType, setFilterType]       = useState("");
  const [filterProd, setFilterProd]       = useState("");
  const [sortBy, setSortBy]               = useState("date");
  const [view, setView]                   = useState("grid");
  const [selected, setSelected]           = useState(null);
  const [editMode, setEditMode]           = useState(false);
  const [editForm, setEditForm]           = useState(null);
  const [previewData, setPreviewData]     = useState(null);
  const [showUpload, setShowUpload]       = useState(false);
  const [showClientMgr, setShowClientMgr] = useState(false);
  const [showSidebar, setShowSidebar]     = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [clientEdit, setClientEdit]       = useState({});
  const [newClientName, setNewClientName] = useState("");
  const [dragging, setDragging]           = useState(false);
  const [uploadFile, setUploadFile]       = useState(null);
  const [uploading, setUploading]         = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [uploadForm, setUploadForm]       = useState({ name:"", number:"", client:"", stage:"設計", tags:"", prod_status:"none", prod_date:"" });
  const fileRef = useRef();

  // --- データ読み込み ---
  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: dData }, { data: cData }] = await Promise.all([
        supabase.from("drawings").select("*").order("created_at", { ascending: false }),
        supabase.from("clients").select("*").order("created_at", { ascending: true }),
      ]);
      setDrawings(dData || []);
      const cNames = (cData || []).map(c => c.name);
      setClients(cNames.length > 0 ? cNames : DEFAULT_CLIENTS);
      if (cNames.length === 0) {
        for (const name of DEFAULT_CLIENTS) {
          await supabase.from("clients").insert({ name });
        }
        setClients(DEFAULT_CLIENTS);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const showSave = (status) => {
    setSaveStatus(status);
    if (status !== "saving") setTimeout(() => setSaveStatus(""), 2000);
  };

  // --- 製作状況更新 ---
  const updateProd = async (id, prod_status, prod_date) => {
    showSave("saving");
    const { error } = await supabase.from("drawings").update({ prod_status, prod_date }).eq("id", id);
    if (!error) {
      setDrawings(ds => ds.map(d => d.id===id ? {...d, prod_status, prod_date} : d));
      setSelected(s => s?.id===id ? {...s, prod_status, prod_date} : s);
      showSave("saved");
    } else { showSave("error"); }
  };

  // --- ファイルURL取得 ---
  const getFileUrl = (filePath) => {
    const { data } = supabase.storage.from("drawings").getPublicUrl(filePath);
    return data.publicUrl;
  };

  // --- プレビュー ---
  const handlePreview = (drawing) => {
    if (!drawing.has_file || !drawing.file_path) return;
    const url = getFileUrl(drawing.file_path);
    const filename = drawing.file_path.split("/").pop();
    setPreviewData({ url, filename, type: drawing.type });
  };

  // --- ダウンロード ---
  const handleDownload = (drawing) => {
    if (!drawing.has_file || !drawing.file_path) return;
    const url = getFileUrl(drawing.file_path);
    const filename = drawing.file_path.split("/").pop();
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.target = "_blank";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // --- アップロード ---
  const handleUpload = async () => {
    if (!uploadForm.name || !uploadFile) return;
    setUploading(true);
    showSave("saving");
    const ext  = uploadFile.name.split(".").pop().toUpperCase();
    const type = ext === "PDF" ? "PDF" : "CAD";
    let has_file = false;
    let file_path = null;

    try {
      const safeName = `${Date.now()}_${uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("drawings")
        .upload(safeName, uploadFile, { contentType: uploadFile.type });
      if (!uploadError) { has_file = true; file_path = safeName; }
    } catch {}

    const { error } = await supabase.from("drawings").insert({
      name: uploadForm.name,
      number: uploadForm.number || `NEW-${String(drawings.length+1).padStart(3,"0")}`,
      client: uploadForm.client || clients[0],
      stage: uploadForm.stage,
      date: new Date().toISOString().split("T")[0],
      uploader: "ユーザー",
      type,
      size: `${(uploadFile.size/1024/1024).toFixed(1)}MB`,
      revision: "Rev.1",
      tags: uploadForm.tags.split(",").map(t=>t.trim()).filter(Boolean),
      prod_status: uploadForm.prod_status,
      prod_date: uploadForm.prod_date,
      has_file,
      file_path,
    });

    if (!error) {
      await loadAll();
      showSave("saved");
    } else { showSave("error"); }

    setShowUpload(false); setUploadFile(null); setUploading(false);
    setUploadForm({ name:"", number:"", client:clients[0]||"", stage:"設計", tags:"", prod_status:"none", prod_date:"" });
  };

  // --- 図面編集 ---
  const startEdit = (d) => {
    setEditForm({ ...d, tagsStr: (d.tags||[]).join(", ") });
    setEditMode(true);
  };
  const saveEdit = async () => {
    const { tagsStr, ...rest } = editForm;
    const updated = { ...rest, tags: tagsStr.split(",").map(t=>t.trim()).filter(Boolean) };
    showSave("saving");
    const { error } = await supabase.from("drawings").update(updated).eq("id", updated.id);
    if (!error) {
      setDrawings(ds => ds.map(d => d.id===updated.id ? updated : d));
      setSelected(updated); setEditMode(false);
      showSave("saved");
    } else { showSave("error"); }
  };

  // --- 削除 ---
  const confirmDelete = (drawing) => setDeleteTarget(drawing);
  const executeDelete = async () => {
    if (!deleteTarget) return;
    showSave("saving");
    if (deleteTarget.file_path) {
      await supabase.storage.from("drawings").remove([deleteTarget.file_path]);
    }
    const { error } = await supabase.from("drawings").delete().eq("id", deleteTarget.id);
    if (!error) {
      setDrawings(ds => ds.filter(d => d.id !== deleteTarget.id));
      setSelected(null); setEditMode(false); setDeleteTarget(null);
      showSave("saved");
    } else { showSave("error"); }
  };

  // --- 客先管理 ---
  const saveClientEdits = async () => {
    showSave("saving");
    const { data: existing } = await supabase.from("clients").select("*");
    const existingNames = (existing||[]).map(c => c.name);
    let nc = [...clients];
    Object.entries(clientEdit).forEach(([idx, name]) => { if (name.trim()) nc[parseInt(idx)] = name.trim(); });
    for (const name of nc) {
      if (!existingNames.includes(name)) await supabase.from("clients").insert({ name });
    }
    for (const name of existingNames) {
      if (!nc.includes(name)) await supabase.from("clients").delete().eq("name", name);
    }
    setClients(nc); setClientEdit({}); setShowClientMgr(false);
    showSave("saved");
  };
  const deleteClient = (idx) => {
    setClients(prev => prev.filter((_,i) => i!==idx));
    setClientEdit(prev => { const n={...prev}; delete n[idx]; return n; });
  };
  const addClient = async () => {
    const name = newClientName.trim();
    if (name && !clients.includes(name)) {
      await supabase.from("clients").insert({ name });
      setClients(prev => [...prev, name]);
    }
    setNewClientName("");
  };

  const filtered = drawings.filter(d => {
    const q = search.toLowerCase();
    if (q && !d.name?.toLowerCase().includes(q) && !d.number?.toLowerCase().includes(q) && !(d.tags||[]).some(t=>t.includes(q))) return false;
    if (filterClient!=="全て" && d.client!==filterClient) return false;
    if (filterStage && d.stage!==filterStage) return false;
    if (filterType && d.type!==filterType) return false;
    if (filterProd && d.prod_status!==filterProd) return false;
    return true;
  }).sort((a,b) => {
    if (sortBy==="date")   return new Date(b.created_at)-new Date(a.created_at);
    if (sortBy==="name")   return (a.name||"").localeCompare(b.name||"","ja");
    if (sortBy==="number") return (a.number||"").localeCompare(b.number||"");
    return 0;
  });

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) { setUploadFile(file); setShowUpload(true); }
  }, []);

  const inp = { background:"#0f172a",border:"1px solid #334155",borderRadius:8,padding:"9px 12px",color:"#e2e8f0",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" };
  const allClients = ["全て",...clients];

  const SidebarContent = () => (
    <>
      <div style={{ padding:"0 16px 8px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <span style={{ fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:"0.08em" }}>客先</span>
        <button onClick={()=>{ setShowSidebar(false); setShowClientMgr(true); }}
          style={{ background:"none",border:"1px solid #1d4ed8",color:"#3b82f6",fontSize:11,cursor:"pointer",padding:"2px 8px",borderRadius:4 }}>管理</button>
      </div>
      {allClients.map(c=>(
        <button key={c} onClick={()=>{setFilterClient(c);setShowSidebar(false);}}
          style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 20px",background:filterClient===c?"#1d4ed8":"transparent",color:filterClient===c?"#fff":"#94a3b8",border:"none",cursor:"pointer",fontSize:13,fontWeight:filterClient===c?600:400,borderLeft:filterClient===c?"3px solid #60a5fa":"3px solid transparent" }}>
          {c}<span style={{ float:"right",fontSize:11 }}>{c==="全て"?drawings.length:drawings.filter(d=>d.client===c).length}</span>
        </button>
      ))}
      <div style={{ padding:"20px 16px 8px",fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:"0.08em" }}>工程</div>
      {["",...STAGES].map(s=>(
        <button key={s} onClick={()=>{setFilterStage(s);setShowSidebar(false);}}
          style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 20px",background:filterStage===s?"#1d4ed8":"transparent",color:filterStage===s?"#fff":"#94a3b8",border:"none",cursor:"pointer",fontSize:13,borderLeft:filterStage===s?"3px solid #60a5fa":"3px solid transparent" }}>
          {s||"全て"}
        </button>
      ))}
      <div style={{ padding:"20px 16px 8px",fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:"0.08em" }}>製作状況</div>
      {[["","全て"],["done","製作済み"],["none","未製作"],["na","製作なし"]].map(([val,label])=>(
        <button key={val} onClick={()=>{setFilterProd(val);setShowSidebar(false);}}
          style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 20px",background:filterProd===val?"#1d4ed8":"transparent",color:filterProd===val?"#fff":"#94a3b8",border:"none",cursor:"pointer",fontSize:13,borderLeft:filterProd===val?"3px solid #60a5fa":"3px solid transparent" }}>
          {val&&<span style={{ display:"inline-block",width:7,height:7,borderRadius:"50%",background:PROD_STATUS[val]?.dot,marginRight:7,verticalAlign:"middle" }}/>}{label}
        </button>
      ))}
      <div style={{ padding:"20px 16px 8px",fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:"0.08em" }}>形式</div>
      {["","PDF","CAD"].map(t=>(
        <button key={t} onClick={()=>{setFilterType(t);setShowSidebar(false);}}
          style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 20px",background:filterType===t?"#1d4ed8":"transparent",color:filterType===t?"#fff":"#94a3b8",border:"none",cursor:"pointer",fontSize:13,borderLeft:filterType===t?"3px solid #60a5fa":"3px solid transparent" }}>
          {t||"全て"}
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
              {[{label:"図面名 *",key:"name"},{label:"図番",key:"number"},{label:"改訂",key:"revision"},{label:"アップロード者",key:"uploader"},{label:"タグ（カンマ区切り）",key:"tagsStr",placeholder:"ベルト, 駆動部"}].map(({label,key,placeholder})=>(
                <div key={key} style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>{label}</div>
                  <input value={editForm[key]||""} onChange={e=>setEditForm(f=>({...f,[key]:e.target.value}))} placeholder={placeholder||""} style={inp}/>
                </div>
              ))}
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>客先</div>
                  <select value={editForm.client} onChange={e=>setEditForm(f=>({...f,client:e.target.value}))} style={inp}>
                    {clients.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>工程</div>
                  <select value={editForm.stage} onChange={e=>setEditForm(f=>({...f,stage:e.target.value}))} style={inp}>
                    {STAGES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>更新日</div>
                <input type="date" value={editForm.date||""} onChange={e=>setEditForm(f=>({...f,date:e.target.value}))} style={inp}/>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:6 }}>製作状況</div>
                <div style={{ display:"flex",gap:8,marginBottom:8 }}>
                  {Object.entries(PROD_STATUS).map(([key,info])=>(
                    <button key={key}
                      onClick={()=>setEditForm(f=>({...f,prod_status:key,prod_date:key==="done"?(f.prod_date||new Date().toISOString().split("T")[0]):""}))}
                      style={{ flex:1,padding:"9px 0",borderRadius:8,border:`2px solid ${editForm.prod_status===key?info.dot:"#334155"}`,background:editForm.prod_status===key?info.bg:"transparent",color:editForm.prod_status===key?info.text:"#64748b",fontSize:11,cursor:"pointer" }}>
                      {info.label}
                    </button>
                  ))}
                </div>
                {editForm.prod_status==="done" && (
                  <><div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>製作完了日</div>
                  <input type="date" value={editForm.prod_date||""} onChange={e=>setEditForm(f=>({...f,prod_date:e.target.value}))} style={inp}/></>
                )}
              </div>
              <div style={{ display:"flex",gap:10,marginBottom:10 }}>
                <button onClick={saveEdit} style={{ flex:1,background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,padding:"12px 0",fontWeight:700,fontSize:13,cursor:"pointer" }}>保存</button>
                <button onClick={()=>setEditMode(false)} style={{ flex:1,background:"#334155",color:"#94a3b8",border:"none",borderRadius:8,padding:"12px 0",fontWeight:600,fontSize:13,cursor:"pointer" }}>キャンセル</button>
              </div>
              <button onClick={()=>confirmDelete(selected)} style={{ width:"100%",background:"transparent",color:"#ef4444",border:"1px solid #7f1d1d",borderRadius:8,padding:"11px 0",fontWeight:600,fontSize:13,cursor:"pointer" }}>
                🗑 この図面を削除
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize:18,fontWeight:700,color:"#f1f5f9",marginBottom:3,lineHeight:1.3 }}>{d.name}</div>
              <div style={{ fontSize:12,color:"#64748b",marginBottom:14 }}>🏢 {d.client}</div>
              <div style={{ background:"#0f172a",borderRadius:10,border:"1px solid #1e3a5f",marginBottom:14,overflow:"hidden" }}>
                <div style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 16px" }}>
                  <span style={{ fontSize:30,flexShrink:0 }}>{d.type==="PDF"?"📄":"📐"}</span>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:12,color:"#cbd5e1",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{d.name}</div>
                    <div style={{ fontSize:11,color:"#475569",marginTop:2 }}>{d.type} / {d.size}</div>
                  </div>
                </div>
                <div style={{ display:"flex",borderTop:"1px solid #1e293b" }}>
                  <button onClick={()=>handlePreview(d)} style={{ flex:1,padding:"12px 0",background:"transparent",border:"none",borderRight:"1px solid #1e293b",color:d.has_file?"#e2e8f0":"#475569",fontSize:13,fontWeight:600,cursor:d.has_file?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
                    👁 プレビュー{!d.has_file&&<span style={{ fontSize:10,color:"#334155" }}>（なし）</span>}
                  </button>
                  <button onClick={()=>handleDownload(d)} style={{ flex:1,padding:"12px 0",background:d.has_file?"rgba(29,78,216,0.12)":"transparent",border:"none",color:d.has_file?"#60a5fa":"#475569",fontSize:13,fontWeight:600,cursor:d.has_file?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
                    ⬇ ダウンロード{!d.has_file&&<span style={{ fontSize:10,color:"#334155" }}>（なし）</span>}
                  </button>
                </div>
              </div>
              <div style={{ background:"#0f172a",borderRadius:10,padding:14,marginBottom:14,border:"1px solid #1e3a5f" }}>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:10,fontWeight:600 }}>製作状況</div>
                <div style={{ display:"flex",gap:8,marginBottom:10 }}>
                  {Object.entries(PROD_STATUS).map(([key,info])=>(
                    <button key={key} onClick={()=>updateProd(d.id, key, key==="done"?(d.prod_date||new Date().toISOString().split("T")[0]):"")}
                      style={{ flex:1,padding:"9px 0",borderRadius:8,border:`2px solid ${d.prod_status===key?info.dot:"#334155"}`,background:d.prod_status===key?info.bg:"transparent",color:d.prod_status===key?info.text:"#64748b",fontWeight:d.prod_status===key?700:400,fontSize:11,cursor:"pointer" }}>
                      <div style={{ fontSize:13,marginBottom:2 }}>{key==="done"?"✅":key==="none"?"⏳":"—"}</div>{info.label}
                    </button>
                  ))}
                </div>
                {d.prod_status==="done" && (<>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:4 }}>製作完了日</div>
                  <input type="date" value={d.prod_date||""} onChange={e=>updateProd(d.id,"done",e.target.value)} style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 12px",color:"#e2e8f0",fontSize:13,width:"100%",boxSizing:"border-box" }}/>
                </>)}
                {d.prod_status==="none" && <div style={{ fontSize:12,color:"#ef4444",padding:"6px 10px",background:"rgba(239,68,68,0.08)",borderRadius:8 }}>未製作 — 完了後に更新してください</div>}
                {d.prod_status==="na"   && <div style={{ fontSize:12,color:"#94a3b8",padding:"6px 10px",background:"rgba(148,163,184,0.08)",borderRadius:8 }}>製作対象外です</div>}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12 }}>
                {[["工程",d.stage],["更新日",d.date],["アップロード者",d.uploader]].map(([label,value])=>(
                  <div key={label} style={{ background:"#0f172a",borderRadius:8,padding:"10px 12px" }}>
                    <div style={{ fontSize:10,color:"#475569",marginBottom:2 }}>{label}</div>
                    <div style={{ fontSize:12,color:"#cbd5e1",fontWeight:500 }}>{value}</div>
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
    <div style={{ minHeight:"100vh",background:"#0f172a",color:"#e2e8f0",fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" }}
      onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={handleDrop}>

      {dragging && <div style={{ position:"fixed",inset:0,background:"rgba(59,130,246,0.15)",border:"3px dashed #3b82f6",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#93c5fd",fontWeight:700,backdropFilter:"blur(4px)" }}>ここにドロップ</div>}

      {showSidebar && (
        <div style={{ position:"fixed",inset:0,zIndex:80,display:"flex" }} onClick={()=>setShowSidebar(false)}>
          <div style={{ width:250,background:"#1e293b",height:"100%",overflowY:"auto",padding:"16px 0",borderRight:"1px solid #334155" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 16px 12px" }}>
              <span style={{ fontWeight:700,fontSize:15,color:"#f1f5f9" }}>絞り込み</span>
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
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <rect x="3" y="2" width="16" height="21" rx="2" fill="#3b82f6" opacity="0.2" stroke="#3b82f6" strokeWidth="1.5"/>
            <rect x="9" y="6" width="16" height="21" rx="2" fill="#1e293b" stroke="#60a5fa" strokeWidth="1.5"/>
            <line x1="13" y1="11" x2="21" y2="11" stroke="#93c5fd" strokeWidth="1.2"/>
            <line x1="13" y1="15" x2="21" y2="15" stroke="#93c5fd" strokeWidth="1.2"/>
            <line x1="13" y1="19" x2="18" y2="19" stroke="#93c5fd" strokeWidth="1.2"/>
          </svg>
          <span style={{ fontWeight:700,fontSize:15,color:"#f1f5f9" }}>DrawingBase</span>
        </div>
        <div style={{ flex:1 }}/>
        {saveStatus && (
          <span style={{ fontSize:11,color:saveStatus==="error"?"#ef4444":saveStatus==="saving"?"#64748b":"#22c55e",padding:"3px 8px",background:"#0f172a",borderRadius:6,border:"1px solid #334155" }}>
            {saveStatus==="saving"?"保存中...":saveStatus==="saved"?"✓ 保存":"エラー"}
          </span>
        )}
        <span style={{ fontSize:11,color:"#475569",whiteSpace:"nowrap" }}>{filtered.length}/{drawings.length}</span>
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
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="図面名・図番・タグで検索..." style={{ ...inp,padding:"8px 10px 8px 30px" }}/>
            </div>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ background:"#0f172a",border:"1px solid #334155",color:"#94a3b8",borderRadius:8,padding:"8px",fontSize:12,cursor:"pointer",flexShrink:0 }}>
              <option value="date">日付順</option><option value="name">名前順</option><option value="number">図番順</option>
            </select>
            <div style={{ display:"flex",border:"1px solid #334155",borderRadius:8,overflow:"hidden",flexShrink:0 }}>
              {["grid","list"].map(v=><button key={v} onClick={()=>setView(v)} style={{ padding:"7px 10px",background:view===v?"#334155":"transparent",border:"none",color:view===v?"#e2e8f0":"#64748b",cursor:"pointer",fontSize:14 }}>{v==="grid"?"⊞":"≡"}</button>)}
            </div>
          </div>
          <div style={{ flex:1,overflowY:"auto",padding:12 }}>
            {filtered.length===0 ? (
              <div style={{ textAlign:"center",padding:"60px 20px",color:"#475569" }}><div style={{ fontSize:36,marginBottom:10 }}>📁</div><div>図面がありません。「+ 追加」から登録してください</div></div>
            ) : view==="grid" ? (
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10 }}>
                {filtered.map(d=><DrawingCard key={d.id} drawing={d} onClick={()=>{setSelected(d);setEditMode(false);}}/>)}
              </div>
            ) : (
              <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                {filtered.map(d=>(
                  <div key={d.id} onClick={()=>{setSelected(d);setEditMode(false);}}
                    style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:10,padding:"12px 14px",cursor:"pointer" }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#3b82f6"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#334155"}>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5 }}>
                      <div>
                        <span style={{ fontSize:13,fontWeight:600,color:"#f1f5f9" }}>{d.name}</span>
                        {d.has_file&&<span style={{ marginLeft:6,fontSize:9,background:"#1d4ed8",color:"#fff",padding:"1px 5px",borderRadius:4,fontWeight:600,verticalAlign:"middle" }}>保存済</span>}
                        <div style={{ fontSize:11,color:"#475569",marginTop:1 }}>{d.number} · {d.revision} · 🏢 {d.client} · {d.date}</div>
                      </div>
                      <ProdBadge prodStatus={d.prod_status} prodDate={d.prod_date}/>
                    </div>
                    <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
                      <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:20,background:stageColors[d.stage]?.bg,color:stageColors[d.stage]?.text }}>{d.stage}</span>
                      <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:20,background:typeColors[d.type]?.bg,color:typeColors[d.type]?.text }}>{d.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <DetailSheet/>
      <PdfPreviewModal previewData={previewData} onClose={()=>setPreviewData(null)}/>

      {deleteTarget && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }} onClick={()=>setDeleteTarget(null)}>
          <div style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:16,padding:28,width:"100%",maxWidth:380 }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:32,textAlign:"center",marginBottom:12 }}>🗑</div>
            <div style={{ fontSize:15,fontWeight:700,color:"#f1f5f9",textAlign:"center",marginBottom:10 }}>図面を削除しますか？</div>
            <div style={{ background:"#0f172a",border:"1px solid #334155",borderRadius:10,padding:"12px 16px",marginBottom:14,textAlign:"center" }}>
              <div style={{ fontSize:13,color:"#60a5fa",fontWeight:600,marginBottom:2 }}>「{deleteTarget.name}」</div>
              <div style={{ fontSize:11,color:"#475569" }}>{deleteTarget.number} / {deleteTarget.revision}</div>
            </div>
            <div style={{ fontSize:12,color:"#94a3b8",textAlign:"center",marginBottom:20 }}>を削除してもよいですか？<br/>この操作は元に戻せません。</div>
            <div style={{ display:"flex",gap:12 }}>
              <button onClick={()=>setDeleteTarget(null)} style={{ flex:1,background:"#334155",color:"#e2e8f0",border:"none",borderRadius:10,padding:"13px 0",fontWeight:700,fontSize:14,cursor:"pointer" }}>いいえ</button>
              <button onClick={executeDelete} style={{ flex:1,background:"#991b1b",color:"#fff",border:"none",borderRadius:10,padding:"13px 0",fontWeight:700,fontSize:14,cursor:"pointer" }}>はい、削除する</button>
            </div>
          </div>
        </div>
      )}

      {showClientMgr && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }} onClick={()=>setShowClientMgr(false)}>
          <div style={{ background:"#1e293b",border:"1px solid #334155",borderRadius:16,padding:24,width:"100%",maxWidth:400,maxHeight:"80vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
              <div style={{ fontSize:16,fontWeight:700,color:"#f1f5f9" }}>客先の管理</div>
              <button onClick={()=>setShowClientMgr(false)} style={{ background:"#334155",border:"none",borderRadius:8,color:"#94a3b8",width:30,height:30,cursor:"pointer",fontSize:16 }}>×</button>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:16 }}>
              {clients.map((c,i)=>(
                <div key={i} style={{ display:"flex",gap:8,alignItems:"center" }}>
                  <input value={clientEdit[i]!==undefined?clientEdit[i]:c} onChange={e=>setClientEdit(prev=>({...prev,[i]:e.target.value}))} style={{ ...inp,flex:1,padding:"8px 10px" }}/>
                  <button onClick={()=>deleteClient(i)} style={{ background:"#7f1d1d",border:"none",borderRadius:8,color:"#fca5a5",width:34,height:34,cursor:"pointer",fontSize:15,flexShrink:0 }}>🗑</button>
                </div>
              ))}
            </div>
            <div style={{ borderTop:"1px solid #334155",paddingTop:14,marginBottom:14 }}>
              <div style={{ fontSize:11,color:"#64748b",marginBottom:6 }}>客先を追加</div>
              <div style={{ display:"flex",gap:8 }}>
                <input value={newClientName} onChange={e=>setNewClientName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addClient()} placeholder="例：株式会社〇〇" style={{ ...inp,flex:1,padding:"8px 10px" }}/>
                <button onClick={addClient} style={{ background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer",flexShrink:0 }}>追加</button>
              </div>
            </div>
            <button onClick={saveClientEdits} style={{ width:"100%",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,padding:"12px 0",fontWeight:700,fontSize:13,cursor:"pointer" }}>変更を保存</button>
          </div>
        </div>
      )}

      {showUpload && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:50,display:"flex",alignItems:"flex-end",justifyContent:"center" }} onClick={()=>setShowUpload(false)}>
          <div style={{ background:"#1e293b",borderRadius:"16px 16px 0 0",padding:"20px 18px 32px",width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ width:36,height:4,background:"#334155",borderRadius:2,margin:"0 auto 16px" }}/>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:14 }}>
              <div style={{ fontSize:16,fontWeight:700,color:"#f1f5f9" }}>図面をアップロード</div>
              <button onClick={()=>setShowUpload(false)} style={{ background:"#334155",border:"none",borderRadius:8,color:"#94a3b8",width:32,height:32,cursor:"pointer",fontSize:18 }}>×</button>
            </div>
            <div onClick={()=>fileRef.current.click()} style={{ border:"2px dashed #334155",borderRadius:12,padding:"20px 0",textAlign:"center",cursor:"pointer",marginBottom:12,background:uploadFile?"#0f2a1a":"#0f172a" }}>
              <div style={{ fontSize:28,marginBottom:6 }}>{uploadFile?"✅":"📁"}</div>
              <div style={{ color:"#94a3b8",fontSize:13 }}>{uploadFile?uploadFile.name:"タップしてファイルを選択"}</div>
              <div style={{ color:"#475569",fontSize:11,marginTop:2 }}>PDF, DWG, DXF 対応・容量制限なし</div>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.dwg,.dxf" style={{ display:"none" }} onChange={e=>setUploadFile(e.target.files[0])}/>
            {[{label:"図面名 *",key:"name",placeholder:"例：ベルトコンベア_組立図"},{label:"図番",key:"number",placeholder:"例：CV-001-A"},{label:"タグ（カンマ区切り）",key:"tags",placeholder:"例：ベルト, 駆動部"}].map(({label,key,placeholder})=>(
              <div key={key} style={{ marginBottom:10 }}>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>{label}</div>
                <input value={uploadForm[key]} onChange={e=>setUploadForm({...uploadForm,[key]:e.target.value})} placeholder={placeholder} style={inp}/>
              </div>
            ))}
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10 }}>
              <div>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>客先</div>
                <select value={uploadForm.client||clients[0]||""} onChange={e=>setUploadForm({...uploadForm,client:e.target.value})} style={inp}>
                  {clients.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>工程</div>
                <select value={uploadForm.stage} onChange={e=>setUploadForm({...uploadForm,stage:e.target.value})} style={inp}>
                  {STAGES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,color:"#64748b",marginBottom:6 }}>製作状況</div>
              <div style={{ display:"flex",gap:8,marginBottom:8 }}>
                {Object.entries(PROD_STATUS).map(([key,info])=>(
                  <button key={key} onClick={()=>setUploadForm({...uploadForm,prod_status:key,prod_date:key==="done"?(uploadForm.prod_date||new Date().toISOString().split("T")[0]):""})}
                    style={{ flex:1,padding:"8px 0",borderRadius:8,border:`2px solid ${uploadForm.prod_status===key?info.dot:"#334155"}`,background:uploadForm.prod_status===key?info.bg:"transparent",color:uploadForm.prod_status===key?info.text:"#64748b",fontSize:11,cursor:"pointer" }}>
                    {info.label}
                  </button>
                ))}
              </div>
              {uploadForm.prod_status==="done" && (<>
                <div style={{ fontSize:11,color:"#64748b",marginBottom:3 }}>製作完了日</div>
                <input type="date" value={uploadForm.prod_date} onChange={e=>setUploadForm({...uploadForm,prod_date:e.target.value})} style={inp}/>
              </>)}
            </div>
            <button onClick={handleUpload} disabled={!uploadForm.name||!uploadFile||uploading}
              style={{ width:"100%",background:(!uploadForm.name||!uploadFile||uploading)?"#1e3a5f":"#1d4ed8",color:(!uploadForm.name||!uploadFile||uploading)?"#475569":"#fff",border:"none",borderRadius:10,padding:"13px 0",fontWeight:700,fontSize:14,cursor:(!uploadForm.name||!uploadFile||uploading)?"not-allowed":"pointer" }}>
              {uploading?"アップロード中...":"アップロード"}
            </button>
          </div>
        </div>
      )}
      <style>{`@media (min-width: 768px) { .desktop-sidebar { display: block !important; } }`}</style>
    </div>
  );
}
