import React, { useMemo, useState } from 'react';
import { 
  FileText, Brain, Ruler, Maximize, 
  LayoutDashboard, Home, DoorOpen, AppWindow,
  CheckCircle2, Trash2, Layers 
} from 'lucide-react';
import BOQEditable from "./BOQEditable";
import OpeningEditor from "./OpeningEditor";
import StairCalculator from "./StairCalculator"; 

// --- Helper Components ---
const StatCard = ({ label, value, unit, icon: Icon, color }) => (
  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
    <div>
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>
        {value !== undefined && value !== null ? value : 0} <span className="text-sm font-medium text-slate-500">{unit}</span>
      </div>
    </div>
    {Icon && <div className={`p-3 rounded-full bg-slate-50 ${color.replace('text-', 'text-opacity-80 text-')}`}><Icon size={24} /></div>}
  </div>
);

const RoomCard = ({ room, perimeter }) => {
  const openings = Array.isArray(room?.openings_attached) ? room.openings_attached : [];
  
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-bold text-slate-800 flex items-center gap-2">
          <Home className="w-4 h-4 text-blue-500" /> 
          {room?.name || "Unknown Room"}
        </h4>
        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
          {room?.area || 0} m²
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mb-3 border-b border-slate-200 pb-2">
        <div><span className="font-semibold">Dims:</span> {room?.dims || '-'}</div>
        <div><span className="font-semibold">Perimeter:</span> {perimeter || '-'} m</div>
      </div>

      <div>
        <span className="text-[10px] uppercase font-bold text-slate-400">Openings (AI Detected)</span>
        <div className="flex flex-wrap gap-2 mt-1">
          {openings.length > 0 ? (
             openings.map((op, idx) => {
               // Handle both String (AI) and Object (CAD) formats for display
               let label = typeof op === 'string' ? op : `${op.type} (${op.width}m)`;
               let type = typeof op === 'string' ? op : op.type;
               
               const isDoor = String(type).toLowerCase().includes('door');
               const style = isDoor ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-cyan-50 text-cyan-700 border-cyan-200";
               
               return (
                 <span key={idx} className={`text-xs px-2 py-1 rounded border ${style} flex items-center gap-1`}>
                   {isDoor ? <DoorOpen size={10} /> : <AppWindow size={10} />}
                   {label}
                 </span>
               )
             })
          ) : (
            <span className="text-xs italic text-slate-400">None detected</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default function Step3_Report({ data, clientName, floors }) {
  if (!data) return <div className="p-10 text-center text-slate-400">Loading Analysis Data...</div>;

  // --- 1. STATES ---
  const [stairList, setStairList] = useState([]); 
  const [openingData, setOpeningData] = useState(null);

  // --- 2. DATA SOURCES ---
  const cadBoq = data.boq || {};
  const cadRooms = Array.isArray(data.rooms) ? data.rooms : [];
  const aiStats = data.ai_analysis?.corrected_stats || {};
  const aiRooms = Array.isArray(data.ai_analysis?.corrected_rooms) ? data.ai_analysis.corrected_rooms : [];
  const aiCounts = aiStats.counts || {};

  // --- 3. SMART MERGE ---
  const mergedRooms = useMemo(() => {
    // Fallback logic
    if (aiRooms.length === 0 && cadRooms.length > 0) return cadRooms.map(r => ({...r, perimeter: r.perimeter || 0}));
    
    return aiRooms.map((aiRoom, index) => {
      if (!aiRoom) return { name: "Error Room", area: 0, perimeter: 0, openings_attached: [] };

      const matchingCadRoom = cadRooms.find(r => 
        r && Math.abs((parseFloat(r.area) || 0) - (parseFloat(aiRoom.area) || 0)) < 1.0
      ) || cadRooms[index];

      const hydratedOpenings = (aiRoom.openings_attached || []).map(aiOp => {
         if (typeof aiOp === 'string' && matchingCadRoom) {
             const match = aiOp.match(/([a-zA-Z]+)\s*\((\d+\.?\d*)m\)/);
             if (match) {
                 const aiType = match[1];
                 const aiWidth = parseFloat(match[2]);
                 const richMatch = matchingCadRoom.openings_attached?.find(cadOp => 
                     typeof cadOp === 'object' && 
                     cadOp.type === aiType && 
                     Math.abs(cadOp.width - aiWidth) < 0.1
                 );
                 if (richMatch) return richMatch; 
             }
         }
         return aiOp; 
      });

      return {
        ...aiRoom,
        perimeter: matchingCadRoom?.perimeter || 0,
        openings_attached: hydratedOpenings 
      };
    });
  }, [aiRooms, cadRooms]);

  // --- 4. BOQ DATA PREP ---
  const boqInitialData = useMemo(() => {
    return {
      excavationWallLength: cadBoq.total_wall_length || 0,
      externalWallLength: cadBoq.external_wall_length || 0,
      internalWallLength: cadBoq.internal_wall_length || 0,
      flooringArea: cadBoq.carpet_area || 0,
      ceilingArea: cadBoq.carpet_area || 0,
      roomPerimeter: cadBoq.room_perimeter || 0,
      
      doorCount: aiCounts.doors || 0,
      windowCount: aiCounts.windows || 0,
      ventCount: aiCounts.ventilators || 0,
      
      wallHeight: 3.0, wallThickness: 0.23, doorWidth: 1.0, windowWidth: 1.5, ventWidth: 0.6,
      excavationWidth: 1.5, excavationDepth: 1.5,
      pccWidth: 1.0, pccThickness: 0.15,
      footingWidth: 0.6, footingThickness: 0.6,
      basementWidth: 0.45, basementThickness: 0.45,
      plasterHeight: 3.0
    };
  }, [data]);

  // --- 5. HANDLERS ---
  
  const handleStairSave = (designData) => {
      const newStair = {
          ...designData,
          id: Date.now(), 
          name: `Staircase #${stairList.length + 1}`
      };
      setStairList(prev => [...prev, newStair]);
  };

  const handleRemoveStair = (id) => {
      setStairList(prev => prev.filter(s => s.id !== id));
  };

  const handleOpeningSave = (dataObj) => {
      setOpeningData(dataObj);
      console.log("Final Opening Data:", dataObj);
  };

  // --- 6. AGGREGATE STAIRS ---
  const aggregatedStairData = useMemo(() => {
      if (stairList.length === 0) return null;
      return stairList.reduce((acc, curr) => ({
          quantities: {
              concreteVol: (acc.quantities?.concreteVol || 0) + (curr.quantities?.concreteVol || 0),
              steelWeight: (acc.quantities?.steelWeight || 0) + (curr.quantities?.steelWeight || 0),
              shutteringArea: (acc.quantities?.shutteringArea || 0) + (curr.quantities?.shutteringArea || 0),
              finishingArea: (acc.quantities?.finishingArea || 0) + (curr.quantities?.finishingArea || 0),
              handrailLen: (acc.quantities?.handrailLen || 0) + (curr.quantities?.handrailLen || 0),
          }
      }), { quantities: {} });
  }, [stairList]);

  return (
    <div className="space-y-8 animate-in fade-in pb-20">
      
      {/* HEADER */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
        <div>
          <div className="text-xs text-slate-400 uppercase font-bold">Project Name</div>
          <div className="text-xl font-bold text-slate-800">{clientName || 'Unnamed Project'}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400 uppercase font-bold">Floors</div>
          <div className="text-xl font-bold text-slate-800">{floors}</div>
        </div>
      </div>

      {/* METRICS */}
      <div>
        <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
          <LayoutDashboard className="text-blue-600" /> Project Metrics (CAD Extracted)
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Plinth Area" value={cadBoq.slab_area} unit="m²" icon={Maximize} color="text-indigo-600" />
          <StatCard label="Carpet Area" value={cadBoq.carpet_area} unit="m²" icon={Ruler} color="text-emerald-600" />
          <StatCard label="Ext. Wall Length" value={cadBoq.external_wall_length} unit="m" icon={FileText} color="text-orange-600" />
          <StatCard label="Int. Wall Length" value={cadBoq.internal_wall_length} unit="m" icon={FileText} color="text-blue-600" />
        </div>
      </div>

      {/* ROOMS */}
      <div>
        <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
          <Home className="text-blue-600" /> Room Details (AI Enhanced)
        </h3>
        {mergedRooms.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mergedRooms.map((room, idx) => (
              <RoomCard key={idx} room={room} perimeter={room.perimeter} />
            ))}
          </div>
        ) : (
          <div className="p-6 border border-dashed rounded-xl text-center text-slate-400 italic">
            No room data available.
          </div>
        )}
      </div>

      {/* AI NOTE */}
      {data.ai_analysis?.visual_notes && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg text-sm text-yellow-800 flex gap-3 items-start">
          <Brain className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <strong>AI Observation:</strong> {data.ai_analysis.visual_notes}
          </div>
        </div>
      )}

      {/* OPENING EDITOR */}
      <OpeningEditor rooms={mergedRooms} onSaveData={handleOpeningSave} />

      {/* OPENING SAVED UI */}
      {openingData && (
        <div className="mt-4 mx-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3 animate-in fade-in">
           <CheckCircle2 className="text-blue-600" size={20} />
           <div className="text-sm text-blue-800">
              <strong>Openings Finalized:</strong> {openingData.totalCount} items stored. 
              <span className="ml-2 text-blue-600 text-xs">
                (Doors: <strong>{openingData.summary.doors}</strong>, 
                 Windows: <strong>{openingData.summary.windows}</strong>, 
                 Vents: <strong>{openingData.summary.vents}</strong>
                 {openingData.summary.arches > 0 && <>, Arches: <strong>{openingData.summary.arches}</strong></>}
                )
              </span>
           </div>
        </div>
      )}

      {/* STAIRCASE DESIGNER */}
      <div className="relative py-4 mt-8">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-300"></div>
        </div>
        <div className="relative flex justify-center">
          <span className="px-3 bg-slate-50 text-lg font-medium text-slate-900">
            Staircase Designer
          </span>
        </div>
      </div>

      <StairCalculator onSave={handleStairSave} />

      {/* STAIR LIST */}
      {stairList.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4 mt-4">
           {stairList.map((stair) => (
             <div key={stair.id} className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center shadow-sm animate-in slide-in-from-bottom-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-full text-emerald-600">
                     <Layers size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-800 text-sm uppercase">{stair.name} ({stair.type})</h4>
                    <p className="text-xs text-emerald-600 font-medium mt-0.5">
                      Steps: {stair.totalSteps} • Concrete: {(stair.quantities?.concreteVol || 0).toFixed(2)} m³
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => handleRemoveStair(stair.id)}
                  className="text-xs text-red-400 hover:text-red-600 font-bold flex items-center gap-1 px-3 py-1.5 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 size={14} /> Remove
                </button>
             </div>
           ))}
        </div>
      )}

      {/* BOQ CALCULATOR */}
      <div className="relative py-4 mt-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-300"></div>
        </div>
        <div className="relative flex justify-center">
          <span className="px-3 bg-slate-50 text-lg font-medium text-slate-900">
            Bill of Quantities
          </span>
        </div>
      </div>

      <BOQEditable data={boqInitialData} extraData={aggregatedStairData} />

    </div>
  );
}