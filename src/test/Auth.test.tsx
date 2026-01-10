import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Auth from '@/pages/Auth';
import { AuthProvider } from '@/hooks/useAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
        }),
        listFactors: vi.fn().mockResolvedValue({ data: { totp: [] } }),
      },
    },
  },
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderAuth = () => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Auth />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Auth Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form by default', () => {
    const { getByText, getByLabelText, getByRole } = renderAuth();
    expect(getByText('Welcome back')).toBeInTheDocument();
    expect(getByLabelText('Email')).toBeInTheDocument();
    expect(getByLabelText('Password')).toBeInTheDocument();
    expect(getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('has required email field', () => {
    const { getByLabelText } = renderAuth();
    expect(getByLabelText('Email')).toHaveAttribute('required');
  });

  it('has password with minimum length', () => {
    const { getByLabelText } = renderAuth();
    expect(getByLabelText('Password')).toHaveAttribute('minLength', '6');
  });

  it('email input has correct type', () => {
    const { getByLabelText } = renderAuth();
    expect(getByLabelText('Email')).toHaveAttribute('type', 'email');
  });

  it('password input has correct type', () => {
    const { getByLabelText } = renderAuth();
    expect(getByLabelText('Password')).toHaveAttribute('type', 'password');
  });
});
