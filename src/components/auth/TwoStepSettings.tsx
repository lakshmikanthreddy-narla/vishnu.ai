import { useState, useEffect } from 'react';
import { useTwoStepPin } from '@/hooks/useTwoStepPin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, ShieldCheck, ShieldOff, KeyRound, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Step = 'status' | 'enable' | 'change' | 'disable';

export const TwoStepSettings = () => {
  const [step, setStep] = useState<Step>('status');
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  
  // PIN inputs
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  
  const { enableTwoStep, changePin, disableTwoStep, getStatus, isLoading, error, clearError } = useTwoStepPin();
  const { toast } = useToast();

  const loadStatus = async () => {
    setIsLoadingStatus(true);
    const status = await getStatus();
    setIsEnabled(status.enabled);
    setIsLoadingStatus(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const resetForm = () => {
    setPin('');
    setConfirmPin('');
    setCurrentPin('');
    setShowPin(false);
    clearError();
  };

  const handleEnableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (pin !== confirmPin) {
      toast({
        variant: 'destructive',
        title: 'PINs do not match',
        description: 'Please make sure both PINs are the same.',
      });
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      toast({
        variant: 'destructive',
        title: 'Invalid PIN',
        description: 'PIN must be exactly 6 digits.',
      });
      return;
    }

    const success = await enableTwoStep(pin);
    if (success) {
      toast({
        title: 'Two-Step Verification Enabled',
        description: 'Your account is now protected with a security PIN.',
      });
      setIsEnabled(true);
      setStep('status');
      resetForm();
    }
  };

  const handleChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (pin !== confirmPin) {
      toast({
        variant: 'destructive',
        title: 'PINs do not match',
        description: 'Please make sure both PINs are the same.',
      });
      return;
    }

    if (!/^\d{6}$/.test(pin) || !/^\d{6}$/.test(currentPin)) {
      toast({
        variant: 'destructive',
        title: 'Invalid PIN',
        description: 'PIN must be exactly 6 digits.',
      });
      return;
    }

    const success = await changePin(currentPin, pin);
    if (success) {
      toast({
        title: 'PIN Changed',
        description: 'Your security PIN has been updated.',
      });
      setStep('status');
      resetForm();
    }
  };

  const handleDisableSubmit = async () => {
    if (!/^\d{6}$/.test(currentPin)) {
      toast({
        variant: 'destructive',
        title: 'Invalid PIN',
        description: 'Please enter your current 6-digit PIN.',
      });
      return;
    }

    const success = await disableTwoStep(currentPin);
    if (success) {
      toast({
        title: 'Two-Step Verification Disabled',
        description: 'Your account no longer requires a security PIN.',
      });
      setIsEnabled(false);
      setShowDisableDialog(false);
      resetForm();
    } else {
      setShowDisableDialog(false);
    }
  };

  const handlePinChange = (value: string, setter: (v: string) => void) => {
    // Only allow digits, max 6
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setter(cleaned);
  };

  // Loading state
  if (isLoadingStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Enable step
  if (step === 'enable') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Create Security PIN</CardTitle>
              <CardDescription>
                Create a 6-digit PIN to protect your account (like WhatsApp)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleEnableSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-pin">6-Digit Security PIN</Label>
              <div className="relative">
                <Input
                  id="new-pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => handlePinChange(e.target.value, setPin)}
                  className="text-center text-2xl tracking-widest font-mono pr-10"
                  maxLength={6}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPin(!showPin)}
                >
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-pin">Confirm PIN</Label>
              <Input
                id="confirm-pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                placeholder="••••••"
                value={confirmPin}
                onChange={(e) => handlePinChange(e.target.value, setConfirmPin)}
                className="text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                required
              />
              {confirmPin.length > 0 && (
                <p className={`text-xs ${pin === confirmPin ? 'text-green-600' : 'text-destructive'}`}>
                  {pin === confirmPin ? '✓ PINs match' : '✗ PINs do not match'}
                </p>
              )}
            </div>

            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Remember your PIN!</strong> You'll need it every time you sign in. 
                Choose something memorable but not easy to guess.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => { setStep('status'); resetForm(); }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isLoading || pin.length !== 6 || confirmPin.length !== 6 || pin !== confirmPin}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enable
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  // Change PIN step
  if (step === 'change') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Change Security PIN</CardTitle>
              <CardDescription>
                Enter your current PIN and choose a new one
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleChangeSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-pin">Current PIN</Label>
              <div className="relative">
                <Input
                  id="current-pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  placeholder="••••••"
                  value={currentPin}
                  onChange={(e) => handlePinChange(e.target.value, setCurrentPin)}
                  className="text-center text-2xl tracking-widest font-mono pr-10"
                  maxLength={6}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPin(!showPin)}
                >
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-pin-change">New PIN</Label>
              <Input
                id="new-pin-change"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                placeholder="••••••"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value, setPin)}
                className="text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-new-pin">Confirm New PIN</Label>
              <Input
                id="confirm-new-pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                placeholder="••••••"
                value={confirmPin}
                onChange={(e) => handlePinChange(e.target.value, setConfirmPin)}
                className="text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                required
              />
              {confirmPin.length > 0 && (
                <p className={`text-xs ${pin === confirmPin ? 'text-green-600' : 'text-destructive'}`}>
                  {pin === confirmPin ? '✓ PINs match' : '✗ PINs do not match'}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => { setStep('status'); resetForm(); }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isLoading || currentPin.length !== 6 || pin.length !== 6 || confirmPin.length !== 6 || pin !== confirmPin}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change PIN
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  // Status view (default)
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {isEnabled ? (
              <ShieldCheck className="h-6 w-6 text-green-500" />
            ) : (
              <Shield className="h-6 w-6 text-muted-foreground" />
            )}
            <div>
              <CardTitle>Two-Step Verification</CardTitle>
              <CardDescription>
                {isEnabled
                  ? 'Your account is protected with a security PIN'
                  : 'Add a security PIN for extra protection (like WhatsApp)'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-200">Enabled</p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      You'll enter your PIN each time you sign in
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep('change')}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change PIN
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-destructive hover:text-destructive"
                  onClick={() => setShowDisableDialog(true)}
                >
                  <ShieldOff className="mr-2 h-4 w-4" />
                  Disable
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <ShieldOff className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">
                Add a 6-digit security PIN to protect your account.
                You'll need to enter it every time you sign in.
              </p>
              <Button onClick={() => setStep('enable')}>
                <Shield className="mr-2 h-4 w-4" />
                Enable Two-Step Verification
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disable confirmation dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Two-Step Verification?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>This will remove the security PIN from your account. Your account will be less secure.</p>
              <div className="space-y-2">
                <Label htmlFor="disable-pin">Enter your current PIN to confirm</Label>
                <Input
                  id="disable-pin"
                  type="password"
                  inputMode="numeric"
                  placeholder="••••••"
                  value={currentPin}
                  onChange={(e) => handlePinChange(e.target.value, setCurrentPin)}
                  className="text-center text-xl tracking-widest font-mono"
                  maxLength={6}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDisableDialog(false); resetForm(); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableSubmit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isLoading || currentPin.length !== 6}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};