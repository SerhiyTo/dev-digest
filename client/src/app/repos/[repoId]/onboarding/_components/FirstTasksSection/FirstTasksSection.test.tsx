import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { COMPLEXITY } from "@/lib/onboarding";
import { FirstTasksSection } from "./FirstTasksSection";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BASE_SECTION: OnboardingSection = {
  kind: "first_tasks",
  title: "First tasks",
  body: "Start by reading the onboarding guide.",
  diagram: null,
  links: [],
  first_tasks: null,
};

describe("FirstTasksSection", () => {
  it("renders a card per task with title, hint path and a colour-independent complexity pill", () => {
    renderWithIntl(
      <FirstTasksSection
        section={{
          ...BASE_SECTION,
          first_tasks: [
            { title: "Add a health check route", hint_path: "server/src/app.ts", complexity: "low" },
            { title: "Wire up the review pipeline", hint_path: "server/src/modules/reviews", complexity: "high" },
          ],
        }}
      />,
    );

    expect(screen.getByText("Add a health check route")).toBeInTheDocument();
    expect(screen.getByText("server/src/app.ts")).toBeInTheDocument();
    expect(screen.getByText(messages.complexity.low)).toBeInTheDocument();
    expect(screen.getByText(messages.complexity.high)).toBeInTheDocument();
  });

  it("colours each pill from the shared complexity module, not a literal in the card", () => {
    renderWithIntl(
      <FirstTasksSection
        section={{
          ...BASE_SECTION,
          first_tasks: [
            { title: "Add a health check route", hint_path: "server/src/app.ts", complexity: "low" },
            { title: "Rework the review pipeline", hint_path: "server/src/modules/reviews", complexity: "medium" },
            { title: "Wire up the review pipeline", hint_path: "server/src/modules/reviews", complexity: "high" },
          ],
        }}
      />,
    );

    expect(screen.getByText(messages.complexity.low).closest("span")).toHaveStyle({
      color: COMPLEXITY.low.c,
      background: COMPLEXITY.low.bg,
    });
    expect(screen.getByText(messages.complexity.medium).closest("span")).toHaveStyle({
      color: COMPLEXITY.medium.c,
      background: COMPLEXITY.medium.bg,
    });
    expect(screen.getByText(messages.complexity.high).closest("span")).toHaveStyle({
      color: COMPLEXITY.high.c,
      background: COMPLEXITY.high.bg,
    });
  });

  it("renders body alone when no tasks were structured, and an empty state at zero entries", () => {
    renderWithIntl(<FirstTasksSection section={BASE_SECTION} />);
    expect(screen.getByText(/reading the onboarding guide/)).toBeInTheDocument();

    cleanup();
    renderWithIntl(<FirstTasksSection section={{ ...BASE_SECTION, first_tasks: [] }} />);
    expect(screen.getByText(messages.sections.first_tasks.empty)).toBeInTheDocument();
  });
});
