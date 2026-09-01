// Shaurya · Stage 1. The camera input is a browser feature, not a library.
export default function CapturePage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Scan a package</h1>
      <p className="mt-2 text-sm opacity-70">
        Lay the calibration card flat on the panel you are measuring, with the whole marker
        in frame. Shoot close.
      </p>
      <form action="/api/scan" method="post" encType="multipart/form-data" className="mt-6">
        <input type="file" name="image" accept="image/*" capture="environment" required />
        <button type="submit" className="mt-4 block rounded border px-4 py-2">
          Upload
        </button>
      </form>
    </main>
  );
}
