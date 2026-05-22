import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

const clerkEnabled =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

export default function SignInPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-1)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--t-1)", letterSpacing: "-0.01em" }}>Stayboard</div>
          <div style={{ fontSize: 13, color: "var(--t-3)", marginTop: 4 }}>호텔 채널 매니저</div>
        </div>
        {clerkEnabled ? (
          <SignIn />
        ) : (
          <div style={{ background: "var(--bg-elev)", border: "1px solid var(--bd-1)", borderRadius: 8, padding: 24, maxWidth: 400, fontSize: 13, color: "var(--t-2)", lineHeight: 1.6 }}>
            <strong>Clerk 미설정</strong>
            <div style={{ marginTop: 8 }}>
              인증이 비활성화 상태입니다. <code style={{ background: "var(--bg-mute)", padding: "1px 4px", borderRadius: 3 }}>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> 와 <code style={{ background: "var(--bg-mute)", padding: "1px 4px", borderRadius: 3 }}>CLERK_SECRET_KEY</code> 를 <code>.env</code>에 설정하면 활성화됩니다.
            </div>
            <div style={{ marginTop: 12 }}>
              지금은 인증 없이 <Link href="/" style={{ color: "var(--acc)" }}>대시보드로</Link> 바로 이동할 수 있습니다.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
