import { useCallback, useEffect, useState } from 'react';

import { getHealth, type HealthResponse } from '@/lib/api';

export interface UseHealthCheckReturn {
  data: HealthResponse | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useHealthCheck(): UseHealthCheckReturn {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHealth();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch health'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}

