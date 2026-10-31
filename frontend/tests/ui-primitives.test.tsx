/**
 * The shared primitives in components/ui that the screens are being moved
 * onto: confirming, copying, one-time secrets, file pickers, tables.
 *
 * Each is a promise made to every screen at once — "the tick means it was
 * copied", "a secret dialog cannot be dismissed by accident" — so each promise
 * is asserted here rather than incidentally through one page.
 */

import { expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/i18n", () => import("./helpers/i18n"));

import {
  Banner,
  ConfirmDialog,
  ConfirmProvider,
  CopyButton,
  FileDropzone,
  Modal,
  SecretRevealDialog,
  Table,
  useConfirm,
} from "@/components/ui";

test("a typed confirmation stays disabled until the name is typed", async () => {
  const confirm = vi.fn();
  const person = userEvent.setup();
  render(
    <ConfirmDialog
      title="delete it"
      confirmLabel="base.action.delete"
      tone="danger"
      requireText="Гэрэгэ ХХК"
      onConfirm={confirm}
      onCancel={() => {}}
    />,
  );
  const button = screen.getByRole("button", { name: "base.action.delete" });

  expect((button as HTMLButtonElement).disabled).toBe(true);
  await person.type(screen.getByRole("textbox"), "Гэрэгэ ХХК");
  expect((button as HTMLButtonElement).disabled).toBe(false);
  await person.click(button);

  expect(confirm).toHaveBeenCalledTimes(1);
});

test("useConfirm resolves with the reason, and false on cancel", async () => {
  const person = userEvent.setup();
  const answers: unknown[] = [];
  function Screen() {
    const confirm = useConfirm();
    return (
      <button type="button" onClick={async () => answers.push(await confirm({ title: "why", reasonLabel: "reason" }))}>
        ask
      </button>
    );
  }
  render(
    <ConfirmProvider>
      <Screen />
    </ConfirmProvider>,
  );

  await person.click(screen.getByRole("button", { name: "ask" }));
  const confirmButton = screen.getByRole("button", { name: "base.action.confirm" }) as HTMLButtonElement;
  // A required reason: nothing to confirm with yet.
  expect(confirmButton.disabled).toBe(true);
  await person.type(screen.getByLabelText("reason"), "гэрээ дууссан");
  await person.click(confirmButton);

  await person.click(screen.getByRole("button", { name: "ask" }));
  await person.click(screen.getByRole("button", { name: "base.action.cancel" }));

  expect(answers).toEqual([{ reason: "гэрээ дууссан" }, false]);
});

test("the copy tick waits for the clipboard, and a refusal says so", async () => {
  const person = userEvent.setup();
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => Promise.reject(new Error("denied")));
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  // jsdom has no execCommand at all, so the fallback route fails too.
  render(<CopyButton value="secret" />);

  await person.click(screen.getByRole("button", { name: "base.action.copy" }));

  expect(writeText).toHaveBeenCalledWith("secret");
  expect(screen.getByRole("button", { name: "base.message.copy_failed" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("base.message.copy_failed");

  writeText.mockImplementation(async () => undefined);
  await person.click(screen.getByRole("button", { name: "base.message.copy_failed" }));

  expect(screen.getByRole("button", { name: "base.message.copied" })).toBeTruthy();
});

test("a one-time secret cannot be dismissed by accident", async () => {
  const done = vi.fn();
  const person = userEvent.setup();
  const { container } = render(
    <SecretRevealDialog title="secret" items={[{ label: "client_secret", value: "s3cr3t", secret: true }]} onDone={done} />,
  );

  await person.keyboard("{Escape}");
  await person.click(container.firstElementChild as HTMLElement);
  const finish = screen.getByRole("button", { name: "base.action.done" }) as HTMLButtonElement;
  expect(finish.disabled).toBe(true);
  expect(done).not.toHaveBeenCalled();

  await person.click(screen.getByLabelText("base.secret.saved_ack"));
  await person.click(finish);

  expect(done).toHaveBeenCalledTimes(1);
});

test("Escape over typed input asks before throwing it away", async () => {
  const close = vi.fn();
  const person = userEvent.setup();
  render(
    <Modal onClose={close} label="form">
      <input aria-label="name" defaultValue="" />
    </Modal>,
  );

  await person.type(screen.getByLabelText("name"), "Бат");
  await person.keyboard("{Escape}");

  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  await person.click(screen.getByRole("button", { name: "base.action.discard" }));

  expect(close).toHaveBeenCalledTimes(1);
});

test("a file over the limit is refused before it is uploaded", async () => {
  const onFile = vi.fn();
  render(<FileDropzone onFile={onFile} accept=".pdf" maxBytes={1024} />);
  // The limits are on screen before anything is chosen.
  expect(screen.getByText(/base\.file\.limits/)).toBeTruthy();

  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  const big = new File([new Uint8Array(2048)], "scan.pdf", { type: "application/pdf" });
  await act(async () => {
    await userEvent.upload(input, big);
  });

  expect(onFile).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("base.file.too_large");

  const small = new File([new Uint8Array(10)], "ok.pdf", { type: "application/pdf" });
  await act(async () => {
    await userEvent.upload(input, small);
  });
  expect(onFile).toHaveBeenCalledWith(small);
});

test("a loading table does not claim to be empty", () => {
  render(<Table head={["a", "b"]} rows={[]} empty="nothing here" loading />);

  expect(screen.queryByText("nothing here")).toBeNull();
  // Header cells name their column for a screen reader.
  expect(screen.getAllByRole("columnheader")[0].getAttribute("scope")).toBe("col");
});

test("a dismissable banner's close button is named and announced as an error", () => {
  render(<Banner tone="error" message="broke" onDismiss={() => {}} />);

  expect(screen.getByRole("alert").textContent).toContain("broke");
  expect(screen.getByRole("button", { name: "base.action.close" }).className).toContain("h-11");
});
