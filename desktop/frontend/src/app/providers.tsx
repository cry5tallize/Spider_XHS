import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BootstrapApplication } from './bootstrap';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 }, mutations: { retry: false } },
});

export function ApplicationProviders() {
  return <QueryClientProvider client={queryClient}><BootstrapApplication /></QueryClientProvider>;
}
