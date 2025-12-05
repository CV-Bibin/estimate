import React, { useState, useEffect } from "react";
import { Ruler, Layers, ArrowUpRight, CheckCircle2, AlertTriangle, ChevronUp, ChevronDown, LayoutTemplate, ArrowUpDown, PlusCircle, CornerUpRight } from "lucide-react";

export default function StairCalculator({ onSave }) {
  const [type, setType] = useState("L-Shape"); 

  // --- 1. CONFIGURATION ---
  const [config, setConfig] = useState({
    // Vertical
    totalHeight: 3.0,       
    landingHeight: 1.5,     // For standard landings
    landing2Height: 2.0,    // For Double Landing
    
    // Dimensions
    stairWidth: 0.90,       
    treadDepth: 0.25,       
    
    // Landing / Turn Dimensions
    landingWidth: 0.90,     
    landingLength: 0.90,
    landing2Width: 0.90,    
    landing2Length: 0.90,   

    // Curved Specific
    stepsInTurn: 4,         // How many winders in the curved U-turn?

    // Manual Overrides
    manualStepCount: null,
    manualFlight2Steps: null
  });

  const [results, setResults] = useState({
    totalSteps: 0,
    riser: 0,
    flights: [],
    totalHorizontalLength: 0, 
    warnings: []
  });

  // --- 2. AUTO-DEFAULTS ---
  useEffect(() => {
    setConfig(prev => {
        let lW = prev.stairWidth;
        // U-Shape & Curved get double width space
        if (type === "U-Shape" || type === "Curved") {
            lW = prev.stairWidth * 2; 
        }
        return { 
            ...prev, 
            landingWidth: lW, 
            landing2Width: lW,
            manualFlight2Steps: null 
        };
    });
  }, [type, config.stairWidth]);

  // --- 3. CALCULATION ENGINE ---
  useEffect(() => {
    if (type === "No Staircase") return;

    let warnings = [];
    let steps = 0;
    let actualRiser = 0;
    let flightData = [];
    let totalH = 0;

    // A. Total Steps Calculation
    if (config.manualStepCount) steps = config.manualStepCount;
    else steps = Math.round(config.totalHeight / 0.150); // Target 150mm
    actualRiser = config.totalHeight / steps;

    // B. Logic per Type
    
    // --- TYPE: CURVED (U-SHAPE WITH WINDERS) ---
    if (type === "Curved") {
        // In a curved stair, the "Landing" is actually a flight of winders
        // We assume the turn happens at the mid-point visually
        const turnSteps = config.stepsInTurn || 4; // Default 4 steps in 180 deg turn
        
        // Remaining steps split between straight flights
        const remainingSteps = steps - turnSteps;
        const f1 = Math.floor(remainingSteps / 2);
        const f2 = remainingSteps - f1;

        // F1 (Straight)
        const f1Run = Math.max(0, (f1 - 1) * config.treadDepth);
        flightData.push({ type: "flight", label: "Lower Straight", steps: f1, run: f1Run });

        // The Curve (Winders)
        // Note: Run is calculated at walk-line, usually approx same as tread
        const curveRun = turnSteps * config.treadDepth; 
        flightData.push({ 
            type: "curve", 
            label: "Curved Turn", 
            steps: turnSteps, 
            run: curveRun, // Walk-line run
            height: turnSteps * actualRiser
        });

        // F2 (Straight)
        const f2Run = Math.max(0, (f2 - 1) * config.treadDepth);
        flightData.push({ type: "flight", label: "Upper Straight", steps: f2, run: f2Run });

        totalH = f1Run + (config.stairWidth * 2); // Approximation of footprint width
        
        if (f1 < 1 || f2 < 1) warnings.push("Not enough height for straight sections + curve.");
    } 
    
    // --- TYPE: DOUBLE LANDING ---
    else if (type === "Double Landing") {
        const f1 = Math.round(config.landingHeight / actualRiser);
        
        let f2 = 0;
        if (config.manualFlight2Steps !== null) {
            f2 = config.manualFlight2Steps;
        } else {
            f2 = Math.round((config.landing2Height - config.landingHeight) / actualRiser);
        }

        const f3 = steps - f1 - f2;

        const f1Run = Math.max(0, (f1 - 1) * config.treadDepth);
        flightData.push({ type: "flight", label: "First Flight", steps: f1, run: f1Run });
        
        flightData.push({ type: "landing", label: "1st Landing", level: config.landingHeight, w: config.landingWidth, l: config.landingLength });

        const f2Run = Math.max(0, (f2 - 1) * config.treadDepth);
        flightData.push({ type: "flight", label: "Middle Flight", steps: f2, run: f2Run });

        const displayL2 = config.manualFlight2Steps !== null 
            ? config.landingHeight + (f2 * actualRiser) 
            : config.landing2Height;
        
        flightData.push({ type: "landing", label: "2nd Landing", level: displayL2, w: config.landing2Width, l: config.landing2Length });

        const f3Run = Math.max(0, (f3 - 1) * config.treadDepth);
        flightData.push({ type: "flight", label: "Top Flight", steps: f3, run: f3Run });

        if (f3 < 0) warnings.push("Total height too low for 3 flights.");
        totalH = f1Run + config.landingLength; // Simplified footprint
    }
    
    // --- TYPE: STANDARD (Straight, L, U) ---
    else {
        // Standard Landing Split
        let f1 = 0, f2 = 0;
        if (type !== "Straight") {
            f1 = Math.round(config.landingHeight / actualRiser);
            f2 = steps - f1;
        } else {
            f1 = steps;
        }

        f1 = Math.max(1, f1);
        f2 = Math.max(0, f2);

        const f1Run = Math.max(0, (f1 - 1) * config.treadDepth);
        flightData.push({ type: "flight", label: "First Flight", steps: f1, run: f1Run });

        if (type !== "Straight") {
            flightData.push({ type: "landing", label: "Landing", level: config.landingHeight, w: config.landingWidth, l: config.landingLength });
        }

        if (f2 > 0) {
            const f2Run = Math.max(0, (f2 - 1) * config.treadDepth);
            flightData.push({ type: "flight", label: "Second Flight", steps: f2, run: f2Run });
        }
        totalH = f1Run + config.landingLength;
    }

    if (actualRiser > 0.185) warnings.push(`Riser is steep (${(actualRiser*1000).toFixed(0)}mm).`);

    setResults({
        totalSteps: steps,
        riser: actualRiser,
        flights: flightData,
        totalHorizontalLength: totalH,
        warnings
    });

  }, [config, type]);

  // --- HANDLERS ---
  const setVal = (field, val) => {
      const isHeightEdit = field.includes('Height');
      setConfig(prev => ({ 
          ...prev, 
          [field]: parseFloat(val) || 0,
          manualFlight2Steps: isHeightEdit ? null : prev.manualFlight2Steps 
      }));
  };

  const adjustSteps = (d) => {
      const next = results.totalSteps + d;
      if (next > 0) setConfig(prev => ({ ...prev, manualStepCount: next }));
  };

  const handleSave = () => {
      if (onSave) onSave({ type, ...config, ...results });
      else alert("Staircase design saved locally!");
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-8">
      {/* HEADER */}
      <div className="p-4 bg-slate-800 text-white flex justify-between items-center flex-wrap gap-2">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Layers className="text-blue-400" /> Stair Engineer
        </h3>
        <div className="flex bg-slate-700 rounded-lg p-1 gap-1 overflow-x-auto max-w-full">
          {["Straight", "L-Shape", "U-Shape", "Curved", "Double Landing"].map(t => (
            <button key={t} onClick={() => { setType(t); setConfig(p => ({...p, manualStepCount: null, manualFlight2Steps: null})); }} 
              className={`px-3 py-1 text-xs font-bold rounded whitespace-nowrap transition-colors ${type === t ? "bg-blue-500 text-white shadow" : "text-slate-400 hover:text-white"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-12 gap-0">
        
        {/* --- LEFT: INPUTS --- */}
        <div className="md:col-span-4 bg-slate-50 p-6 border-r border-slate-200 space-y-6 flex flex-col justify-between">
            <div>
                {/* 1. Vertical Levels */}
                <div>
                    <h4 className="section-title"><Ruler size={14}/> Vertical Levels</h4>
                    <div className="space-y-3">
                        <Input label="Floor Height (m)" value={config.totalHeight} onChange={v => setVal("totalHeight", v)} />
                        
                        {(type === "L-Shape" || type === "U-Shape" || type === "Double Landing") && (
                            <Input label="1st Landing Hgt (m)" value={config.landingHeight} onChange={v => setVal("landingHeight", v)} />
                        )}

                        {type === "Double Landing" && (
                            <Input label="2nd Landing Hgt (m)" value={config.landing2Height} onChange={v => setVal("landing2Height", v)} />
                        )}
                    </div>
                </div>

                <hr className="border-slate-200 my-4" />

                {/* 2. Flight Dims */}
                <div>
                    <h4 className="section-title"><LayoutTemplate size={14}/> Flight Dimensions</h4>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <Input label="Stair Width (m)" value={config.stairWidth} onChange={v => setVal("stairWidth", v)} />
                        <Input label="Tread Depth (m)" value={config.treadDepth} onChange={v => setVal("treadDepth", v)} />
                    </div>
                    {/* Special Input for Curved */}
                    {type === "Curved" && (
                        <div className="bg-indigo-50 p-2 rounded border border-indigo-100">
                            <label className="text-[10px] font-bold text-indigo-700 block mb-1">Steps in Turn (Winders)</label>
                            <input 
                                type="number" 
                                className="input-field border-indigo-300 text-indigo-900" 
                                value={config.stepsInTurn || 4} 
                                onChange={(e) => setVal("stepsInTurn", e.target.value)} 
                            />
                        </div>
                    )}
                </div>

                {/* 3. Landing Dims (Hidden for Curved as it has no landing) */}
                {type !== "Straight" && type !== "Curved" && (
                    <div className="bg-orange-50 p-3 rounded border border-orange-100 mt-4">
                        <h4 className="text-[10px] font-bold text-orange-700 uppercase mb-2">1st Landing (m)</h4>
                        <div className="grid grid-cols-2 gap-3 mb-2">
                            <Input label="Width" value={config.landingWidth} onChange={v => setVal("landingWidth", v)} />
                            <Input label="Length" value={config.landingLength} onChange={v => setVal("landingLength", v)} />
                        </div>

                        {type === "Double Landing" && (
                            <>
                                <div className="h-px bg-orange-200 my-2"></div>
                                <h4 className="text-[10px] font-bold text-orange-700 uppercase mb-2">2nd Landing (m)</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <Input label="Width" value={config.landing2Width} onChange={v => setVal("landing2Width", v)} />
                                    <Input label="Length" value={config.landing2Length} onChange={v => setVal("landing2Length", v)} />
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* --- RIGHT: RESULTS --- */}
        <div className="md:col-span-8 p-6 flex flex-col">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <ResultCard label="Total Steps" value={results.totalSteps} color="blue" onEdit={adjustSteps} />
            <ResultCard label="Riser Height" value={((results.riser || 0) * 1000).toFixed(0)} unit="mm" color="emerald" />
              <ResultCard label="Tread Depth" value={config.treadDepth.toFixed(2)} unit="m" color="slate" />
            </div>

            <h4 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-700">
              <ArrowUpRight className="w-4 h-4 text-blue-500" /> Engineer Breakdown
            </h4>

            <div className="border border-slate-200 rounded-lg overflow-hidden text-sm flex-grow">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b">
                    <tr>
                        <th className="px-4 py-2">Component</th>
                        <th className="px-4 py-2 text-center">Detail</th>
                        <th className="px-4 py-2 text-center">Count</th>
                        <th className="px-4 py-2 text-right">Length</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.flights.map((item, idx) => (
                        <React.Fragment key={idx}>
                            {item.type === 'flight' ? (
                                <tr>
                                    <td className="px-4 py-3 font-medium text-slate-700 flex items-center gap-2">
                                        <span className="w-5 h-5 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">F</span>
                                        {item.label}
                                    </td>
                                    <td className="px-4 py-3 text-center text-xs font-mono text-slate-600">
                                        {`Riser ${(results.riser * 1000).toFixed(0)}mm`}
                                    </td>
                                    <td className="px-4 py-3 text-center font-bold">{item.steps}</td>
                                    <td className="px-4 py-3 text-right font-mono text-xs">
                                        {(item.run || 0).toFixed(2)} m
                                    </td>
                                </tr>
                            ) : item.type === 'curve' ? (
                                // CURVED SECTION
                                <tr className="bg-indigo-50/50">
                                    <td className="px-4 py-3 font-bold text-indigo-800 flex items-center gap-2">
                                        <CornerUpRight size={14} />
                                        {item.label}
                                    </td>
                                    <td className="px-4 py-3 text-center text-xs text-indigo-600 font-medium">
                                        Winders
                                    </td>
                                    <td className="px-4 py-3 text-center font-bold text-indigo-900">{item.steps}</td>
                                    <td className="px-4 py-3 text-right font-bold text-indigo-700 font-mono">
                                        +{(item.height || 0).toFixed(2)}m H
                                    </td>
                                </tr>
                            ) : (
                                // FLAT LANDING
                                <tr className="bg-orange-50/50">
                                    <td className="px-4 py-3 font-bold text-orange-800 flex items-center gap-2">
                                        <span className="w-5 h-5 rounded bg-orange-100 text-orange-600 flex items-center justify-center text-[10px] font-bold">L</span>
                                        {item.label}
                                    </td>
                                    <td className="px-4 py-3 text-center text-xs text-orange-600 font-bold">
                                        {(item.w || 0).toFixed(2)} x {(item.l || 0).toFixed(2)} m
                                    </td>
                                    <td className="px-4 py-3 text-center text-xs text-orange-400 italic">
                                        Flat @{(item.level || 0).toFixed(2)}m
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-orange-700 font-mono">
                                        {(item.l || 0).toFixed(2)} m
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                  </tbody>
                </table>
            </div>

            <div className="mt-4">
               {results.warnings.length > 0 && results.warnings.map((w, i) => (
                  <div key={i} className="flex gap-2 items-center text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 font-medium mb-1">
                      <AlertTriangle size={14}/> {w}
                  </div>
               ))}
            </div>

            {/* SAVE BUTTON */}
            <div className="mt-6 border-t pt-4 flex justify-end">
                <button 
                    onClick={handleSave}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg shadow flex items-center gap-2 transition-colors"
                >
                    <PlusCircle size={18} />
                    Save & Add Staircase
                </button>
            </div>
        </div>
      </div>
      <style jsx>{`
        .input-field { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; font-size: 0.8rem; font-weight: 700; outline: none; background: white; }
        .input-field:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }
        .section-title { font-size: 0.75rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.25rem; }
      `}</style>
    </div>
  );
}

// Sub-components Input & ResultCard remain same as before
const Input = ({ label, value, onChange }) => (
    <div>
      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase tracking-wide">{label}</label>
      <input type="number" step="0.01" className="input-field" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
);

const ResultCard = ({ label, value, unit, color, highlight, onEdit }) => {
    const colorClasses = {
        blue: "bg-blue-50 border-blue-100 text-blue-700",
        emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
        orange: "bg-orange-50 border-orange-100 text-orange-700",
        slate: "bg-slate-50 border-slate-200 text-slate-700",
    };
    return (
        <div className={`p-3 rounded-xl border flex flex-col items-center relative group ${colorClasses[color]} ${highlight ? 'ring-2 ring-orange-200' : ''}`}>
            <div className="text-[10px] uppercase font-bold opacity-60 mb-1">{label}</div>
            <div className="text-2xl font-black">{value} <span className="text-sm font-medium opacity-60">{unit}</span></div>
            {onEdit && (
                <div className="absolute inset-0 bg-white/90 hidden group-hover:flex items-center justify-center gap-2 rounded-xl transition-all">
                    <button onClick={() => onEdit(-1)} className="p-1 rounded bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-500"><ChevronDown size={18}/></button>
                    <span className="text-xs font-bold text-slate-500">Edit</span>
                    <button onClick={() => onEdit(1)} className="p-1 rounded bg-slate-200 hover:bg-green-100 text-slate-600 hover:text-green-500"><ChevronUp size={18}/></button>
                </div>
            )}
        </div>
    );
};