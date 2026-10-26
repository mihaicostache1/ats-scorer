import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagsInput } from "./tags-input";

/** Controlled wrapper, like the form uses it. */
function Harness({
  initial = [],
  onChange,
}: {
  initial?: string[];
  onChange?: (v: string[]) => void;
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <label htmlFor="skills">Skills</label>
      <TagsInput
        id="skills"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const current = () => JSON.parse(screen.getByTestId("value").textContent ?? "[]") as string[];

describe("TagsInput", () => {
  it("is named by its label", () => {
    render(<Harness />);
    expect(screen.getByRole("textbox", { name: "Skills" })).toBeInTheDocument();
  });

  it("adds a tag on Enter and clears the box", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("textbox", { name: "Skills" }), "Python{Enter}");
    expect(current()).toEqual(["Python"]);
    expect(screen.getByRole("textbox", { name: "Skills" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Remove Python" })).toBeInTheDocument();
  });

  it("adds a tag on comma and trims it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("textbox", { name: "Skills" }), "  SQL ,Docker,");
    expect(current()).toEqual(["SQL", "Docker"]);
  });

  it("skips duplicates, ignoring case", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["Python"]} />);
    await user.type(screen.getByRole("textbox", { name: "Skills" }), "python{Enter}");
    expect(current()).toEqual(["Python"]);
  });

  it("commits pending text on blur", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("textbox", { name: "Skills" }), "Go");
    await user.tab();
    expect(current()).toEqual(["Go"]);
  });

  it("removes the last tag with Backspace in an empty box", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["A", "B"]} />);
    await user.click(screen.getByRole("textbox", { name: "Skills" }));
    await user.keyboard("{Backspace}");
    expect(current()).toEqual(["A"]);
  });

  it("removes a tag from its button with the keyboard and returns focus to the box", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["A", "B"]} />);
    screen.getByRole("button", { name: "Remove A" }).focus();
    await user.keyboard("{Enter}");
    expect(current()).toEqual(["B"]);
    expect(screen.getByRole("textbox", { name: "Skills" })).toHaveFocus();
  });

  it("lets Enter on an empty box through, so the form can submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness />
        <button type="submit">Save</button>
      </form>
    );
    await user.click(screen.getByRole("textbox", { name: "Skills" }));
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit the form when Enter adds a tag", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness />
        <button type="submit">Save</button>
      </form>
    );
    await user.type(screen.getByRole("textbox", { name: "Skills" }), "Rust{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(current()).toEqual(["Rust"]);
  });

  it("splits pasted comma-separated text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("textbox", { name: "Skills" }));
    await user.paste("React, Next.js, TypeScript");
    expect(current()).toEqual(["React", "Next.js", "TypeScript"]);
  });
});
