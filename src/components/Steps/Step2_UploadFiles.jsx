import React from 'react';
import { UploadCloud, Image as ImageIcon, Loader2 } from 'lucide-react';

const Step2_UploadFiles = ({ dxfFile, setDxfFile, imgFile, setImgFile, unit, setUnit, handleAnalyze, loading, error }) => (
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
      <select value={unit} onChange={e=>setUnit(e.target.value)} className="border p-1 rounded">
        <option value="m">Meters</option>
      </select>
    </div>
    {error && <div className="text-red-600 text-center bg-red-50 p-2 rounded">{error}</div>}
    <button onClick={handleAnalyze} disabled={loading} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex justify-center gap-2">
      {loading ? <Loader2 className="animate-spin"/> : "Generate Estimate"}
    </button>
  </div>
);

export default Step2_UploadFiles;
