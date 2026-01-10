import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useMFA, MFAEnrollment as MFAEnrollmentType } from '@/hooks/useMFA';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, Copy, Check, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MFAEnrollmentProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const MFAEnrollment = ({ onSuccess, onCancel }: MFAEnrollmentProps) => {
  const [enrollment, setEnrollment] = useState<MFAEnrollmentType | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [copied, setCopied] = useState(false);
  const { enrollMFA, verifyMFA, isLoading, error, clearError } = useMFA();
  const { toast } = useToast();

  useEffect(() => {
    const startEnrollment = async () => {
      const data = await enrollMFA();
      if (data) {
        setEnrollment(data);
      }
    };
    startEnrollment();
  }, []);

  const handleCopySecret = async () => {
    if (enrollment?.totp.secret) {
      await navigator.clipboard.writeText(enrollment.totp.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!enrollment) return;

    const success = await verifyMFA(enrollment.id, verificationCode);
    if (success) {
      toast({
        title: '2FA Enabled',
        description: 'Two-factor authentication is now active on your account.',
      });
      onSuccess();
    }
  };

  if (isLoading && !enrollment) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">Set Up 2FA</CardTitle>
        <CardDescription>
          Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {enrollment && (
          <>
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <QRCodeSVG
                value={enrollment.totp.uri}
                size={180}
                level="M"
                includeMargin
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">
                Or enter this secret manually:
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-sm font-mono break-all">
                  {enrollment.totp.secret}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopySecret}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Enter verification code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-widest"
                  required
                />
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading || verificationCode.length !== 6}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & Enable
                </Button>
              </div>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
};
