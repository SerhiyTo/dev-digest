import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ONBOARDING_SECTION_KINDS } from "@/lib/onboarding";
import { OnThisPageRail } from "./OnThisPageRail";
import { onboardingSectionElementId } from "./helpers";

afterEach(cleanup);

function setTop(el: HTMLElement, top: number) {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      top,
      bottom: top + 200,
      left: 0,
      right: 0,
      width: 0,
      height: 200,
      x: 0,
      y: top,
      toJSON() {},
    }),
  });
}

function renderRail() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <main>
        {ONBOARDING_SECTION_KINDS.map((kind) => (
          <div key={kind} id={onboardingSectionElementId(kind)} />
        ))}
        <OnThisPageRail />
      </main>
    </NextIntlClientProvider>,
  );
}

describe("OnThisPageRail", () => {
  it("lists the five sections, moves the active marker as the main column scrolls, and scrolls a section into view on activation", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderRail();
    const main = document.querySelector("main")!;
    for (const kind of ONBOARDING_SECTION_KINDS) {
      setTop(document.getElementById(onboardingSectionElementId(kind))!, 500);
    }
    fireEvent.scroll(main);

    const nav = screen.getByRole("navigation", { name: /on this page/i });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(ONBOARDING_SECTION_KINDS.length);
    expect(links[0]).toHaveAttribute("aria-current", "true");

    const secondKind = ONBOARDING_SECTION_KINDS[1]!;
    setTop(document.getElementById(onboardingSectionElementId(secondKind))!, 10);
    fireEvent.scroll(main);

    expect(within(nav).getByText("Critical paths").closest("a")).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByText("Architecture").closest("a")).not.toHaveAttribute("aria-current", "true");

    fireEvent.click(within(nav).getByText("Reading order"));
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
