import React, { useState, useEffect, useMemo } from "react";
import { Trash2, Plus, Save, Edit3, DoorOpen, AppWindow, Wind, Maximize, ArrowRight, CheckCircle2 } from "lucide-react";

// --- Helper Component: Summary Badge ---
const SummaryBadge = ({ icon: Icon, label, count, color }) => (
  <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${color} bg-white shadow-sm flex-1`}>
    <div className={`p-2 rounded-full ${color.replace('border-', 'bg-').replace('-200', '-50')} text-slate-700`}>
      <Icon size={18} />
    </div>
    <div>
      <div className="text-2xl font-bold text-slate-800 leading-none">{count}</div>
      <div className="text-[10px] uppercase font-bold text-slate-400 mt-1">{label}</div>
    </div>
  </div>
);

export default function OpeningEditor({ rooms, onSaveData }) {
  const [rows, setRows] = useState([]);

  // 1. EXTRACT UNIQUE ROOM NAMES (For Dropdowns)
  const availableRooms = useMemo(() => {
    if (!rooms || !Array.isArray(rooms)) return [];
    // Get unique names, filter out empty/nulls, and sort alphabetically
    const names = rooms.map(r => r.name).filter(n => n).sort();
    return Array.from(new Set(names));
  }, [rooms]);

  // 2. INITIALIZE & DEDUPLICATE DATA
  useEffect(() => {
    if (!rooms || !Array.isArray(rooms)) return;

    const uniqueOpenings = new Map();

    rooms.forEach((room) => {
      const openings = Array.isArray(room.openings_attached) ? room.openings_attached : [];

      openings.forEach((op) => {
        let id, type, width, connectsTo, wallId, isRich;

        // A. Rich Object Check (From Python Backend)
        if (typeof op === 'object' && op !== null && op.id) {
           id = op.id;
           type = op.type;
           width = op.width;
           connectsTo = op.connects_to || [room.name];
           wallId = op.wall_id || null; // Capture Wall ID
           isRich = true;
        } else {
           // B. String Fallback (From AI only)
           const opStr = typeof op === 'string' ? op : "Unknown";
           const parts = opStr.match(/([a-zA-Z]+)\s*\((\d+\.?\d*)m\)/);
           type = parts ? parts[1] : opStr;
           width = parts ? parseFloat(parts[2]) : 1.0;
           id = `ai-${room.name}-${type}-${width}`; 
           connectsTo = [room.name];
           wallId = null; 
           isRich = false;
        }

        // Auto-guess height
        let height = 2.1;
        const tLower = String(type).toLowerCase();
        if (tLower.includes('window')) height = 1.5;
        else if (tLower.includes('vent')) height = 0.6;

        const openingData = { 
            id, type, width, height, 
            connectsTo: isRich ? [...connectsTo] : connectsTo, 
            wallId, 
            isManual: false 
        };

        // C. Deduplication Strategy
        if (isRich) {
             if (!uniqueOpenings.has(id)) {
                uniqueOpenings.set(id, openingData);
             } else {
                // Merge connection info if same ID appears in another room
                const existing = uniqueOpenings.get(id);
                const combined = new Set([...existing.connectsTo, ...connectsTo]);
                existing.connectsTo = Array.from(combined);
                if (!existing.wallId && wallId) existing.wallId = wallId;
             }
        } else {
             uniqueOpenings.set(id, openingData);
        }
      });
    });

    setRows(Array.from(uniqueOpenings.values()));
  }, [rooms]);

  // --- Counts ---
  const counts = useMemo(() => {
    return {
      doors: rows.filter(r => String(r.type).toLowerCase().includes('door')).length,
      windows: rows.filter(r => String(r.type).toLowerCase().includes('window')).length,
      vents: rows.filter(r => String(r.type).toLowerCase().includes('vent')).length,
      arches: rows.filter(r => String(r.type).toLowerCase().includes('open') || String(r.type).toLowerCase().includes('arch')).length,
    };
  }, [rows]);

  // --- Handlers ---
  const handleRowChange = (id, field, value) => setRows(p => p.map(r => r.id === id ? { ...r, [field]: value } : r));
  
  const handleDelete = (id) => setRows(p => p.filter(r => r.id !== id));
  
  const handleAdd = () => {
    const defaultRoom = availableRooms.length > 0 ? availableRooms[0] : "Unknown";
    setRows([ 
      ...rows, 
      { 
        id: `new-${Date.now()}`, 
        type: "Door", 
        width: 1.0, 
        height: 2.1, 
        connectsTo: [defaultRoom], // Default: From Room A -> External
        isManual: true 
      } 
    ]);
  };

  // Handle "From -> To" Dropdown Logic
  const handleConnectionUpdate = (rowId, index, value, currentRow) => {
    let newConnects = [...currentRow.connectsTo];
    if (index === 0) {
      // Changing From Room
      newConnects[0] = value;
    } else {
      // Changing To Room
      if (value === "EXTERNAL_OPT") {
        newConnects = [newConnects[0]]; // Remove 2nd room
      } else {
        newConnects[1] = value;
      }
    }
    handleRowChange(rowId, 'connectsTo', newConnects);
  };

  const formatLocation = (rooms) => {
    if (!rooms || rooms.length === 0) return "Unknown";
    if (rooms.length > 1) return rooms.join(' ↔ ');
    return `${rooms[0]}`;
  };

  // ✅ SAVE HANDLER
  const handleStoreData = () => {
      const finalData = {
          summary: counts,
          details: rows,
          totalCount: rows.length,
          timestamp: new Date().toISOString()
      };
      
      console.log("Saving Opening Data:", finalData);
      
      if (onSaveData) {
          onSaveData(finalData);
          alert("Opening Schedule Saved Successfully!");
      }
  };

  return (
    <div className="space-y-4 mt-8">
      {/* Summary Badges */}
      <div className="flex flex-wrap gap-4">
        <SummaryBadge icon={DoorOpen} label="Total Doors" count={counts.doors} color="border-amber-200" />
        <SummaryBadge icon={AppWindow} label="Total Windows" count={counts.windows} color="border-cyan-200" />
        <SummaryBadge icon={Wind} label="Ventilators" count={counts.vents} color="border-slate-200" />
        <SummaryBadge icon={Maximize} label="Open Arches" count={counts.arches} color="border-indigo-200" />
      </div>

      {/* Editor Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-blue-600" /> Detailed Opening Schedule
          </h3>
          <button onClick={handleAdd} className="bg-blue-600 text-white text-xs px-3 py-2 rounded hover:bg-blue-700 flex items-center gap-1 font-semibold">
            <Plus size={14} /> Add New Entry
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-xs">
              <tr>
                <th className="px-4 py-3 w-5/12">Location (From ↔ To)</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-center">Width (m)</th>
                <th className="px-4 py-3 text-center">Height (m)</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    
                    {/* Location Column */}
                    <td className="px-4 py-2 font-medium text-slate-700">
                      {row.isManual ? (
                        <div className="flex items-center gap-2">
                          {/* FROM */}
                          <select 
                            className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 w-32 focus:ring-2 focus:ring-blue-100 outline-none text-xs"
                            value={row.connectsTo[0] || ""}
                            onChange={(e) => handleConnectionUpdate(row.id, 0, e.target.value, row)}
                          >
                             {availableRooms.map((name, i) => <option key={i} value={name}>{name}</option>)}
                          </select>
                          
                          <ArrowRight size={14} className="text-slate-400" />
                          
                          {/* TO */}
                          <select 
                            className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 w-32 focus:ring-2 focus:ring-blue-100 outline-none text-xs"
                            value={row.connectsTo[1] || "EXTERNAL_OPT"}
                            onChange={(e) => handleConnectionUpdate(row.id, 1, e.target.value, row)}
                          >
                             <option value="EXTERNAL_OPT">External (Outside)</option>
                             {availableRooms.filter(r => r !== row.connectsTo[0]).map((name, i) => <option key={i} value={name}>{name}</option>)}
                          </select>
                        </div>
                      ) : (
                        // READ ONLY DISPLAY
                        <span className="flex items-center gap-2">
                           <span className={`w-2 h-2 rounded-full ${row.connectsTo.length > 1 ? 'bg-green-400' : 'bg-orange-300'}`}></span>
                           {formatLocation(row.connectsTo)}
                        </span>
                      )}
                    </td>

                    {/* Type Selector */}
                    <td className="px-4 py-2">
                       <select className="bg-transparent border border-slate-200 rounded px-2 py-1 text-slate-600 text-xs focus:ring-2 focus:ring-blue-100 outline-none" value={row.type} onChange={(e) => handleRowChange(row.id, 'type', e.target.value)}>
                         <option value="Door">Door</option>
                         <option value="Window">Window</option>
                         <option value="Ventilator">Ventilator</option>
                         <option value="Open Arch">Open Arch</option>
                       </select>
                    </td>

                    {/* Dims */}
                    <td className="px-4 py-2 text-center">
                      <input type="number" step="0.01" className="w-16 text-center border rounded px-1 py-1 text-slate-700 focus:border-blue-500 outline-none" value={row.width} onChange={(e) => handleRowChange(row.id, 'width', parseFloat(e.target.value))} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input type="number" step="0.01" className="w-16 text-center border rounded px-1 py-1 text-slate-700 focus:border-blue-500 outline-none" value={row.height} onChange={(e) => handleRowChange(row.id, 'height', parseFloat(e.target.value))} />
                    </td>

                    {/* Delete */}
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleDelete(row.id)} className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors" title="Delete Opening">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="5" className="text-center py-8 text-slate-400 italic">No openings detected. Click 'Add New Entry' to start manually.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t text-xs text-slate-500 flex justify-between items-center">
          <div className="flex gap-4">
             <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-300"></span> External / Single Room</span>
             <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400"></span> Internal Connection</span>
          </div>
          
          {/* STORE BUTTON */}
          <button 
             onClick={handleStoreData}
             className="text-white bg-emerald-600 hover:bg-emerald-700 font-bold px-4 py-2 rounded shadow transition-colors flex items-center gap-2"
          >
             <CheckCircle2 size={16} /> Store Opening Data
          </button>
        </div>
      </div>
    </div>
  );
}