import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockResetPassword = vi.fn();
const mockGetSession = vi.fn();
const mockVerifyOtp = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: () => mockSignOut(),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPassword(...args),
      getSession: () => mockGetSession(),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('useAuth Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  describe('signIn', () => {
    it('calls supabase signInWithPassword', async () => {
      mockSignIn.mockResolvedValueOnce({ data: {}, error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signIn('test@example.com', 'password');
      });

      expect(mockSignIn).toHaveBeenCalledWith({ email: 'test@example.com', password: 'password' });
    });

    it('returns error on invalid credentials', async () => {
      mockSignIn.mockResolvedValueOnce({ 
        data: {}, 
        error: { message: 'Invalid login credentials' } 
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let response: { error: Error | null };
      await act(async () => {
        response = await result.current.signIn('test@example.com', 'wrongpassword');
      });

      expect(response!.error?.message).toBe('Invalid login credentials');
    });

    it('verifies session after successful login', async () => {
      mockSignIn.mockResolvedValueOnce({ 
        data: { session: { access_token: 'test-token' } }, 
        error: null 
      });
      mockGetSession.mockResolvedValueOnce({ 
        data: { session: { access_token: 'test-token' } } 
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signIn('test@example.com', 'password');
      });

      expect(mockGetSession).toHaveBeenCalled();
    });
  });

  describe('signUp', () => {
    it('calls supabase signUp with correct options', async () => {
      mockSignUp.mockResolvedValueOnce({ data: {}, error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signUp('new@example.com', 'password', 'John');
      });

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          password: 'password',
          options: expect.objectContaining({
            data: { full_name: 'John' },
          }),
        })
      );
    });

    it('handles already registered error', async () => {
      mockSignUp.mockResolvedValueOnce({ 
        data: {}, 
        error: { message: 'User already registered' } 
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let response: { error: Error | null };
      await act(async () => {
        response = await result.current.signUp('existing@example.com', 'password');
      });

      expect(response!.error?.message).toBe('User already registered');
    });
  });

  describe('resetPassword', () => {
    it('calls supabase resetPasswordForEmail', async () => {
      mockResetPassword.mockResolvedValueOnce({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.resetPassword('test@example.com');
      });

      expect(mockResetPassword).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          redirectTo: expect.stringContaining('/auth?mode=reset-password'),
        })
      );
    });

    it('returns success even for non-existent email (security)', async () => {
      mockResetPassword.mockResolvedValueOnce({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let response: { error: Error | null };
      await act(async () => {
        response = await result.current.resetPassword('nonexistent@example.com');
      });

      expect(response!.error).toBeNull();
    });
  });

  describe('verifyOtp', () => {
    it('calls supabase verifyOtp with recovery type', async () => {
      mockVerifyOtp.mockResolvedValueOnce({ 
        data: { user: { id: 'user-123' }, session: {} }, 
        error: null 
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.verifyOtp('test@example.com', '123456');
      });

      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        token: '123456',
        type: 'recovery',
      });
    });

    it('returns error for invalid OTP', async () => {
      mockVerifyOtp.mockResolvedValueOnce({ 
        data: {}, 
        error: { message: 'Token has expired or is invalid' } 
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let response: { error: Error | null };
      await act(async () => {
        response = await result.current.verifyOtp('test@example.com', '000000');
      });

      expect(response!.error?.message).toBe('Token has expired or is invalid');
    });

    it('returns error for expired OTP', async () => {
      mockVerifyOtp.mockResolvedValueOnce({ 
        data: {}, 
        error: { message: 'Token has expired or is invalid' } 
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let response: { error: Error | null };
      await act(async () => {
        response = await result.current.verifyOtp('test@example.com', '123456');
      });

      expect(response!.error?.message).toBe('Token has expired or is invalid');
    });
  });

  describe('updatePassword', () => {
    it('calls supabase updateUser with new password', async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.updatePassword('newSecurePassword123');
      });

      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: 'newSecurePassword123',
      });
    });

    it('returns error on password update failure', async () => {
      mockUpdateUser.mockResolvedValueOnce({ 
        error: { message: 'Password too weak' } 
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let response: { error: Error | null };
      await act(async () => {
        response = await result.current.updatePassword('weak');
      });

      expect(response!.error?.message).toBe('Password too weak');
    });
  });

  describe('signOut', () => {
    it('calls supabase signOut', async () => {
      mockSignOut.mockResolvedValueOnce({});

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
