import React from 'react';

const DetailRow = ({ label, left, right, highlightDiff = false }) => {
  const isDiff = highlightDiff && (left != right);

  const renderValue = (val) => {
    if (val === undefined || val === null || val === '') return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    return val;
  };

  return (
    <div className="grid grid-cols-3 border-b border-slate-100 py-2 last:border-0 text-sm">
      <div className="font-medium text-slate-500 flex items-center">{label}</div>
      <div className={`font-mono ${isDiff ? 'text-orange-600 font-bold' : 'text-slate-700'}`}>
        {renderValue(left)}
      </div>
      <div className={`font-mono ${isDiff ? 'text-indigo-600 font-bold' : 'text-slate-700'}`}>
        {renderValue(right)}
      </div>
    </div>
  );
};

export default DetailRow;
