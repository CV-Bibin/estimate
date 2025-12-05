import React from 'react';
import { CheckCircle, ArrowRight } from 'lucide-react';

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

export default WizardStep;
