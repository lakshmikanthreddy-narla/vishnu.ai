import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { OTPVerification } from '@/components/auth/OTPVerification';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    updatePassword: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('OTPVerification Component', () => {
  const mockOnSuccess = vi.fn();
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders verification code form', () => {
    const { getByText, getByLabelText } = render(
      <OTPVerification email="test@example.com" onSuccess={mockOnSuccess} onBack={mockOnBack} />
    );
    expect(getByText('Enter Verification Code')).toBeInTheDocument();
    expect(getByText('test@example.com')).toBeInTheDocument();
    expect(getByLabelText('Verification Code')).toBeInTheDocument();
  });

  it('has verify button disabled when code is empty', () => {
    const { getByRole } = render(
      <OTPVerification email="test@example.com" onSuccess={mockOnSuccess} onBack={mockOnBack} />
    );
    expect(getByRole('button', { name: /verify code/i })).toBeDisabled();
  });

  it('has back button', () => {
    const { getByText } = render(
      <OTPVerification email="test@example.com" onSuccess={mockOnSuccess} onBack={mockOnBack} />
    );
    expect(getByText('Back to forgot password')).toBeInTheDocument();
  });

  it('limits OTP input to 6 characters', () => {
    const { getByLabelText } = render(
      <OTPVerification email="test@example.com" onSuccess={mockOnSuccess} onBack={mockOnBack} />
    );
    expect(getByLabelText('Verification Code')).toHaveAttribute('maxLength', '6');
  });
});
