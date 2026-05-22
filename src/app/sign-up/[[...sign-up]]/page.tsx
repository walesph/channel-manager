import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

const clerkEnabled =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

export default function SignUpPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-1)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--t-1)", letterSpacing: "-0.01em" }}>Stayboard</div>
          <div style={{ fontSize: 13, color: "var(--t-3)", marginTop: 4 }}>호텔 채널 매니저</div>
        </div>
        {clerkEnabled ? (
          <>
            <SignUp />
            <div style={{ fontSize: 11, color: "var(--t-3)", maxWidth: 400, textAlign: "center", padding: "0 16px" }}>
              가입 후 Clerk 대시보드에서 사용자의 publicMetadata에 <code style={{ background: "var(--bg-mute)", padding: "1px 4px", borderRadius: 3 }}>hotelId</code>를 설정하세요.
            </div>
          </>
        ) : (
          <div style={{ background: "var(--bg-elev)", border: "1px solid var(--bd-1)", borderRadius: 8, padding: 24, maxWidth: 400, fontSize: 13, color: "var(--t-2)", lineHeight: 1.6 }}>
            <strong>Clerk 미설정</strong>
            <div style={{ marginTop: 8 }}>
              <code>.env</code>에 Clerk 키를 추가하세요. <Link href="/" style={{ color: "var(--acc)" }}>대시보드로</Link> 바로 이동 가능합니다.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
