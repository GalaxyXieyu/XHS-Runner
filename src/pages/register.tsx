import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch('/api/app-auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, activationCode }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data?.error || 'Register failed');
      return;
    }

    router.replace('/');
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>注册</CardTitle>
          <CardDescription>需要激活码</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">邮箱</div>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">密码</div>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" required />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">激活码</div>
              <Input value={activationCode} onChange={(e) => setActivationCode(e.target.value)} required />
            </div>
            {error ? <div className="text-sm text-destructive">{error}</div> : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? '注册中…' : '注册'}
            </Button>
            <div className="text-sm text-muted-foreground">
              <Link className="text-primary hover:underline" href="/login">
                返回登录
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
