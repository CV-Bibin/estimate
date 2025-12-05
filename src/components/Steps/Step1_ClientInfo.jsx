import React from 'react';
import { User } from 'lucide-react';

const Step1_ClientInfo = ({ clientName, setClientName, floors, setFloors, nextStep }) => (
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
    <button onClick={nextStep} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold">Next Step</button>
  </div>
);

export default Step1_ClientInfo;
