import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMFA } from '@/hooks/useMFA';

// Mock Supabase client
const mockEnroll = vi.fn();
const mockChallenge = vi.fn();
const mockVerify = vi.fn();
const mockUnenroll = vi.fn();
const mockListFactors = vi.fn();
const mockGetAAL = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      mfa: {
        enroll: (...args: unknown[]) => mockEnroll(...args),
        challenge: (...args: unknown[]) => mockChallenge(...args),
        verify: (...args: unknown[]) => mockVerify(...args),
        unenroll: (...args: unknown[]) => mockUnenroll(...args),
        listFactors: () => mockListFactors(),
        getAuthenticatorAssuranceLevel: () => mockGetAAL(),
      },
    },
  },
}));

describe('useMFA Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enrollMFA', () => {
    it('successfully enrolls MFA', async () => {
      const mockEnrollData = {
        id: 'factor-123',
        type: 'totp',
        totp: {
          qr_code: 'data:image/svg+xml,...',
          secret: 'ABCDEF123456',
          uri: 'otpauth://totp/...',
        },
      };

      mockEnroll.mockResolvedValueOnce({ data: mockEnrollData, error: null });

      const { result } = renderHook(() => useMFA());

      let enrollment: unknown;
      await act(async () => {
        enrollment = await result.current.enrollMFA();
      });

      expect(enrollment).toEqual(mockEnrollData);
      expect(result.current.error).toBeNull();
    });

    it('handles enrollment error', async () => {
      mockEnroll.mockResolvedValueOnce({
        data: null,
        error: { message: 'Enrollment failed' },
      });

      const { result } = renderHook(() => useMFA());

      let enrollment: unknown;
      await act(async () => {
        enrollment = await result.current.enrollMFA();
      });

      expect(enrollment).toBeNull();
      expect(result.current.error).toBe('Enrollment failed');
    });
  });

  describe('verifyMFA', () => {
    it('successfully verifies MFA', async () => {
      mockChallenge.mockResolvedValueOnce({
        data: { id: 'challenge-123' },
        error: null,
      });
      mockVerify.mockResolvedValueOnce({ error: null });

      const { result } = renderHook(() => useMFA());

      let success: boolean;
      await act(async () => {
        success = await result.current.verifyMFA('factor-123', '123456');
      });

      expect(success!).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('handles challenge error', async () => {
      mockChallenge.mockResolvedValueOnce({
        data: null,
        error: { message: 'Challenge failed' },
      });

      const { result } = renderHook(() => useMFA());

      let success: boolean;
      await act(async () => {
        success = await result.current.verifyMFA('factor-123', '123456');
      });

      expect(success!).toBe(false);
      expect(result.current.error).toBe('Challenge failed');
    });

    it('handles verification error', async () => {
      mockChallenge.mockResolvedValueOnce({
        data: { id: 'challenge-123' },
        error: null,
      });
      mockVerify.mockResolvedValueOnce({
        error: { message: 'Invalid code' },
      });

      const { result } = renderHook(() => useMFA());

      let success: boolean;
      await act(async () => {
        success = await result.current.verifyMFA('factor-123', '123456');
      });

      expect(success!).toBe(false);
      expect(result.current.error).toBe('Invalid code');
    });
  });

  describe('unenrollMFA', () => {
    it('successfully unenrolls MFA', async () => {
      mockUnenroll.mockResolvedValueOnce({ error: null });

      const { result } = renderHook(() => useMFA());

      let success: boolean;
      await act(async () => {
        success = await result.current.unenrollMFA('factor-123');
      });

      expect(success!).toBe(true);
    });

    it('handles unenroll error', async () => {
      mockUnenroll.mockResolvedValueOnce({
        error: { message: 'Cannot unenroll' },
      });

      const { result } = renderHook(() => useMFA());

      let success: boolean;
      await act(async () => {
        success = await result.current.unenrollMFA('factor-123');
      });

      expect(success!).toBe(false);
      expect(result.current.error).toBe('Cannot unenroll');
    });
  });

  describe('getMFAFactors', () => {
    it('returns list of factors', async () => {
      const mockFactors = [
        {
          id: 'factor-123',
          status: 'verified',
          factor_type: 'totp',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ];

      mockListFactors.mockResolvedValueOnce({
        data: { totp: mockFactors },
        error: null,
      });

      const { result } = renderHook(() => useMFA());

      let factors: unknown[];
      await act(async () => {
        factors = await result.current.getMFAFactors();
      });

      expect(factors!).toEqual(mockFactors);
    });

    it('returns empty array on error', async () => {
      mockListFactors.mockResolvedValueOnce({
        data: null,
        error: { message: 'Failed to list' },
      });

      const { result } = renderHook(() => useMFA());

      let factors: unknown[];
      await act(async () => {
        factors = await result.current.getMFAFactors();
      });

      expect(factors!).toEqual([]);
    });
  });

  describe('getAuthenticatorAssuranceLevel', () => {
    it('returns AAL data', async () => {
      const mockAAL = {
        currentLevel: 'aal1',
        nextLevel: 'aal2',
        currentAuthenticationMethods: [{ method: 'password' }],
      };

      mockGetAAL.mockResolvedValueOnce({ data: mockAAL, error: null });

      const { result } = renderHook(() => useMFA());

      let aal: unknown;
      await act(async () => {
        aal = await result.current.getAuthenticatorAssuranceLevel();
      });

      expect(aal).toEqual(mockAAL);
    });

    it('returns default on error', async () => {
      mockGetAAL.mockResolvedValueOnce({
        data: null,
        error: { message: 'Failed' },
      });

      const { result } = renderHook(() => useMFA());

      let aal: unknown;
      await act(async () => {
        aal = await result.current.getAuthenticatorAssuranceLevel();
      });

      expect(aal).toEqual({
        currentLevel: null,
        nextLevel: null,
        currentAuthenticationMethods: [],
      });
    });
  });

  describe('clearError', () => {
    it('clears error state', async () => {
      mockEnroll.mockResolvedValueOnce({
        data: null,
        error: { message: 'Some error' },
      });

      const { result } = renderHook(() => useMFA());

      await act(async () => {
        await result.current.enrollMFA();
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
