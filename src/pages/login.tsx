import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const nextPath = typeof router.query.next === 'string' ? router.query.next : '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/app-auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d?.user) router.replace('/');
      })
      .catch(() => {});
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch('/api/app-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data?.error || 'Login failed');
      return;
    }

    router.replace(nextPath);
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm overflow-hidden border border-border bg-white shadow-none">
        <div className="h-0.5 w-full bg-red-600" />
        <CardHeader className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-muted-foreground">XHS Generator</div>
          <CardTitle className="text-2xl font-semibold tracking-tight">登录</CardTitle>
          <CardDescription className="text-sm">进入 XHS Runner</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">邮箱</div>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">密码</div>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
            </div>
            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-6">
            <Button className="w-full bg-red-600 text-white hover:bg-red-700" disabled={loading} type="submit">
              {loading ? '登录中…' : '登录'}
            </Button>
            <div className="text-sm text-muted-foreground">
              没有账号？{' '}
              <Link className="font-medium text-red-600 hover:underline" href="/register">
                使用激活码注册
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
