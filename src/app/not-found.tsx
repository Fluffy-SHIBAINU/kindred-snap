/** Rendered for unknown routes and whenever a route calls notFound() (the staff gate does, so a non-staff request never sees data). */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center gap-4 px-6 py-12 text-ink">
      <h1 className="text-2xl">Not Available</h1>
      <p>This page is not available. Check the address, or go back to the start.</p>
      <a href="/" className="inline-flex min-h-14 w-fit items-center rounded-input bg-accent px-5 font-medium text-accent-ink no-underline">
        Back to the start
      </a>
    </main>
  );
}
