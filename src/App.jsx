import React, { useState } from 'react';
import { 
  Layout, Plus, Trash2, UploadCloud, CheckCircle, 
  ArrowRight, ArrowLeft, X, Activity, Save,
  AlertCircle, FileText, Loader2, Info, BrickWall, DoorOpen, Maximize
} from 'lucide-react';

const ROOM_TYPES = [
  "Living Room", "Dining", "Master Bed", "Bedroom 2", 
  "Kitchen", "Work Area", "Sitout", "Verandah", "Toilet", "Porch"
];

const SYNONYM_MAP = {
  "living": ["hall", "lounge", "drawing", "sitout", "family", "great"],
  "hall": ["living", "passage", "lobby", "entrance"],
  "master": ["mbed", "bed", "bedroom", "suite"],
  "bedroom": ["bed", "guest", "study", "office", "room"],
  "bed": ["bedroom", "bdr", "sleep"],
  "kitchen": ["kit", "cook", "pantry", "utility"],
  "work": ["utility", "wash", "service"],
  "dining": ["din", "breakfast", "eating"],
  "toilet": ["bath", "wc", "restroom", "powder", "wash", "t&b"],
  "bath": ["toilet", "wc"],
  "sitout": ["verandah", "porch", "balcony", "deck", "patio"]
};

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
  const [projectData, setProjectData] = useState({ floors: [{ id: 1, name: "Ground Floor", rooms: [] }] });

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
      performMatching(data);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const performMatching = (cadData) => {
    const cadRoomsPool = [...cadData.rooms];
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    const getMatchScore = (uName, cName) => {
      const u = normalize(uName);
      const c = normalize(cName);
      if (u === c) return 100;
      if (u.includes(c) || c.includes(u)) return 80;
      
      const uTokens = uName.toLowerCase().split(/\s+/);
      for (const token of uTokens) {
        const synonyms = SYNONYM_MAP[token] || [];
        if (synonyms.some(syn => c.includes(syn))) return 95;
      }
      return 0;
    };

    setProjectData(prev => {
      const updatedFloors = prev.floors.map(floor => {
        // 1. Match existing user rooms
        const matchedUserRooms = floor.rooms.map(userRoom => {
          let bestIdx = -1, bestScore = 0;
          cadRoomsPool.forEach((cr, i) => {
            const score = getMatchScore(userRoom.name, cr.name);
            if (score > 50 && score > bestScore) { bestScore = score; bestIdx = i; }
          });

          if (bestIdx !== -1) {
            const match = cadRoomsPool.splice(bestIdx, 1)[0];
            return { 
              ...userRoom, 
              l: match.l, 
              b: match.b, 
              area: match.area, 
              matched: true, 
              source: `CAD: ${match.name}` 
            };
          }
          return { ...userRoom, matched: false };
        });

        // 2. Capture remaining CAD rooms
        const extraRooms = cadRoomsPool.map(cr => ({
          id: `cad-extra-${cr.id}`, 
          name: cr.name, 
          l: cr.l, 
          b: cr.b, 
          area: cr.area, 
          matched: true, 
          source: 'Auto-Detected'
        }));

        return { ...floor, rooms: [...matchedUserRooms, ...extraRooms] };
      });
      return { ...prev, floors: updatedFloors };
    });
  };

  const addRoom = (fid, name) => {
    setProjectData(prev => ({
      ...prev, floors: prev.floors.map(f => f.id === fid ? {...f, rooms: [...f.rooms, { id: Date.now(), name }]} : f)
    }));
  };

  const updateRoomDim = (floorId, roomId, field, value) => {
    setProjectData(prev => ({
      ...prev,
      floors: prev.floors.map(f => f.id === floorId ? { 
        ...f, 
        rooms: f.rooms.map(r => r.id === roomId ? { 
          ...r, 
          [field]: value,
          area: (field === 'l' || field === 'b') && value && (field === 'l' ? r.b : r.l) 
            ? (parseFloat(value) * parseFloat(field === 'l' ? r.b : r.l)).toFixed(2) 
            : r.area
        } : r) 
      } : f)
    }));
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
            {projectData.floors.map(floor => (
              <div key={floor.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="font-bold text-lg mb-4">{floor.name}</div>
                <div className="flex flex-wrap gap-2 mb-6">
                  {ROOM_TYPES.map(t => <button key={t} onClick={()=>addRoom(floor.id, t)} className="px-3 py-1 bg-slate-100 rounded-full text-xs hover:bg-slate-200">+ {t}</button>)}
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  {floor.rooms.map(r => (
                    <div key={r.id} className="flex justify-between items-center p-3 border rounded bg-slate-50">
                      <span>{r.name}</span>
                      <button onClick={() => setProjectData(prev => ({...prev, floors: prev.floors.map(f => f.id===floor.id ? {...f, rooms: f.rooms.filter(x => x.id !== r.id)} : f)}))} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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

        {/* STEP 3: REVIEW */}
        {step === 3 && (
          <div className="space-y-8">
            
            {/* BOQ CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 text-white p-4 rounded-xl shadow">
                <div className="text-xs uppercase font-bold text-slate-400">Plinth</div>
                <div className="text-2xl font-bold">{cadRawData?.boq?.slab_area} m²</div>
              </div>
              <div className="bg-white p-4 rounded-xl border shadow-sm">
                <div className="text-xs uppercase font-bold text-slate-400">Carpet</div>
                <div className="text-2xl font-bold">{cadRawData?.boq?.carpet_area} m²</div>
              </div>
              <div className="bg-white p-4 rounded-xl border shadow-sm">
                <div className="text-xs uppercase font-bold text-slate-400">Masonry</div>
                <div className="text-2xl font-bold">{cadRawData?.boq?.masonry_vol} m³</div>
              </div>
              <div className="bg-white p-4 rounded-xl border shadow-sm">
                <div className="text-xs uppercase font-bold text-slate-400">Plaster</div>
                <div className="text-2xl font-bold">{cadRawData?.boq?.plaster_area} m²</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* LEFT COL: PROJECT ESTIMATE */}
              <div className="lg:col-span-2 space-y-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600"/> Project Room List
                </h3>
                {projectData.floors.map(floor => (
                  <div key={floor.id} className="bg-white rounded-xl shadow border overflow-hidden">
                    <div className="bg-slate-50 p-4 font-bold border-b">{floor.name}</div>
                    <div className="p-4 space-y-2">
                      {floor.rooms.map(room => (
                        <div key={room.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 rounded border hover:border-blue-300 transition-colors">
                          <div className="w-full sm:w-1/3">
                            <div className="font-bold text-slate-800">{room.name}</div>
                            {room.source && <div className="text-xs text-green-600 font-medium">{room.source}</div>}
                          </div>
                          
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] text-gray-400 uppercase">Length</label>
                              <input className="w-full bg-white border rounded px-2 py-1 text-sm font-mono" 
                                value={room.l||''} placeholder="0.00" onChange={(e) => updateRoomDim(floor.id, room.id, 'l', e.target.value)} />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 uppercase">Breadth</label>
                              <input className="w-full bg-white border rounded px-2 py-1 text-sm font-mono" 
                                value={room.b||''} placeholder="0.00" onChange={(e) => updateRoomDim(floor.id, room.id, 'b', e.target.value)} />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 uppercase">Area</label>
                              <div className="w-full bg-slate-100 border border-transparent rounded px-2 py-1 text-sm font-bold text-right">{room.area || '-'}</div>
                            </div>
                          </div>
                          
                          <div className="w-8 flex justify-center items-center">
                            {room.matched ? <CheckCircle className="w-5 h-5 text-green-500" /> : <div className="w-2 h-2 rounded-full bg-gray-300"></div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* RIGHT COL: RAW CAD DATA */}
              <div className="space-y-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-orange-600"/> Detected Assets
                </h3>

                {/* RAW ROOMS */}
                <div className="bg-white rounded-xl shadow border overflow-hidden">
                  <div className="bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 border-b flex justify-between">
                    <span>Raw Rooms Found</span>
                    <span>{cadRawData?.rooms?.length || 0}</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {cadRawData?.rooms?.map((r, i) => (
                      <div key={i} className="p-3 border-b text-sm hover:bg-slate-50">
                        <div className="font-bold">{r.name}</div>
                        <div className="text-slate-500 text-xs flex gap-2 mt-1">
                          <span>L: {r.l}</span><span>B: {r.b}</span><span>A: {r.area}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* OPENINGS - SPLIT INTO DOORS & WINDOWS */}
                <div className="bg-white rounded-xl shadow border overflow-hidden">
                  <div className="bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 border-b flex justify-between">
                    <span>Doors Found</span>
                    <span>{cadRawData?.openings?.filter(o => o.type === 'door').length || 0}</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto">
                    {cadRawData?.openings?.filter(o => o.type === 'door').map((o, i) => (
                      <div key={i} className="p-2 border-b text-sm flex justify-between hover:bg-slate-50">
                        <span>Door</span>
                        <span className="font-mono font-bold">{o.width} m</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow border overflow-hidden">
                  <div className="bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 border-b flex justify-between">
                    <span>Windows Found</span>
                    <span>{cadRawData?.openings?.filter(o => o.type === 'window').length || 0}</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto">
                    {cadRawData?.openings?.filter(o => o.type === 'window').map((o, i) => (
                      <div key={i} className="p-2 border-b text-sm flex justify-between hover:bg-slate-50">
                        <span>Window</span>
                        <span className="font-mono font-bold">{o.width} m</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* WALLS */}
                <div className="bg-white rounded-xl shadow border overflow-hidden">
                  <div className="bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 border-b flex justify-between">
                    <span>Walls Found</span>
                    <span>{cadRawData?.walls?.length || 0}</span>
                  </div>
                  <div className="p-3 text-xs text-slate-500">
                    <div>Outer: {cadRawData?.summary?.outer_walls_len} m</div>
                    <div>Inner: {cadRawData?.summary?.inner_walls_len} m</div>
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