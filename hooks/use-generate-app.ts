import { useCallback, useState } from 'react';

import {
  generateApp,
  type GenerateAppResponse,
} from '@/lib/api';

export interface UseGenerateAppReturn {
  result: GenerateAppResponse | null;
  loading: boolean;
  error: Error | null;
  runGenerateApp: (description: string, framework?: string) => Promise<void>;
  reset: () => void;
}

export function useGenerateApp(): UseGenerateAppReturn {
  const [result, setResult] = useState<GenerateAppResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const runGenerateApp = useCallback(
    async (description: string, framework?: string) => {
      const trimmed = description.trim();
      if (!trimmed) {
        const err = new Error('description is required');
        setError(err);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await generateApp({
          description: trimmed,
          framework: framework?.trim() || undefined,
        });
        setResult(res);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error('Failed to generate app'),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    result,
    loading,
    error,
    runGenerateApp,
    reset,
  };
}

