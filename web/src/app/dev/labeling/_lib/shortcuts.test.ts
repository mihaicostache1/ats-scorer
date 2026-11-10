import { describe, expect, it } from "vitest";
import { actionForKey, type KeyEventLike } from "./shortcuts";

const press = (key: string, over: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  target: document.body,
  ...over,
});

describe("actionForKey", () => {
  it.each([0, 1, 2, 3])("rates with %i", (value) => {
    expect(actionForKey(press(String(value)))).toEqual({ type: "rate", value });
  });

  it.each([
    ["s", { type: "skip" }],
    ["S", { type: "skip" }],
    ["u", { type: "undo" }],
    ["U", { type: "undo" }],
    ["Backspace", { type: "undo" }],
    ["ArrowLeft", { type: "prev" }],
    ["ArrowRight", { type: "next" }],
    ["e", { type: "export" }],
    ["?", { type: "help" }],
  ])("%s does %j", (key, action) => {
    expect(actionForKey(press(key))).toEqual(action);
  });

  it("undoes with Ctrl+Z and Cmd+Z, but not with Shift added", () => {
    expect(actionForKey(press("z", { ctrlKey: true }))).toEqual({ type: "undo" });
    expect(actionForKey(press("Z", { metaKey: true }))).toEqual({ type: "undo" });
    expect(actionForKey(press("z", { ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it("leaves other Ctrl, Cmd and Alt shortcuts to the browser", () => {
    for (const key of ["s", "r", "e", "u", "0", "1", "ArrowLeft", "Backspace"]) {
      expect(actionForKey(press(key, { ctrlKey: true }))).toBeNull();
      expect(actionForKey(press(key, { metaKey: true }))).toBeNull();
      expect(actionForKey(press(key, { altKey: true }))).toBeNull();
    }
  });

  it("ignores a key that is held down", () => {
    expect(actionForKey(press("3", { repeat: true }))).toBeNull();
    expect(actionForKey(press("s", { repeat: true }))).toBeNull();
    expect(actionForKey(press("z", { ctrlKey: true, repeat: true }))).toBeNull();
  });

  it("ignores keys while an input method is composing", () => {
    expect(actionForKey(press("3", { isComposing: true }))).toBeNull();
  });

  it("ignores keys typed into a field", () => {
    for (const tag of ["input", "textarea", "select"]) {
      const field = document.createElement(tag);
      expect(actionForKey(press("s", { target: field }))).toBeNull();
      expect(actionForKey(press("3", { target: field }))).toBeNull();
      expect(actionForKey(press("Backspace", { target: field }))).toBeNull();
      expect(actionForKey(press("z", { ctrlKey: true, target: field }))).toBeNull();
    }
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(actionForKey(press("s", { target: editable }))).toBeNull();
  });

  it("still works with a button focused", () => {
    expect(actionForKey(press("2", { target: document.createElement("button") }))).toEqual({
      type: "rate",
      value: 2,
    });
  });

  it("ignores everything else", () => {
    for (const key of ["4", "9", "a", "Enter", " ", "Tab", "Escape", "ArrowUp", "F5"]) {
      expect(actionForKey(press(key))).toBeNull();
    }
    expect(actionForKey(press("!", { shiftKey: true }))).toBeNull();
  });
});
