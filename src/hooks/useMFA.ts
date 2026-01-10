import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MFAEnrollment {
  id: string;
  type: 'totp';
  totp: {
    qr_code: string;
    secret: string;
    uri: string;
  };
}

export interface MFAFactor {
  id: string;
  friendly_name?: string;
  factor_type: 'totp';
  status: 'verified' | 'unverified';
  created_at: string;
  updated_at: string;
}

export const useMFA = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrollMFA = async (): Promise<MFAEnrollment | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App',
      });

      if (error) {
        setError(error.message);
        return null;
      }

      return data as MFAEnrollment;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyMFA = async (factorId: string, code: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) {
        setError(challengeError.message);
        return false;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });

      if (verifyError) {
        setError(verifyError.message);
        return false;
      }

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const challengeAndVerify = async (factorId: string, code: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) {
        setError(challengeError.message);
        return false;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });

      if (verifyError) {
        setError(verifyError.message);
        return false;
      }

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const unenrollMFA = async (factorId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId,
      });

      if (error) {
        setError(error.message);
        return false;
      }

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const getMFAFactors = async (): Promise<MFAFactor[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();

      if (error) {
        setError(error.message);
        return [];
      }

      return (data?.totp || []) as MFAFactor[];
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const getAuthenticatorAssuranceLevel = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) {
        return { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] };
      }
      return data;
    } catch {
      return { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] };
    }
  };

  return {
    enrollMFA,
    verifyMFA,
    challengeAndVerify,
    unenrollMFA,
    getMFAFactors,
    getAuthenticatorAssuranceLevel,
    isLoading,
    error,
    clearError: () => setError(null),
  };
};
