import React, { useState } from 'react';
import { 
  Layout, UploadCloud, CheckCircle, ArrowRight, X, AlertCircle, 
  FileText, Loader2, BrickWall, DoorOpen, Brain, Image as ImageIcon, 
  Scale, User, Layers, Maximize
} from 'lucide-react';

const WizardStep = ({ number, title, active, completed }) => (
  <div className={`flex items-center gap-2 ${active ? 'text-blue-700 font-bold' : completed ? 'text-green-600' : 'text-slate-400'}`}>
    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors
      ${active ? 'bg-blue-100 border-blue-600 text-blue-700' : 
        completed ? 'bg-green-100 border-green-600 text-green-700' : 'border-slate-300'}`}>
      {completed ? <CheckCircle className="w-5 h-5" /> : number}
    </div>
    <span className="hidden sm:inline">{title}</span>
    <ArrowRight className={`h-4 w-4 mx-2 ${completed ? 'text-green-600' : 'text-slate-300'}`} />
  </div>
);

// Reusable Detail Row for Side-by-Side
const DetailRow = ({ label, left, right, highlightDiff = false }) => {
  const isDiff = highlightDiff && (left != right);
  
  // Helper to render value safely and prevent "Objects are not valid as a React child" errors
  const renderValue = (val) => {
    if (val === undefined || val === null || val === '') return '-';
    if (typeof val === 'object') {
      // If we accidentally get an object/array, stringify it or return a placeholder
      // This prevents the specific React crash you were seeing
      return JSON.stringify(val); 
    }
    return val;
  };

  return (
    <div className="grid grid-cols-3 border-b border-slate-100 py-2 last:border-0 text-sm">
      <div className="font-medium text-slate-500 flex items-center">{label}</div>
      <div className={`font-mono ${isDiff ? 'text-orange-600 font-bold' : 'text-slate-700'}`}>
        {renderValue(left)}
      </div>
      <div className={`font-mono ${isDiff ? 'text-indigo-600 font-bold' : 'text-slate-700'}`}>
        {renderValue(right)}
      </div>
    </div>
  );
};

export default function App() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Project Info
  const [clientName, setClientName] = useState('');
  const [floors, setFloors] = useState(1);
  
  // Files
  const [dxfFile, setDxfFile] = useState(null);
  const [imgFile, setImgFile] = useState(null);
  const [unit, setUnit] = useState('m');
  
  // Data
  const [data, setData] = useState(null);

  const handleAnalyze = async () => {
    if (!dxfFile) { setError("DXF file is required."); return; }
    setLoading(true); setError('');
    
    const fd = new FormData();
    fd.append('file', dxfFile);
    if(imgFile) fd.append('image_file', imgFile);
    fd.append('unit', unit);

    try {
      const res = await fetch('http://127.0.0.1:5000/analyze-cad', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg"><Layout className="h-6 w-6 text-white" /></div>
              <div><h1 className="text-xl font-bold text-slate-800">Nirman Estimator Pro</h1></div>
            </div>
            <div className="flex gap-4">
              <WizardStep number={1} title="Client Info" active={step===1} completed={step>1} />
              <WizardStep number={2} title="Upload" active={step===2} completed={step>2} />
              <WizardStep number={3} title="Report" active={step===3} completed={step>3} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* STEP 1: CLIENT INFO */}
        {step === 1 && (
          <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-lg border space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2"><User className="w-5 h-5"/> Client Details</h2>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Client Name</label>
              <input type="text" value={clientName} onChange={e=>setClientName(e.target.value)} className="w-full border p-2 rounded" placeholder="e.g. Mr. Sharma"/>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Number of Floors</label>
              <input type="number" value={floors} onChange={e=>setFloors(e.target.value)} className="w-full border p-2 rounded" min="1"/>
            </div>
            <button onClick={()=>setStep(2)} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold">Next Step</button>
          </div>
        )}

        {/* STEP 2: UPLOAD */}
        {step === 2 && (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="bg-white p-6 rounded-xl shadow border text-center space-y-4">
              <UploadCloud className="w-12 h-12 text-blue-600 mx-auto" />
              <h2 className="text-lg font-bold">Upload CAD Drawing (.dxf)</h2>
              <input type="file" accept=".dxf" onChange={e => setDxfFile(e.target.files[0])} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700"/>
            </div>
            <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 text-center space-y-4">
              <ImageIcon className="w-12 h-12 text-indigo-600 mx-auto" />
              <h2 className="text-lg font-bold text-indigo-900">Upload Floor Plan Image (Optional)</h2>
              <input type="file" accept="image/*" onChange={e => setImgFile(e.target.files[0])} className="block w-full text-sm text-indigo-800 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-white file:text-indigo-700"/>
            </div>
            <div className="bg-white p-4 rounded-xl border flex justify-center gap-4">
               <span>Unit:</span>
               <select value={unit} onChange={e=>setUnit(e.target.value)} className="border p-1 rounded"><option value="m">Meters</option></select>
            </div>
            {error && <div className="text-red-600 text-center bg-red-50 p-2 rounded">{error}</div>}
            <button onClick={handleAnalyze} disabled={loading} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex justify-center gap-2">
              {loading ? <Loader2 className="animate-spin"/> : "Generate Estimate"}
            </button>
          </div>
        )}

        {/* STEP 3: SPLIT REPORT */}
        {step === 3 && data && (
          <div className="space-y-6 animate-in fade-in">
            {/* Header Info */}
            <div className="bg-white p-4 rounded-xl shadow border flex justify-between items-center">
               <div>
                 <div className="text-xs text-slate-400 uppercase font-bold">Client</div>
                 <div className="text-xl font-bold text-slate-800">{clientName || 'Unknown'}</div>
               </div>
               <div className="text-right">
                 <div className="text-xs text-slate-400 uppercase font-bold">Floors</div>
                 <div className="text-xl font-bold text-slate-800">{floors}</div>
               </div>
            </div>

            {/* SPLIT VIEW */}
            <div className="grid md:grid-cols-2 gap-0 border rounded-xl overflow-hidden shadow-lg">
              
              {/* LEFT: CAD (Added optional chaining ?. everywhere to prevent crashes on partial data) */}
              <div className="bg-white p-6 border-r border-slate-200">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b">
                  <div className="bg-blue-100 p-2 rounded"><FileText className="w-5 h-5 text-blue-700"/></div>
                  <h3 className="font-bold text-lg text-slate-700">CAD Extracted Data</h3>
                </div>

                {/* Stats */}
                <div className="mb-6 bg-slate-50 p-4 rounded-lg">
                  <DetailRow label="Total Plinth Area" left={`${data?.boq?.slab_area ?? '-'} m²`} right="" />
                  <DetailRow label="Carpet Area" left={`${data?.boq?.carpet_area ?? '-'} m²`} right="" />
                  <div className="h-4"></div>
                  <DetailRow label="Doors" left={data?.counts?.doors ?? 0} right="" />
                  <DetailRow label="Windows" left={data?.counts?.windows ?? 0} right="" />
                  <DetailRow label="Ventilators" left={data?.counts?.ventilators ?? 0} right="" />
                </div>

                {/* Rooms */}
                <h4 className="font-bold text-sm text-slate-400 uppercase mb-3">Room Details</h4>
                <div className="space-y-4">
                  {data?.rooms?.length > 0 ? data.rooms.map((r, i) => (
                    <div key={i} className="border p-3 rounded-lg bg-slate-50">
                      <div className="flex justify-between font-bold text-slate-800 mb-1">
                        <span>{r?.name ?? 'Unnamed'}</span>
                        <span>{r?.area ?? '-'} m²</span>
                      </div>
                      <div className="text-xs text-slate-500 mb-2">Dims: {r?.dims ?? '-'}</div>
                      <div className="flex flex-wrap gap-1">
                        {r?.openings_attached?.length > 0 ? r.openings_attached.map((op,j)=>(
                          <span key={j} className="text-[10px] bg-white border px-1.5 py-0.5 rounded text-slate-600">{op}</span>
                        )) : <span className="text-[10px] text-red-400 italic">No openings linked</span>}
                      </div>
                    </div>
                  )) : <div className="italic text-slate-400">No rooms found.</div>}
                </div>
              </div>

              {/* RIGHT: AI - PROTECTED WITH OPTIONAL CHAINING */}
              <div className="bg-indigo-50/50 p-6">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-indigo-100">
                  <div className="bg-indigo-100 p-2 rounded"><Brain className="w-5 h-5 text-indigo-700"/></div>
                  <h3 className="font-bold text-lg text-indigo-900">AI Corrected Data</h3>
                </div>

                {/* Robust checks for AI data presence */}
                {data.ai_analysis && data.ai_analysis.corrected_stats ? (
                  <>
                    <div className="mb-6 bg-white/60 p-4 rounded-lg border border-indigo-100">
                      <DetailRow 
                        label="Total Plinth Area" 
                        left="" 
                        right={data.ai_analysis?.corrected_stats?.plinth_area ? `${data.ai_analysis.corrected_stats.plinth_area} m²` : '-'} 
                      />
                      <DetailRow 
                        label="Carpet Area" 
                        left="" 
                        right={data.ai_analysis?.corrected_stats?.carpet_area ? `${data.ai_analysis.corrected_stats.carpet_area} m²` : '-'} 
                      />
                      <div className="h-4"></div>
                      <DetailRow 
                        label="Doors" 
                        left="" 
                        right={data.ai_analysis?.corrected_stats?.counts?.doors ?? 0} 
                        highlightDiff 
                      />
                      <DetailRow 
                        label="Windows" 
                        left="" 
                        right={data.ai_analysis?.corrected_stats?.counts?.windows ?? 0} 
                        highlightDiff 
                      />
                      <DetailRow 
                        label="Ventilators" 
                        left="" 
                        right={data.ai_analysis?.corrected_stats?.counts?.ventilators ?? 0} 
                        highlightDiff 
                      />
                    </div>

                    <h4 className="font-bold text-sm text-indigo-400 uppercase mb-3">Verified Room List</h4>
                    <div className="space-y-4">
                      {data.ai_analysis?.corrected_rooms && data.ai_analysis.corrected_rooms.length > 0 ? data.ai_analysis.corrected_rooms.map((r, i) => (
                        <div key={i} className="border border-indigo-100 p-3 rounded-lg bg-white">
                          <div className="flex justify-between font-bold text-indigo-900 mb-1">
                            <span>{r?.name ?? 'Unnamed'}</span>
                            <span>{r?.area ?? '-'}</span>
                          </div>
                          <div className="text-xs text-indigo-600 mb-2">Dims: {r?.dims ?? '-'}</div>
                          <div className="flex flex-wrap gap-1">
                            {r?.openings_attached && r.openings_attached.length > 0 ? r.openings_attached.map((op,j)=>(
                              <span key={j} className="text-[10px] bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded text-indigo-700">{op}</span>
                            )) : <span className="italic text-indigo-400 text-[10px]">No openings</span>}
                          </div>
                        </div>
                      )) : <div className="italic text-indigo-400 p-4 text-center">No rooms found by AI.</div>}
                    </div>
                    
                    <div className="mt-6 p-3 bg-yellow-50 text-yellow-800 text-xs rounded border border-yellow-200">
                      <strong>AI Note:</strong> {data.ai_analysis?.visual_notes || "No specific issues noted."}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-10 text-slate-400 italic">
                    {data.ai_analysis?.visual_notes || "AI Analysis unavailable or loading..."}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}