import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "../auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
      <p className="mb-6 text-sm text-muted">Sign in to manage your events.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
