import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApplicationProviders } from './app/providers';
import './shared/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApplicationProviders />
  </StrictMode>,
);
