import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MFAVerification } from '@/components/auth/MFAVerification';

vi.mock('@/hooks/useMFA', () => ({
  useMFA: () => ({
    challengeAndVerify: vi.fn().mockResolvedValue(true),
    isLoading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('MFAVerification Component', () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders verification form', () => {
    const { getByText, getByLabelText } = render(
      <MFAVerification factorId="factor-123" onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );
    expect(getByText('Two-Factor Authentication')).toBeInTheDocument();
    expect(getByLabelText('Verification Code')).toBeInTheDocument();
  });

  it('has verify button disabled when empty', () => {
    const { getByRole } = render(
      <MFAVerification factorId="factor-123" onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );
    expect(getByRole('button', { name: /verify/i })).toBeDisabled();
  });

  it('has cancel button', () => {
    const { getByRole } = render(
      <MFAVerification factorId="factor-123" onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );
    expect(getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('limits input to 6 characters', () => {
    const { getByLabelText } = render(
      <MFAVerification factorId="factor-123" onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );
    expect(getByLabelText('Verification Code')).toHaveAttribute('maxLength', '6');
  });
});
