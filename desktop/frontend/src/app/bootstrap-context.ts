import { createContext, useContext } from 'react';
import type { Bootstrap } from '@/shared/contracts';

export const bootstrapKey = ['app', 'bootstrap'] as const;
export const BootstrapContext = createContext<Bootstrap | null>(null);
export function useBootstrap() {
  const value = useContext(BootstrapContext);
  if (!value) throw new Error('Application is not ready');
  return value;
}
