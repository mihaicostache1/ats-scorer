import { LabelingDataError, readCandidatePdf } from "../../_lib/data";

/**
 * Serves one CV of the L-9 evaluation set (`ml/evaluation/pdfs/<id>.pdf`) to the labeling tool, which
 * shows it in the browser's PDF viewer. Dev only: `route.dev.ts` is a route only while `next dev`
 * runs, and in a production build the answer is 404 either way.
 *
 * Only ids named in `pairs.csv` are served, and the id has to look like `C123`, so nothing outside
 * the evaluation set can be read through this URL.
 */

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production") return notFound();

  const { id } = await context.params;
  let pdf: Buffer | null;
  try {
    pdf = await readCandidatePdf(id);
  } catch (error) {
    if (error instanceof LabelingDataError) return new Response(error.message, { status: 500 });
    throw error;
  }
  if (!pdf) return notFound();

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${id}.pdf"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
