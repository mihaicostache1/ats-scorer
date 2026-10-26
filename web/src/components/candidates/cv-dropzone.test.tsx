import { describe, expect, it, vi } from "vitest";
import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MAX_CV_SIZE_BYTES } from "./cv-upload-rules";
import { CvDropzone } from "./cv-dropzone";

const pdf = (name = "cv.pdf") =>
  new File(["%PDF-1.4 ... %%EOF"], name, { type: "application/pdf" });
const text = (name = "notes.txt") => new File(["hello"], name, { type: "text/plain" });

/** Drops files on the zone the way a browser does. */
function drop(files: File[]) {
  const zone = screen.getByRole("group", { name: "Upload a CV" });
  const event = createEvent.drop(zone);
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  fireEvent(zone, event);
}

describe("CvDropzone", () => {
  it("can be used with the keyboard: a labelled, focusable file input", async () => {
    const user = userEvent.setup();
    render(<CvDropzone onFile={vi.fn()} />);

    const input = screen.getByLabelText("Choose PDF");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "application/pdf,.pdf");

    await user.tab();
    expect(input).toHaveFocus();
  });

  it("states the rules up front", () => {
    render(<CvDropzone onFile={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Upload a CV" })).toHaveAccessibleDescription(
      /PDF only, up to 10 MB/
    );
  });

  it("hands over a chosen PDF", async () => {
    const onFile = vi.fn();
    const user = userEvent.setup();
    render(<CvDropzone onFile={onFile} />);
    const file = pdf();
    await user.upload(screen.getByLabelText("Choose PDF"), file);

    await waitFor(() => expect(onFile).toHaveBeenCalledWith(file));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hands over a dropped PDF", async () => {
    const onFile = vi.fn();
    render(<CvDropzone onFile={onFile} />);
    const file = pdf();
    drop([file]);
    await waitFor(() => expect(onFile).toHaveBeenCalledWith(file));
  });

  it("refuses a file that isn't a PDF and says why", async () => {
    const onFile = vi.fn();
    const user = userEvent.setup({ applyAccept: false });
    render(<CvDropzone onFile={onFile} />);
    await user.upload(screen.getByLabelText("Choose PDF"), text());

    expect(await screen.findByRole("alert")).toHaveTextContent("Only PDF files are accepted.");
    expect(onFile).not.toHaveBeenCalled();
  });

  it("refuses a dropped file that isn't a PDF", async () => {
    const onFile = vi.fn();
    render(<CvDropzone onFile={onFile} />);
    drop([text()]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Only PDF files are accepted.");
    expect(onFile).not.toHaveBeenCalled();
  });

  it("refuses a file over 10 MB", async () => {
    const onFile = vi.fn();
    render(<CvDropzone onFile={onFile} />);
    const big = new File([new Uint8Array(MAX_CV_SIZE_BYTES + 1)], "big.pdf", {
      type: "application/pdf",
    });
    drop([big]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The file is larger than the 10 MB limit."
    );
    expect(onFile).not.toHaveBeenCalled();
  });

  it("takes one file at a time", async () => {
    const onFile = vi.fn();
    render(<CvDropzone onFile={onFile} />);
    drop([pdf("a.pdf"), pdf("b.pdf")]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload one CV at a time.");
    expect(onFile).not.toHaveBeenCalled();
  });

  it("clears the message once a good file is chosen", async () => {
    const onFile = vi.fn();
    const user = userEvent.setup({ applyAccept: false });
    render(<CvDropzone onFile={onFile} />);
    await user.upload(screen.getByLabelText("Choose PDF"), text());
    await screen.findByRole("alert");

    await user.upload(screen.getByLabelText("Choose PDF"), pdf());
    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets the same file be chosen twice in a row", async () => {
    const onFile = vi.fn();
    const user = userEvent.setup();
    render(<CvDropzone onFile={onFile} />);
    const file = pdf();
    await user.upload(screen.getByLabelText("Choose PDF"), file);
    await user.upload(screen.getByLabelText("Choose PDF"), file);
    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(2));
  });

  it("does nothing when disabled", () => {
    const onFile = vi.fn();
    render(<CvDropzone onFile={onFile} disabled />);
    expect(screen.getByLabelText("Choose PDF")).toBeDisabled();
    drop([pdf()]);
    expect(onFile).not.toHaveBeenCalled();
  });
});
