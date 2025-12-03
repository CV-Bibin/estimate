import React, { useState } from 'react';
import { 
  Layout, Plus, Trash2, UploadCloud, CheckCircle, 
  ArrowRight, ArrowLeft, X, Activity, Save,
  AlertCircle, FileText, Loader2, Info, BrickWall, DoorOpen, Calculator
} from 'lucide-react';

const ROOM_TYPES = [
  "Living Room", "Dining", "Master Bed", "Bedroom 2", 
  "Kitchen", "Work Area", "Sitout", "Verandah", "Toilet", "Porch"
];

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

export default function App() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [unit, setUnit] = useState('m');
  const [cadRawData, setCadRawData] = useState(null);
  
  // User Input State (For Comparison Only)
  const [userRooms, setUserRooms] = useState([]);

  const handleAnalyze = async () => {
    if (!file) { setError("Please select a DXF file."); return; }
    
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('unit', unit);

    try {
      const response = await fetch('http://127.0.0.1:5000/analyze-cad', { method: 'POST', body: formData });
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || "Analysis failed");
      
      setCadRawData(data);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getComparisonMessage = () => {
    if (!cadRawData) return null;
    const cadCount = cadRawData.rooms.length;
    const userCount = userRooms.length;
    const diff = cadCount - userCount;

    if (diff === 0) return { type: 'success', text: `Perfect Match! Found ${cadCount} rooms as expected.` };
    if (diff > 0) return { type: 'warning', text: `Found ${diff} extra room(s) in CAD that were not in your list.` };
    return { type: 'warning', text: `Missing ${Math.abs(diff)} room(s). You listed ${userCount}, but CAD only had ${cadCount}.` };
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg"><Layout className="h-6 w-6 text-white" /></div>
              <div><h1 className="text-xl font-bold text-slate-800">Nirman Estimator Pro</h1><p className="text-xs text-slate-500">Strict Layer Standard Mode</p></div>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              <WizardStep number={1} title="Project Setup" active={step===1} completed={step>1} />
              <WizardStep number={2} title="CAD Analysis" active={step===2} completed={step>2} />
              <WizardStep number={3} title="Review" active={step===3} completed={step>3} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* STEP 1: SETUP */}
        {step === 1 && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex gap-3 text-sm text-blue-800">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <strong>Standard Layers Required:</strong> WALL, ROOM_AREA, PLINTH_AREA, DOOR, WINDOW.
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="font-bold text-lg mb-4">Ground Floor Rooms</div>
              <div className="flex flex-wrap gap-2 mb-6">
                {ROOM_TYPES.map(t => <button key={t} onClick={()=>setUserRooms([...userRooms, { id: Date.now(), name: t }])} className="px-3 py-1 bg-slate-100 rounded-full text-xs hover:bg-slate-200">+ {t}</button>)}
              </div>
              
              {userRooms.length === 0 ? (
                <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-lg">Select rooms to compare count later...</div>
              ) : (
                <div className="grid md:grid-cols-3 gap-3">
                  {userRooms.map(r => (
                    <div key={r.id} className="flex justify-between items-center p-3 border rounded bg-slate-50">
                      <span>{r.name}</span>
                      <button onClick={() => setUserRooms(userRooms.filter(x => x.id !== r.id))} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={()=>setStep(2)} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold">Next Step</button>
          </div>
        )}

        {/* STEP 2: UPLOAD */}
        {step === 2 && (
          <div className="max-w-xl mx-auto bg-white p-8 rounded-xl shadow-lg border text-center space-y-6">
            <UploadCloud className="w-16 h-16 text-blue-600 mx-auto" />
            <h2 className="text-xl font-bold">Upload Standardized DXF</h2>
            <input type="file" accept=".dxf" onChange={e => setFile(e.target.files[0])} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
            <div className="flex justify-center gap-4 items-center">
              <span>Unit:</span>
              <select value={unit} onChange={e => setUnit(e.target.value)} className="border p-2 rounded">
                <option value="m">Meters</option><option value="mm">Millimeters</option><option value="ft">Feet</option>
              </select>
            </div>
            {error && <div className="text-red-600 bg-red-50 p-3 rounded">{error}</div>}
            <button onClick={handleAnalyze} disabled={loading} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex justify-center gap-2">
              {loading ? <Loader2 className="animate-spin"/> : "Analyze"}
            </button>
          </div>
        )}

        {/* STEP 3: RESULTS */}
        {step === 3 && cadRawData && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
            
            {/* COMPARISON BANNER */}
            {(() => {
              const msg = getComparisonMessage();
              return msg && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${msg.type==='success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-orange-50 text-orange-800 border-orange-200'} border`}>
                  {msg.type === 'success' ? <CheckCircle className="w-5 h-5"/> : <AlertCircle className="w-5 h-5"/>}
                  <span className="font-medium">{msg.text}</span>
                </div>
              );
            })()}

            {/* BOQ CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 text-white p-4 rounded-xl shadow">
                <div className="text-xs uppercase font-bold text-slate-400">Plinth</div>
                <div className="text-2xl font-bold">{cadRawData.boq.slab_area} m²</div>
              </div>
              <div className="bg-white p-4 rounded-xl border shadow-sm">
                <div className="text-xs uppercase font-bold text-slate-400">Carpet</div>
                <div className="text-2xl font-bold">{cadRawData.boq.carpet_area} m²</div>
              </div>
              <div className="bg-white p-4 rounded-xl border shadow-sm">
                <div className="text-xs uppercase font-bold text-slate-400">Masonry</div>
                <div className="text-2xl font-bold">{cadRawData.boq.masonry_vol} m³</div>
              </div>
              <div className="bg-white p-4 rounded-xl border shadow-sm">
                <div className="text-xs uppercase font-bold text-slate-400">Plaster</div>
                <div className="text-2xl font-bold">{cadRawData.boq.plaster_area} m²</div>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              
              {/* LEFT: ROOMS */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-xl shadow border overflow-hidden">
                  <div className="bg-slate-50 p-4 font-bold border-b flex justify-between items-center">
                    <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600"/> CAD Extracted Rooms</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">{cadRawData.rooms.length} found</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr><th className="p-3">Name</th><th className="p-3">Length</th><th className="p-3">Breadth</th><th className="p-3 text-right">Area</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {cadRawData.rooms.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-3 font-medium">{r.name}</td>
                            <td className="p-3 text-slate-600">{r.l} m</td>
                            <td className="p-3 text-slate-600">{r.b} m</td>
                            <td className="p-3 text-right font-bold">{r.area} m²</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* DETECTED OPENINGS (DOORS & WINDOWS) */}
                <div className="bg-white rounded-xl shadow border overflow-hidden">
                  <div className="bg-slate-50 p-4 font-bold border-b flex justify-between items-center">
                    <span className="flex items-center gap-2"><DoorOpen className="w-4 h-4 text-purple-600"/> Doors & Windows</span>
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">{cadRawData.openings.length} items</span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4 p-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase">Doors</h4>
                      {cadRawData.openings.filter(o=>o.type==='door').length === 0 ? <p className="text-sm text-slate-400 italic">None found</p> : (
                        <div className="space-y-1">
                          {cadRawData.openings.filter(o=>o.type==='door').map((o,i)=>(
                            <div key={i} className="flex justify-between text-sm bg-slate-50 p-2 rounded">
                              <span>Door</span><span className="font-mono font-bold">{o.width}m</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase">Windows</h4>
                      {cadRawData.openings.filter(o=>o.type==='window').length === 0 ? <p className="text-sm text-slate-400 italic">None found</p> : (
                        <div className="space-y-1">
                          {cadRawData.openings.filter(o=>o.type==='window').map((o,i)=>(
                            <div key={i} className="flex justify-between text-sm bg-slate-50 p-2 rounded">
                              <span>Window</span><span className="font-mono font-bold">{o.width}m</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: WALLS & SUMMARY */}
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow border overflow-hidden">
                  <div className="bg-slate-50 p-4 font-bold border-b flex items-center gap-2">
                    <BrickWall className="w-4 h-4 text-orange-600"/> Wall Summary
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Outer Walls</span>
                      <span className="font-bold">{cadRawData.summary.outer_walls_len} m</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Inner Walls</span>
                      <span className="font-bold">{cadRawData.summary.inner_walls_len} m</span>
                    </div>
                    <div className="pt-4 border-t">
                      <h4 className="text-xs font-bold text-slate-400 mb-2">DETAILED SEGMENTS</h4>
                      <div className="max-h-64 overflow-y-auto space-y-1 pr-2">
                        {cadRawData.walls.map((w, i) => (
                          <div key={i} className="flex justify-between text-xs bg-slate-50 p-1.5 rounded">
                            <span className={w.is_outer ? "text-orange-600 font-medium" : "text-slate-500"}>
                              {w.is_outer ? 'Outer' : 'Inner'}
                            </span>
                            <span className="font-mono">{w.thickness}m thick</span>
                            <span className="font-bold">{w.len}m</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}