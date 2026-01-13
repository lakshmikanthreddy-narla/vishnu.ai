import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { TwoStepVerification } from '@/components/auth/TwoStepVerification';

// Mock the useTwoStepPin hook
vi.mock('@/hooks/useTwoStepPin', () => ({
  useTwoStepPin: () => ({
    verifyPin: vi.fn().mockResolvedValue({ valid: true }),
    isLoading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('TwoStepVerification Component', () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders PIN entry form', () => {
    const { getByText, getByLabelText } = render(
      <TwoStepVerification onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );
    expect(getByText('Enter Security PIN')).toBeInTheDocument();
    expect(getByLabelText('6-Digit PIN')).toBeInTheDocument();
  });

  it('has verify button disabled when PIN is empty', () => {
    const { getByRole } = render(
      <TwoStepVerification onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );
    expect(getByRole('button', { name: /verify/i })).toBeDisabled();
  });

  it('has cancel button', () => {
    const { getByRole } = render(
      <TwoStepVerification onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );
    expect(getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('limits PIN input to 6 digits', () => {
    const { getByLabelText } = render(
      <TwoStepVerification onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );
    expect(getByLabelText('6-Digit PIN')).toHaveAttribute('maxLength', '6');
  });
});