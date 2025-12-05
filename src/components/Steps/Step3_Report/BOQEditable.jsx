// BOQEditable.jsx
import React, { useEffect, useState } from "react";
import { Calculator } from "lucide-react";

// safe helpers
const safeNum = (val) => {
  if (val === undefined || val === null || val === "") return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};
const safeFormat = (val) => {
  const n = Number(val);
  if (!Number.isFinite(n)) return "0.000";
  return n.toFixed(3);
};

export default function BOQEditable({ data = {} }) {
  // incoming parsed objects
  const stats = data.stats || {}; // corrected_stats
  const rooms = data.rooms || []; // corrected_rooms
  const countsFromAI = data.counts || {}; // counts
  const boqRaw = data.boqRaw || {};

  // local state groups
  const [excavation, setExcavation] = useState({ length: 0, width: 1.5, depth: 1.5 });
  const [pcc, setPcc] = useState({ width: 1.0, thickness: 0.15 });
  const [footing, setFooting] = useState({ width: 0.6, thickness: 0.6, material: "RCC" });
  const [basement, setBasement] = useState({ width: 0.45, thickness: 0.45, material: "RCC" });
  const [wall, setWall] = useState({
    length: 0,
    height: 3.0,
    thickness: 0.23,
  });
  const [openings, setOpenings] = useState({
    door: { count: 0, width: 0.9, height: 2.1 },
    window: { count: 0, width: 1.2, height: 1.5 },
    vent: { count: 0, width: 0.6, height: 0.6 },
  });
  const [finishes, setFinishes] = useState({
    floorArea: 0,
    ceilingArea: 0,
    perimeter: 0,
    plasterHeight: 3.0,
  });
  const [quantities, setQuantities] = useState({});

  // -------------- Sync incoming AI data into form state --------------
  useEffect(() => {
    // pluck common stats if present
    const wallLengthFromStats = safeNum(stats.wall_length ?? stats.wall_perimeter ?? boqRaw.total_wall_length ?? 0);
    const wallHeightFromStats = safeNum(stats.wall_height ?? 3.0);
    const wallThicknessFromStats = safeNum(stats.wall_thickness ?? 0.23);

    setWall((w) => ({ ...w, length: wallLengthFromStats, height: wallHeightFromStats, thickness: wallThicknessFromStats }));

    // excavation length: if AI provides excavation_length, use it; otherwise use wall length as fallback
    const excavationLen = safeNum(stats.excavation_length ?? wallLengthFromStats ?? boqRaw.total_wall_length ?? 0);
    setExcavation((e) => ({ ...e, length: excavationLen }));

    // finishes (areas)
    const carpet = safeNum(stats.carpet_area ?? boqRaw.carpet_area ?? 0);
    const plinth = safeNum(stats.plinth_area ?? boqRaw.slab_area ?? 0);
    const ceiling = safeNum(stats.ceiling_area ?? carpet);
    const perimeter = safeNum(stats.room_perimeter ?? boqRaw.room_perimeter ?? 0);

    setFinishes((f) => ({ ...f, floorArea: carpet, ceilingArea: ceiling, perimeter, plasterHeight: safeNum(stats.plaster_height ?? f.plasterHeight) }));

    // openings: start with AI counts
    const aiDoors = safeNum(countsFromAI.doors ?? 0);
    const aiWindows = safeNum(countsFromAI.windows ?? 0);
    const aiVents = safeNum(countsFromAI.ventilators ?? countsFromAI.vents ?? 0);

    // attempt to extract sizes from rooms.openings_attached
    let doors = aiDoors;
    let windows = aiWindows;
    let vents = aiVents;

    let doorWidth = 0.9, doorHeight = 2.1;
    let windowWidth = 1.2, windowHeight = 1.5;
    let ventWidth = 0.6, ventHeight = 0.6;

    rooms.forEach((room) => {
      (room.openings_attached || []).forEach((o) => {
        // o is like "Door (0.9m)" or "Window (1.2m)"
        const text = String(o || "");
        const m = text.match(/\(([\d.]+)\s*m\)/i);
        const size = m ? safeNum(m[1]) : null;

        if (/door/i.test(text)) {
          doors += 1;
          if (size) doorWidth = size;
        } else if (/window/i.test(text)) {
          windows += 1;
          if (size) windowWidth = size;
        } else if (/vent/i.test(text)) {
          vents += 1;
          if (size) {
            ventWidth = size;
            ventHeight = size; // assume square
          }
        }
      });
    });

    setOpenings({
      door: { count: doors, width: doorWidth, height: doorHeight },
      window: { count: windows, width: windowWidth, height: windowHeight },
      vent: { count: vents, width: ventWidth, height: ventHeight },
    });

    // default other dims from stats if present
    setPcc((p) => ({ ...p, width: safeNum(stats.pcc_width ?? p.width), thickness: safeNum(stats.pcc_thickness ?? p.thickness) }));
    setFooting((f) => ({ ...f, width: safeNum(stats.footing_width ?? f.width), thickness: safeNum(stats.footing_thickness ?? f.thickness), material: stats.footing_material ?? f.material }));
    setBasement((b) => ({ ...b, width: safeNum(stats.basement_width ?? b.width), thickness: safeNum(stats.basement_thickness ?? b.thickness), material: stats.basement_material ?? b.material }));
  }, [data, stats, rooms, countsFromAI, boqRaw]);

  // -------------- Calculations --------------
  useEffect(() => {
    // volumes
    const excavationVol = excavation.length * excavation.width * excavation.depth;
    const pccVol = excavation.length * pcc.width * pcc.thickness;
    const footingVol = excavation.length * footing.width * footing.thickness;
    const basementVol = excavation.length * basement.width * basement.thickness;

    // openings area
    const doorArea = openings.door.count * openings.door.width * openings.door.height;
    const windowArea = openings.window.count * openings.window.width * openings.window.height;
    const ventArea = openings.vent.count * openings.vent.width * openings.vent.height;
    const totalOpeningArea = doorArea + windowArea + ventArea;
    const totalOpeningVolume = totalOpeningArea * wall.thickness;

    // brickwork
    const grossWallVol = wall.length * wall.height * wall.thickness;
    const netBrickworkVol = Math.max(0, grossWallVol - totalOpeningVolume);

    // plaster: perimeter * plaster height minus openings area + ceiling area
    const wallPlasterGross = finishes.perimeter * finishes.plasterHeight;
    const netWallPlasterArea = Math.max(0, wallPlasterGross - totalOpeningArea);
    const totalPlaster = netWallPlasterArea + finishes.ceilingArea;

    // flooring uses floorArea (carpet), fallback to plinth area or boqRaw.carpet_area
    const flooringArea = finishes.floorArea || safeNum(stats.carpet_area ?? boqRaw.carpet_area ?? 0);

    setQuantities({
      excavation: excavationVol,
      pcc: pccVol,
      footing: footingVol,
      basement: basementVol,
      brickwork: netBrickworkVol,
      plaster: totalPlaster,
      flooring: flooringArea,
      totalOpeningArea,
      doorArea,
      windowArea,
      ventArea,
      grossWallVol,
      netWallPlasterArea,
    });
  }, [excavation, pcc, footing, basement, wall, openings, finishes, stats, boqRaw]);

  // ---------- small UI helpers ----------
  const InputField = ({ label, val, setVal, field, step = 0.01 }) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase font-bold text-slate-400">{label}</label>
      <input
        type="number"
        step={step}
        value={val[field] !== undefined ? val[field] : ""}
        onChange={(e) => setVal({ ...val, [field]: safeNum(e.target.value) })}
        className="border border-slate-300 rounded px-2 py-1.5 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none w-full"
      />
    </div>
  );

  const ResultCard = ({ label, value, unit }) => (
    <div className={`p-3 rounded-lg border bg-blue-50/40 border-blue-200 flex justify-between items-center`}>
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className="text-lg font-bold text-slate-800">
        {safeFormat(value)} <small className="text-xs font-normal text-slate-500">{unit}</small>
      </span>
    </div>
  );

  // ---------- Render ----------
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-blue-600" /> Interactive BOQ
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* LEFT: Excavation + PCC + Footing */}
        <div>
          <h3 className="font-bold text-slate-700 mb-2">Substructure (Foundation)</h3>

          <div className="bg-slate-50 p-4 rounded-lg border mb-4">
            <h4 className="font-bold text-sm mb-2">Earthwork Excavation</h4>
            <div className="grid grid-cols-3 gap-2">
              <InputField label="Length" val={excavation} setVal={setExcavation} field="length" />
              <InputField label="Width" val={excavation} setVal={setExcavation} field="width" />
              <InputField label="Depth" val={excavation} setVal={setExcavation} field="depth" />
            </div>
            <div className="mt-2 text-right text-xs font-mono text-blue-600">
              Vol: {safeFormat(excavation.length * excavation.width * excavation.depth)} m³
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border">
              <h4 className="font-bold text-sm mb-2">PCC</h4>
              <InputField label="Width" val={pcc} setVal={setPcc} field="width" />
              <InputField label="Thickness" val={pcc} setVal={setPcc} field="thickness" />
              <div className="mt-2 text-right text-xs">Vol: {safeFormat(excavation.length * pcc.width * pcc.thickness)} m³</div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-sm">Footing</h4>
                <span className="text-[10px] bg-blue-100 text-blue-800 px-1 rounded">{footing.material}</span>
              </div>
              <InputField label="Width" val={footing} setVal={setFooting} field="width" />
              <InputField label="Thickness" val={footing} setVal={setFooting} field="thickness" />
              <div className="mt-2 text-right text-xs">Vol: {safeFormat(excavation.length * footing.width * footing.thickness)} m³</div>
            </div>
          </div>
        </div>

        {/* RIGHT: Wall + Openings */}
        <div>
          <h3 className="font-bold text-slate-700 mb-2">Superstructure & Finishes</h3>

          <div className="bg-orange-50/50 p-4 rounded-lg border mb-4">
            <h4 className="font-bold text-sm text-orange-800 mb-2">Wall Dimensions</h4>
            <div className="grid grid-cols-3 gap-2">
              <InputField label="Length" val={wall} setVal={setWall} field="length" />
              <InputField label="Height" val={wall} setVal={setWall} field="height" />
              <InputField label="Thickness" val={wall} setVal={setWall} field="thickness" />
            </div>
            <div className="mt-2 text-right text-xs">Gross wall volume: {safeFormat(wall.length * wall.height * wall.thickness)} m³</div>
          </div>

          <div className="bg-white p-3 rounded-lg border">
            <h4 className="font-bold text-sm mb-2">Openings (from AI)</h4>
            <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500 border-b pb-1 mb-2">
              <span>Count</span>
              <span>Width (m)</span>
              <span>Height (m)</span>
            </div>

            {["door", "window", "vent"].map((type) => (
              <div key={type} className="grid grid-cols-3 gap-2 mb-2 items-center">
                <input
                  type="number"
                  className="w-full border rounded py-1 text-center text-sm"
                  value={openings[type].count}
                  onChange={(e) =>
                    setOpenings({
                      ...openings,
                      [type]: { ...openings[type], count: safeNum(e.target.value) },
                    })
                  }
                />
                <input
                  type="number"
                  className="w-full border rounded py-1 text-center text-sm"
                  value={openings[type].width}
                  onChange={(e) =>
                    setOpenings({
                      ...openings,
                      [type]: { ...openings[type], width: safeNum(e.target.value) },
                    })
                  }
                />
                <input
                  type="number"
                  className="w-full border rounded py-1 text-center text-sm"
                  value={openings[type].height}
                  onChange={(e) =>
                    setOpenings({
                      ...openings,
                      [type]: { ...openings[type], height: safeNum(e.target.value) },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="mt-8 pt-6 border-t border-slate-200">
        <h3 className="font-bold text-lg mb-4">Calculated Bill of Quantities</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <ResultCard label="Excavation" value={quantities.excavation} unit="m³" />
          <ResultCard label="PCC" value={quantities.pcc} unit="m³" />
          <ResultCard label="Footing" value={quantities.footing} unit="m³" />
          <ResultCard label="Basement" value={quantities.basement} unit="m³" />
          <ResultCard label="Brickwork (net)" value={quantities.brickwork} unit="m³" />
          <ResultCard label="Plaster (area)" value={quantities.plaster} unit="m²" />
          <ResultCard label="Flooring" value={quantities.flooring} unit="m²" />
          <ResultCard label="Total Openings Area" value={quantities.totalOpeningArea} unit="m²" />
        </div>
      </div>
    </div>
  );
}
