import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

type CodeRow = {
  code: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  usedByUserId: number | null;
};

export default function ActivationCodesPage() {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    const res = await fetch('/api/app-auth/activation-codes');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || 'failed');
      return;
    }
    setCodes(data.codes || []);
  }

  async function createOne() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/app-auth/activation-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'failed');
        return;
      }
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Activation Codes</CardTitle>
            <CardDescription>Only admin can access. Generate codes for registration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error ? <div className="text-sm text-destructive">{error}</div> : null}

            <div className="flex gap-2">
              <Button onClick={createOne} disabled={loading}>
                {loading ? 'Generating…' : 'Generate 1 code'}
              </Button>
              <Button variant="outline" onClick={refresh}>
                Refresh
              </Button>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-1 gap-0">
                {codes.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No codes yet.</div>
                ) : (
                  codes.map((c) => (
                    <div key={c.code} className="flex items-center justify-between gap-3 px-4 py-3 border-b last:border-b-0">
                      <div className="font-mono text-sm">{c.code}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.usedAt ? 'used' : 'unused'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            Tip: share a code once; it becomes single-use.
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
