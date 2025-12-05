import React from 'react';
import WizardStep from './WizardStep';

const WizardSteps = ({ step }) => (
  <div className="flex gap-4">
    <WizardStep number={1} title="Client Info" active={step===1} completed={step>1} />
    <WizardStep number={2} title="Upload" active={step===2} completed={step>2} />
    <WizardStep number={3} title="Report" active={step===3} completed={step>3} />
  </div>
);

export default WizardSteps;
