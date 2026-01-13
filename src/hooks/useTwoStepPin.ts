import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TwoStepStatus {
  enabled: boolean;
  locked: boolean;
}

interface VerifyResult {
  valid: boolean;
  remainingAttempts?: number;
  locked?: boolean;
  error?: string;
}

export const useTwoStepPin = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const callTwoStepFunction = async (action: string, data: Record<string, unknown> = {}) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      const response = await supabase.functions.invoke('two-step-pin', {
        body: { action, ...data },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to process request');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const enableTwoStep = async (pin: string): Promise<boolean> => {
    try {
      await callTwoStepFunction('enable', { pin });
      return true;
    } catch {
      return false;
    }
  };

  const verifyPin = async (pin: string): Promise<VerifyResult> => {
    try {
      const result = await callTwoStepFunction('verify', { pin });
      return { valid: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      return { 
        valid: false, 
        error: message,
        remainingAttempts: 0,
        locked: message.includes('locked')
      };
    }
  };

  const changePin = async (currentPin: string, newPin: string): Promise<boolean> => {
    try {
      await callTwoStepFunction('change', { pin: currentPin, newPin });
      return true;
    } catch {
      return false;
    }
  };

  const disableTwoStep = async (pin: string): Promise<boolean> => {
    try {
      await callTwoStepFunction('disable', { pin });
      return true;
    } catch {
      return false;
    }
  };

  const getStatus = async (): Promise<TwoStepStatus> => {
    try {
      const result = await callTwoStepFunction('status');
      return { enabled: result.enabled, locked: result.locked };
    } catch {
      return { enabled: false, locked: false };
    }
  };

  return {
    enableTwoStep,
    verifyPin,
    changePin,
    disableTwoStep,
    getStatus,
    isLoading,
    error,
    clearError,
  };
};