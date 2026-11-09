import { sendCode, verifyCode } from "./actions";

const ERRORS: Record<string, string> = {
  email: "Enter an email address like name@example.com.",
  send: "We could not send a code. Try again in a minute.",
  code: "That code did not work. Check the email and try again.",
  expired: "The code request expired. Enter your email again.",
  unavailable: "Sign-in is not set up on this demo.",
};

const field = "min-h-14 w-full rounded-input border border-ink/30 bg-transparent px-4 text-ink";
const button = "inline-flex min-h-14 w-full items-center justify-center rounded-input bg-accent px-5 font-medium text-accent-ink";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  const message = error ? ERRORS[error] : undefined;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center gap-4 px-6 py-12 text-ink">
      <h1 className="text-2xl">Sign In</h1>
      {message && <p role="alert">{message}</p>}
      {sent ? (
        <form action={verifyCode} className="flex flex-col gap-4">
          <label htmlFor="code">We emailed you a code. Enter it here.</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className={field} />
          <button type="submit" className={button}>Sign in</button>
          <a href="/sign-in">Use a different email</a>
        </form>
      ) : (
        <form action={sendCode} className="flex flex-col gap-4">
          <label htmlFor="email">Your email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className={field} />
          <button type="submit" className={button}>Email me a code</button>
        </form>
      )}
    </main>
  );
}
