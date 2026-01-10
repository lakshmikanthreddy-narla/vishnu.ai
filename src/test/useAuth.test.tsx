import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockResetPassword = vi.fn();
const mockGetSession = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: () => mockSignOut(),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPassword(...args),
      getSession: () => mockGetSession(),
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

  it('signIn calls supabase', async () => {
    mockSignIn.mockResolvedValueOnce({ data: {}, error: null });
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn('test@example.com', 'password');
    });

    expect(mockSignIn).toHaveBeenCalled();
  });

  it('signUp calls supabase', async () => {
    mockSignUp.mockResolvedValueOnce({ data: {}, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signUp('new@example.com', 'password', 'John');
    });

    expect(mockSignUp).toHaveBeenCalled();
  });

  it('resetPassword calls supabase', async () => {
    mockResetPassword.mockResolvedValueOnce({ error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.resetPassword('test@example.com');
    });

    expect(mockResetPassword).toHaveBeenCalled();
  });
});
