import React, { useState } from 'react';
import HeaderWizard from './components/Header/WizardSteps';
import Step1_ClientInfo from './components/Steps/Step1_ClientInfo';
import Step2_UploadFiles from './components/Steps/Step2_UploadFiles';
import Step3_Report from './components/Steps/Step3_Report/Step3_Report';

export default function App() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientName, setClientName] = useState('');
  const [floors, setFloors] = useState(1);
  const [dxfFile, setDxfFile] = useState(null);
  const [imgFile, setImgFile] = useState(null);
  const [unit, setUnit] = useState('m');
  const [data, setData] = useState(null);

  const nextStep = () => setStep(prev => prev + 1);

  const handleAnalyze = async () => {
    if (!dxfFile) { 
      setError("DXF file is required."); 
      return; 
    }
    setLoading(true); 
    setError('');

    const fd = new FormData();
    fd.append('file', dxfFile);
    if (imgFile) fd.append('image_file', imgFile);
    fd.append('unit', unit);

    try {
      const res = await fetch('http://127.0.0.1:5000/analyze-cad', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      
      {/* Header / Wizard Steps */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <HeaderWizard step={step} />
        </div>
      </div>

      {/* Steps Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {step === 1 && (
          <Step1_ClientInfo 
            clientName={clientName} 
            setClientName={setClientName} 
            floors={floors} 
            setFloors={setFloors} 
            nextStep={nextStep} 
          />
        )}

        {step === 2 && (
          <Step2_UploadFiles 
            dxfFile={dxfFile} 
            setDxfFile={setDxfFile} 
            imgFile={imgFile} 
            setImgFile={setImgFile} 
            unit={unit} 
            setUnit={setUnit} 
            handleAnalyze={handleAnalyze} 
            loading={loading} 
            error={error} 
          />
        )}

        {step === 3 && data && (
          <Step3_Report 
            data={data} 
            clientName={clientName} 
            floors={floors} 
          />
        )}
      </div>
    </div>
  );
}
