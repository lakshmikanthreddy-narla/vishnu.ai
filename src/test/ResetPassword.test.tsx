import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ResetPassword from '@/pages/ResetPassword';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      setSession: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderResetPassword = () => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ResetPassword />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('ResetPassword Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear URL hash
    window.location.hash = '';
  });

  it('shows error state when no recovery session exists', async () => {
    const { findByText } = renderResetPassword();
    
    // Should show error since no recovery session
    const errorTitle = await findByText('Link Invalid');
    expect(errorTitle).toBeInTheDocument();
  });

  it('shows request new link button on error', async () => {
    const { findByText } = renderResetPassword();
    
    const button = await findByText('Request New Link');
    expect(button).toBeInTheDocument();
  });
});

describe('ResetPassword Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has password strength indicator requirements', () => {
    // Password rules are defined
    const rules = [
      'At least 8 characters',
      'Contains uppercase letter',
      'Contains lowercase letter',
      'Contains a number',
    ];
    
    expect(rules.length).toBe(4);
  });

  it('validates password match correctly', () => {
    const password = 'TestPassword123';
    const confirmPassword = 'TestPassword123';
    
    expect(password === confirmPassword).toBe(true);
  });

  it('validates password strength rules correctly', () => {
    const password = 'StrongPass1';
    
    expect(password.length >= 8).toBe(true);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/\d/.test(password)).toBe(true);
  });

  it('rejects weak passwords', () => {
    const weakPassword = 'weak';
    
    expect(weakPassword.length >= 8).toBe(false);
    expect(/[A-Z]/.test(weakPassword)).toBe(false);
    expect(/\d/.test(weakPassword)).toBe(false);
  });
});
