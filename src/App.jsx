import React, { useState } from 'react';
import { 
  Layout, Plus, Trash2, UploadCloud, FileText, CheckCircle, 
  ArrowRight, ArrowLeft, Home, Save, Download, Loader2, 
  FileCode, X, HelpCircle, PenTool, Layers, Type, Maximize,
  DoorOpen, Grid, Activity
} from 'lucide-react';

const ROOM_TYPES = [
  "Living Room", "Dining", "Master Bed", "Bedroom 2", 
  "Kitchen", "Work Area", "Sitout", "Verandah", "Toilet"
];

// --- UI Components ---

const WizardStep = ({ number, title, active }) => (
  <div className={`flex items-center gap-2 ${active ? 'text-emerald-700 font-bold' : 'text-gray-400'}`}>
    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${active ? 'bg-emerald-100 border-emerald-600' : 'border-gray-300'}`}>
      {number}
    </div>
    <span className="hidden sm:inline">{title}</span>
    <ArrowRight className="h-4 w-4 mx-2 text-gray-300" />
  </div>
);

const CadGuideModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden">
        <div className="bg-emerald-800 p-4 flex justify-between items-center text-white">
          <h3 className="font-bold flex items-center gap-2"><FileCode className="h-5 w-5" /> Drafting Standards</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4 text-sm">
            <p>1. <strong>Walls:</strong> Draw parallel lines on layer <code>WALL</code>. (23cm or 15cm apart).</p>
            <p>2. <strong>Plinth:</strong> Draw one closed polyline on layer <code>PLINTH_AREA</code> (Outer Boundary).</p>
            <p>3. <strong>Rooms:</strong> Draw closed polylines on <code>ROOM_AREA</code> with Text inside.</p>
            <p>4. <strong>Openings:</strong> Draw single width lines on <code>DOOR</code> or <code>WINDOW</code>.</p>
        </div>
        <div className="p-4 border-t flex justify-end"><button onClick={onClose} className="bg-gray-800 text-white px-4 py-2 rounded">Close</button></div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [step, setStep] = useState(1);
  const [projectData, setProjectData] = useState({ floors: [{ id: 1, name: "Ground Floor", rooms: [] }] });
  const [cadData, setCadData] = useState(null); 
  const [isUploading, setIsUploading] = useState(false);
  const [showCadGuide, setShowCadGuide] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // --- Handlers ---
  const addFloor = () => setProjectData({ ...projectData, floors: [...projectData.floors, { id: projectData.floors.length + 1, name: "New Floor", rooms: [] }] });
  const removeFloor = (id) => setProjectData({ ...projectData, floors: projectData.floors.filter(f => f.id !== id) });
  const addRoom = (fid, name) => {
    const updated = projectData.floors.map(f => f.id === fid ? { ...f, rooms: [...f.rooms, { id: Date.now(), name, l: "", b: "" }] } : f);
    setProjectData({ ...projectData, floors: updated });
  };
  const removeRoom = (fid, rid) => {
    const updated = projectData.floors.map(f => f.id === fid ? { ...f, rooms: f.rooms.filter(r => r.id !== rid) } : f);
    setProjectData({ ...projectData, floors: updated });
  };
  const updateRoomDim = (fid, rid, key, val) => {
    const updated = projectData.floors.map(f => f.id === fid ? { ...f, rooms: f.rooms.map(r => r.id === rid ? { ...r, [key]: val } : r) } : f);
    setProjectData({ ...projectData, floors: updated });
  };

  const handleCadUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsUploading(true);
    setErrorMsg(null);
    setCadData(null); // Clear previous data
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      // UPDATED: Used 127.0.0.1 instead of localhost to prevent IPv6 mismatch
      const response = await fetch('http://127.0.0.1:5000/analyze-cad', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        // IMPROVED ERROR HANDLING: Capture exact status code and text from server
        let errText = await response.text();
        try {
            // Try to parse JSON error if possible
            const errJson = JSON.parse(errText);
            if (errJson.error) errText = errJson.error;
        } catch (e) {
            // If not JSON, use raw text (which might be HTML for 404/500)
            if (errText.includes("<!DOCTYPE html>")) errText = "Server Error (Check Python Console)";
        }
        throw new Error(`Server returned ${response.status}: ${errText}`);
      }
      
      const data = await response.json();
      console.log("RAW PYTHON DATA:", data); // Check console for exact response
      
      if (data.error) throw new Error(data.error);

      setCadData(data); // Store raw data for diagnostics
      
      const cadRooms = data.rooms || [];

      // Update Rooms in UI based on Text Matching
      const updatedFloors = projectData.floors.map((floor, index) => {
        if (index === 0) { 
          let updatedUserRooms = floor.rooms.map(uRoom => ({...uRoom}));
          let availableCadRooms = [...cadRooms];

          // Fuzzy Matching Synonyms
          const ROOM_SYNONYMS = {
            "master bed": ["bed", "bedroom", "mst"], "bedroom 2": ["bed", "guest"], "kitchen": ["kitchen", "kit"], 
            "living room": ["hall", "living"], "dining": ["dining"], "toilet": ["bath", "wc", "toilet"]
          };

          updatedUserRooms = updatedUserRooms.map(uRoom => {
            const keys = ROOM_SYNONYMS[uRoom.name.toLowerCase()] || [uRoom.name.toLowerCase()];
            const matchIdx = availableCadRooms.findIndex(c => keys.some(k => c.name && c.name.toLowerCase().includes(k)));
            
            if (matchIdx !== -1) {
              const match = availableCadRooms[matchIdx];
              availableCadRooms.splice(matchIdx, 1);
              return { ...uRoom, l: match.l, b: match.b, source: `CAD: ${match.name}` };
            }
            return uRoom;
          });

          // Fill remaining empty user rooms with remaining CAD rooms
          updatedUserRooms = updatedUserRooms.map(uRoom => {
            if ((!uRoom.l || uRoom.l === "") && availableCadRooms.length > 0) {
                const match = availableCadRooms.shift();
                return { ...uRoom, l: match.l, b: match.b, source: `CAD: Auto` };
            }
            return uRoom;
          });

          return { ...floor, rooms: updatedUserRooms };
        }
        return floor;
      });
      
      setProjectData({ ...projectData, floors: updatedFloors });

    } catch (err) { 
      console.error(err);
      setErrorMsg(err.message);
    } 
    finally { setIsUploading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-24">
      <div className="bg-emerald-800 text-white p-4 shadow-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center gap-3"><Layout className="h-6 w-6 text-emerald-300" /><h1 className="text-xl font-bold">Nirman Estimator (Strict Mode)</h1></div>
      </div>

      <div className="bg-white border-b border-gray-200 mb-8 sticky top-14 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex gap-8 overflow-x-auto">
            {[1,2,3,4].map(n => <WizardStep key={n} number={n} title={['Floors','Rooms','Dimensions','Results'][n-1]} active={step >= n} />)}
        </div>
      </div>

      <CadGuideModal isOpen={showCadGuide} onClose={() => setShowCadGuide(false)} />

      <div className="max-w-6xl mx-auto px-4">
        {step === 1 && (
            <div className="grid gap-4 max-w-md mx-auto">
                <h2 className="text-xl font-bold text-center mb-4">1. Project Setup</h2>
                {projectData.floors.map(f => (
                    <div key={f.id} className="p-4 bg-white border rounded shadow flex justify-between">
                        <span>{f.name}</span>
                        {f.id > 1 && <button onClick={() => removeFloor(f.id)} className="text-red-500"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                ))}
                <button onClick={addFloor} className="p-3 border-2 border-dashed rounded text-gray-500 flex justify-center gap-2"><Plus /> Add Floor</button>
            </div>
        )}

        {step === 2 && (
            <div className="grid md:grid-cols-2 gap-6">
                {projectData.floors.map(f => (
                    <div key={f.id} className="bg-white p-5 rounded shadow">
                        <h3 className="font-bold border-b pb-2 mb-4">{f.name}</h3>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {ROOM_TYPES.map(t => <button key={t} onClick={() => addRoom(f.id, t)} className="px-3 py-1 bg-gray-100 rounded text-xs">+ {t}</button>)}
                        </div>
                        <div className="space-y-2">
                            {f.rooms.map(r => (
                                <div key={r.id} className="flex justify-between bg-gray-50 p-2 rounded">
                                    <span>{r.name}</span>
                                    <button onClick={() => removeRoom(f.id, r.id)}><X className="h-4 w-4 text-gray-400" /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )}

        {step === 3 && (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div><h2 className="text-xl font-bold">3. Extraction & Dimensions</h2><p className="text-sm text-gray-500">Upload to extract real values.</p></div>
                    <div className="flex gap-2 items-center">
                        <button onClick={() => setShowCadGuide(true)} className="text-sm text-blue-600 underline">Guide</button>
                        <label className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer flex gap-2">
                            {isUploading ? <Loader2 className="animate-spin h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
                            <input type="file" accept=".dxf,.dwg" onChange={handleCadUpload} className="hidden" />
                            {isUploading ? "Analyzing..." : "Upload CAD"}
                        </label>
                    </div>
                </div>

                {errorMsg && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3">
                        <X className="h-5 w-5" />
                        <div><strong>Extraction Failed:</strong> {errorMsg}</div>
                    </div>
                )}

                {/* --- DIAGNOSTICS PANEL (RAW DATA) --- */}
                {cadData && (
                    <div className="bg-gray-800 text-white p-4 rounded-lg shadow-lg font-mono text-xs">
                        <h3 className="text-emerald-400 font-bold mb-3 flex items-center gap-2"><Activity className="h-4 w-4" /> CAD EXTRACTION REPORT (RAW)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-2 bg-gray-700 rounded">
                                <span className="text-gray-400 block">Outer Wall (23cm)</span>
                                <span className="text-lg font-bold">{cadData.walls_outer_23_len.toFixed(2)} m</span>
                            </div>
                            <div className="p-2 bg-gray-700 rounded">
                                <span className="text-gray-400 block">Inner Wall (23cm)</span>
                                <span className="text-lg font-bold">{cadData.walls_inner_23_len.toFixed(2)} m</span>
                            </div>
                            <div className="p-2 bg-gray-700 rounded">
                                <span className="text-gray-400 block">Inner Wall (15cm)</span>
                                <span className="text-lg font-bold">{cadData.walls_inner_15_len.toFixed(2)} m</span>
                            </div>
                            <div className="p-2 bg-gray-700 rounded">
                                <span className="text-gray-400 block">Openings Detected</span>
                                <span className="text-lg font-bold text-yellow-400">{cadData.openings.length}</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-600 text-gray-400">
                            Debug Log: {cadData.debug_log ? cadData.debug_log.join(' | ') : 'No logs'}
                        </div>
                    </div>
                )}

                {/* --- DETECTED OPENINGS LIST --- */}
                {cadData && cadData.openings && cadData.openings.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                        <h3 className="font-bold text-orange-800 mb-2 flex items-center gap-2">
                          <DoorOpen className="h-5 w-5"/> Detected Openings
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {cadData.openings.map((op, idx) => (
                                <span key={idx} className="bg-white border border-orange-200 px-2 py-1 rounded text-xs text-orange-800 shadow-sm">
                                    {op.type} ({op.is_outer ? 'Ext' : 'Int'}): <strong>{op.width}m</strong>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {projectData.floors.map(f => (
                    <div key={f.id} className="bg-white rounded shadow border overflow-hidden">
                        <div className="bg-gray-50 p-4 font-bold border-b">{f.name}</div>
                        <div className="p-4 space-y-4">
                            {f.rooms.map(r => (
                                <div key={r.id} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-4 font-medium text-sm">{r.name} {r.source && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">{r.source}</span>}</div>
                                    <div className="col-span-3"><input type="number" placeholder="L" value={r.l} onChange={e => updateRoomDim(f.id, r.id, 'l', e.target.value)} className="w-full border rounded p-1" /></div>
                                    <div className="col-span-3"><input type="number" placeholder="B" value={r.b} onChange={e => updateRoomDim(f.id, r.id, 'b', e.target.value)} className="w-full border rounded p-1" /></div>
                                    <div className="col-span-2 text-xs text-right text-gray-400">{r.l && r.b ? (r.l*r.b).toFixed(2) + ' m²' : '-'}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )}

        {step === 4 && (
            <div className="text-center py-10 bg-white shadow rounded border">
                <h2 className="text-xl font-bold mb-2">Extraction Complete</h2>
                <p className="text-gray-500">Go back to verify dimensions or use the values above for your manual estimation.</p>
                <p className="text-xs text-gray-400 mt-4">(BOQ Generation temporarily hidden as requested)</p>
            </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t flex justify-between max-w-6xl mx-auto shadow-lg">
            <button disabled={step===1} onClick={() => setStep(step-1)} className="px-6 py-2 border rounded disabled:opacity-50">Back</button>
            {step < 4 && <button onClick={() => setStep(step+1)} className="px-6 py-2 bg-emerald-700 text-white rounded">Next</button>}
        </div>
      </div>
    </div>
  );
}