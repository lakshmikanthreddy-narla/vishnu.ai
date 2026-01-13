import { useState, useEffect } from 'react';
import { useTwoStepPin } from '@/hooks/useTwoStepPin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TwoStepVerificationProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const TwoStepVerification = ({ onSuccess, onCancel }: TwoStepVerificationProps) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  
  const { verifyPin, isLoading, error, clearError } = useTwoStepPin();

  // Clear error when PIN changes
  useEffect(() => {
    if (pin.length > 0) {
      setLocalError(null);
      clearError();
    }
  }, [pin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!/^\d{6}$/.test(pin)) {
      setLocalError('Please enter your 6-digit PIN');
      return;
    }

    const result = await verifyPin(pin);
    
    if (result.valid) {
      onSuccess();
    } else {
      setPin('');
      if (result.locked) {
        setIsLocked(true);
        setLocalError(result.error || 'Account locked due to too many failed attempts.');
      } else {
        setRemainingAttempts(result.remainingAttempts ?? null);
        setLocalError(result.error || 'Incorrect PIN');
      }
    }
  };

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setPin(cleaned);
  };

  const displayError = localError || error;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-primary-foreground" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">Enter Security PIN</CardTitle>
        <CardDescription>
          Enter your 6-digit security PIN to continue
        </CardDescription>
      </CardHeader>
      <CardContent>
        {displayError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        )}

        {isLocked ? (
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-4">
              Your account has been temporarily locked due to too many failed PIN attempts.
              Please try again in 15 minutes.
            </p>
            <Button variant="outline" onClick={onCancel}>
              Go Back
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="security-pin">6-Digit PIN</Label>
              <div className="relative">
                <Input
                  id="security-pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => handlePinChange(e.target.value)}
                  className="text-center text-2xl tracking-widest font-mono pr-10"
                  maxLength={6}
                  autoFocus
                  required
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPin(!showPin)}
                  disabled={isLoading}
                >
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {remainingAttempts !== null && remainingAttempts > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {remainingAttempts} attempts remaining
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isLoading || pin.length !== 6}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
};