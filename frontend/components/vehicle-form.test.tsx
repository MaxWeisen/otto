import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { VehicleFormState } from "@/app/(authenticated)/vehicles/actions";
import { Toaster } from "@/components/ui/sonner";
import { VehicleForm } from "@/components/vehicle-form";
import { server } from "@/test/server";

// Pin the clock so the latest accepted model year (next year) is stable.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

const emptyValues = {
  year: "",
  make: "",
  model: "",
  trim: "",
  nickname: "",
  mileage: "",
  vin: "",
};

// A combobox loses its accessible name while its list is open, because the
// rest of the page, label included, is hidden from assistive technology.
// Tests therefore keep a reference to the input from before opening it.

// The browser keeps loaded model lists for the page's lifetime, so each test
// asks for a different make and year to start from an empty cache.
const modelsByMakeYear: Record<string, string[]> = {
  "toyota|2020": ["4Runner", "Camry", "Corolla", "RAV4"],
  "toyota|2021": ["Camry", "Corolla", "Sienna"],
  "toyota|2022": ["Corolla", "Tundra"],
  "toyota|2015": ["4Runner", "Corolla"],
  "toyota|2016": ["Corolla", "Prius"],
  "honda|2003": ["Accord", "Civic", "CR-V"],
  "honda|2020": ["Accord", "Civic", "Pilot"],
  "honda|2018": ["Accord", "Civic"],
  "ford|2019": ["F-150", "Mustang"],
  "mazda|2019": ["CX-5", "Mazda3"],
};

const decodedVins: Record<string, object> = {
  "1HGCM82633A004352": {
    vin: "1HGCM82633A004352",
    year: 2003,
    make: "HONDA",
    model: "Accord",
    trim: "EX-V6",
  },
  "1G1YY22G965100001": {
    vin: "1G1YY22G965100001",
    year: 2006,
    make: "DMC",
    model: "DMC-12",
    trim: null,
  },
  JM1BPACL0K1000001: {
    vin: "JM1BPACL0K1000001",
    year: null,
    make: "MAZDA",
    model: "Mazda3",
    trim: null,
  },
};

const modelRequests: string[] = [];

beforeEach(() => {
  modelRequests.length = 0;

  server.use(
    http.get("*/api/vpic/models", ({ request }) => {
      const url = new URL(request.url);
      const key = `${url.searchParams.get("make")?.toLowerCase()}|${url.searchParams.get("year")}`;

      modelRequests.push(key);

      return HttpResponse.json({ models: modelsByMakeYear[key] ?? [] });
    }),
    http.get("*/api/vpic/decode/:vin", ({ params }) => {
      const decoded = decodedVins[params.vin as string];

      return decoded
        ? HttpResponse.json(decoded)
        : HttpResponse.json(
            { error: "No vehicle data found for this VIN." },
            { status: 404 },
          );
    }),
  );
});

type Action = (
  state: VehicleFormState,
  formData: FormData,
) => Promise<VehicleFormState>;

function renderForm(
  action: Action = vi.fn(async (state: VehicleFormState) => state),
) {
  const user = userEvent.setup();

  render(
    <>
      <Toaster />
      <VehicleForm
        action={action}
        defaultValues={emptyValues}
        submitLabel="Add vehicle"
        cancelHref="/vehicles"
      />
    </>,
  );

  return { user, action };
}

const yearInput = () => screen.getByRole("textbox", { name: "Year" });
const makeInput = () => screen.getByRole("combobox", { name: "Make" });
const modelCombobox = () => screen.getByRole("combobox", { name: "Model" });
const vinInput = () => screen.getByRole("textbox", { name: /^VIN/ });

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  combobox: HTMLElement,
  query: string,
  option: string | RegExp,
) {
  await user.click(combobox);
  await user.clear(combobox);
  await user.type(combobox, query);
  await user.click(await screen.findByRole("option", { name: option }));
}

async function fillStepOne(
  user: ReturnType<typeof userEvent.setup>,
  { year, make, model }: { year: string; make: string; model: string },
) {
  await user.type(yearInput(), year);
  await chooseOption(user, makeInput(), make, make);
  await waitFor(() => expect(modelCombobox()).toBeEnabled());
  await chooseOption(user, modelCombobox(), model, model);
}

describe("VehicleForm wizard", () => {
  it("blocks Next until step 1 is valid", async () => {
    const { user, action } = renderForm();

    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Year is required")).toBeInTheDocument();
    expect(screen.getByText("Make is required")).toBeInTheDocument();
    expect(screen.getByText("Model is required")).toBeInTheDocument();
    expect(yearInput()).toHaveFocus();
    expect(yearInput()).toHaveAttribute("aria-invalid", "true");
    expect(action).not.toHaveBeenCalled();
  });

  it("clears a field's error as soon as it is edited", async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(yearInput(), "1");

    expect(screen.queryByText("Year is required")).not.toBeInTheDocument();
    expect(screen.getByText("Make is required")).toBeInTheDocument();
  });

  it("walks both steps, keeps values on Back and submits once", async () => {
    const { user, action } = renderForm();

    await fillStepOne(user, { year: "2020", make: "Toyota", model: "Camry" });
    await user.type(screen.getByRole("textbox", { name: /^Trim/ }), "SE");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Mileage/ })).toHaveFocus();

    await user.type(
      screen.getByRole("textbox", { name: /^Mileage/ }),
      "84,500",
    );
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(yearInput()).toHaveValue("2020");
    expect(makeInput()).toHaveValue("Toyota");
    expect(modelCombobox()).toHaveValue("Camry");

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("textbox", { name: /^Mileage/ })).toHaveValue(
      "84,500",
    );

    await user.type(
      screen.getByRole("textbox", { name: /^Nickname/ }),
      "Daily driver",
    );
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

    const formData = vi.mocked(action).mock.calls[0][1];

    expect(Object.fromEntries(formData)).toEqual({
      vin: "",
      year: "2020",
      make: "Toyota",
      model: "Camry",
      trim: "SE",
      mileage: "84,500",
      nickname: "Daily driver",
    });
  });

  it("validates step 2 before submitting", async () => {
    const { user, action } = renderForm();

    await fillStepOne(user, { year: "2021", make: "Toyota", model: "Sienna" });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByRole("textbox", { name: /^Mileage/ }), "-5");
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));

    expect(
      screen.getByText("Mileage must be a whole number of 0 or more"),
    ).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("shows a backend error in the form and as a toast", async () => {
    const action = vi.fn(
      async (_state: VehicleFormState, formData: FormData) => ({
        values: { ...emptyValues, ...Object.fromEntries(formData) },
        message: "Something went wrong. Please try again.",
      }),
    );
    const { user } = renderForm(action as Action);

    await fillStepOne(user, { year: "2022", make: "Toyota", model: "Tundra" });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));

    expect(
      await screen.findByText("Something went wrong. Please try again.", {
        selector: "form [role=alert] *",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Something went wrong. Please try again.", {
        selector: "[data-sonner-toast] *",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
  });

  it("returns to the step with a server-side field error", async () => {
    const action = vi.fn(
      async (_state: VehicleFormState, formData: FormData) => ({
        values: { ...emptyValues, ...Object.fromEntries(formData) },
        errors: { model: ["Model must be at most 255 characters"] },
      }),
    );
    const { user } = renderForm(action as Action);

    await fillStepOne(user, { year: "2019", make: "Ford", model: "Mustang" });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));

    expect(
      await screen.findByText("Model must be at most 255 characters"),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });
});

describe("Make combobox", () => {
  it("ranks matches and selects with the keyboard", async () => {
    const { user } = renderForm();
    const make = makeInput();

    await user.click(make);
    await user.type(make, "m");

    const options = await screen.findAllByRole("option");

    expect(options.map((option) => option.textContent)).toEqual([
      "Maserati",
      "Mazda",
      "McLaren",
      "Mercedes-Benz",
      "Mercury",
      "Mini",
      "Mitsubishi",
      "Aston Martin",
      "Other / not listed",
    ]);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(make).toHaveValue("Mazda");
  });

  it("reveals a free-text make that keeps what was typed", async () => {
    const { user, action } = renderForm();

    await chooseOption(user, makeInput(), "DeLorean", "Other / not listed");

    const otherMake = screen.getByRole("textbox", { name: "Make name" });

    expect(otherMake).toHaveValue("DeLorean");
    expect(otherMake).toHaveFocus();

    // A custom make has no list to choose from, so the model is free text.
    await user.type(yearInput(), "1981");
    await user.type(screen.getByRole("textbox", { name: "Model" }), "DMC-12");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));

    await waitFor(() => expect(action).toHaveBeenCalled());

    const formData = vi.mocked(action).mock.calls[0][1];

    expect(formData.get("make")).toBe("DeLorean");
    expect(formData.get("model")).toBe("DMC-12");
  });
});

describe("Model combobox", () => {
  it("waits for a make and year before loading", async () => {
    const { user } = renderForm();

    expect(modelCombobox()).toBeDisabled();
    expect(modelCombobox()).toHaveAttribute(
      "placeholder",
      "Choose a make first",
    );

    await chooseOption(user, makeInput(), "Honda", "Honda");

    expect(modelCombobox()).toHaveAttribute(
      "placeholder",
      "Enter the year first",
    );
    expect(modelRequests).toEqual([]);
  });

  it("shows a loading state, then the models for the make and year", async () => {
    server.use(
      http.get("*/api/vpic/models", async () => {
        await delay(50);
        return HttpResponse.json({ models: ["Accord", "Civic"] });
      }),
    );
    const { user } = renderForm();

    await user.type(yearInput(), "2018");
    await chooseOption(user, makeInput(), "Honda", "Honda");

    expect(modelCombobox()).toHaveAttribute("placeholder", "Loading models...");

    await waitFor(() => expect(modelCombobox()).toBeEnabled());
    await user.click(modelCombobox());

    const options = await screen.findAllByRole("option");

    expect(options.map((option) => option.textContent)).toEqual([
      "Accord",
      "Civic",
      "Other / not listed",
    ]);
  });

  it("falls back to free text when vPIC lists no models", async () => {
    const { user } = renderForm();

    await user.type(yearInput(), "1900");
    await chooseOption(user, makeInput(), "Ford", "Ford");

    expect(
      await screen.findByText(
        "NHTSA lists no Ford models for 1900. Type the model instead.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Model" })).toBeEnabled();
  });

  it("keeps and submits a model typed when vPIC lists none", async () => {
    const { user, action } = renderForm();

    await user.type(yearInput(), "1901");
    await chooseOption(user, makeInput(), "Ford", "Ford");
    await screen.findByText(
      "NHTSA lists no Ford models for 1901. Type the model instead.",
    );

    const model = screen.getByRole("textbox", { name: "Model" });

    await user.type(model, "Model A");

    expect(model).toHaveValue("Model A");

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));

    await waitFor(() => expect(action).toHaveBeenCalled());

    expect(vi.mocked(action).mock.calls[0][1].get("model")).toBe("Model A");
  });

  it("falls back to free text when the lookup fails", async () => {
    server.use(
      http.get("*/api/vpic/models", () =>
        HttpResponse.json(
          {
            error:
              "Vehicle data lookup is unavailable right now. Please try again.",
          },
          { status: 502 },
        ),
      ),
    );
    const { user } = renderForm();

    await user.type(yearInput(), "2017");
    await chooseOption(user, makeInput(), "Kia", "Kia");

    expect(
      await screen.findByText(
        "Couldn't load models from NHTSA. Type the model instead.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
  });

  it("retries a failed lookup for the same make and year", async () => {
    let failing = true;

    server.use(
      http.get("*/api/vpic/models", ({ request }) => {
        modelRequests.push(new URL(request.url).search);

        return failing
          ? HttpResponse.json(
              { error: "Vehicle data lookup is unavailable right now." },
              { status: 502 },
            )
          : HttpResponse.json({ models: ["Forte", "Soul"] });
      }),
    );
    const { user } = renderForm();

    await user.type(yearInput(), "2014");
    await chooseOption(user, makeInput(), "Kia", "Kia");
    await screen.findByText(
      "Couldn't load models from NHTSA. Type the model instead.",
    );

    failing = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(modelCombobox()).toBeEnabled());
    expect(modelRequests).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();

    await user.click(modelCombobox());

    const options = await screen.findAllByRole("option");

    expect(options.map((option) => option.textContent)).toEqual([
      "Forte",
      "Soul",
      "Other / not listed",
    ]);
  });

  it("keeps a typed model as Other once a retried lookup succeeds", async () => {
    let failing = true;

    server.use(
      http.get("*/api/vpic/models", () =>
        failing
          ? HttpResponse.json({ error: "Unavailable." }, { status: 502 })
          : HttpResponse.json({ models: ["Forte", "Soul"] }),
      ),
    );
    const { user } = renderForm();

    await user.type(yearInput(), "2013");
    await chooseOption(user, makeInput(), "Kia", "Kia");
    await user.type(
      await screen.findByRole("textbox", { name: "Model" }),
      "Rio",
    );

    failing = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(modelCombobox()).toBeEnabled());
    expect(modelCombobox()).toHaveValue("Other / not listed");
    expect(screen.getByRole("textbox", { name: "Model name" })).toHaveValue(
      "Rio",
    );
  });

  it("offers Other for a model that is not listed", async () => {
    const { user } = renderForm();

    await user.type(yearInput(), "2020");
    await chooseOption(user, makeInput(), "Toyota", "Toyota");
    await waitFor(() => expect(modelCombobox()).toBeEnabled());
    await chooseOption(user, modelCombobox(), "Crown", "Other / not listed");

    const otherModel = screen.getByRole("textbox", { name: "Model name" });

    expect(otherModel).toHaveValue("Crown");
    expect(otherModel).toHaveFocus();
  });

  it("clears the model when the make changes", async () => {
    const { user } = renderForm();

    await fillStepOne(user, { year: "2020", make: "Toyota", model: "RAV4" });
    await chooseOption(user, makeInput(), "Honda", "Honda");

    expect(modelCombobox()).toHaveValue("");
  });

  it("keeps the model across years that list it and clears it otherwise", async () => {
    const { user } = renderForm();

    async function changeYear(year: string) {
      await user.clear(yearInput());
      await user.type(yearInput(), year);
      await waitFor(() => expect(modelRequests).toContain(`toyota|${year}`));
      await waitFor(() => expect(modelCombobox()).toBeEnabled());
    }

    await fillStepOne(user, { year: "2015", make: "Toyota", model: "Corolla" });
    await changeYear("2016");

    expect(modelCombobox()).toHaveValue("Corolla");

    await user.clear(yearInput());
    await user.type(yearInput(), "2015");
    await waitFor(() => expect(modelCombobox()).toBeEnabled());
    await chooseOption(user, modelCombobox(), "4Run", "4Runner");
    await user.clear(yearInput());
    await user.type(yearInput(), "2016");

    await waitFor(() => expect(modelCombobox()).toHaveValue(""));
  });
});

describe("VIN decode", () => {
  it("pre-fills step 1 and keeps the VIN for saving", async () => {
    const { user, action } = renderForm();

    await user.type(vinInput(), "1hgcm82633a004352");
    await user.click(screen.getByRole("button", { name: "Decode" }));

    expect(
      await screen.findByText("2003 Honda Accord EX-V6"),
    ).toBeInTheDocument();
    expect(yearInput()).toHaveValue("2003");
    expect(makeInput()).toHaveValue("Honda");
    await waitFor(() => expect(modelCombobox()).toHaveValue("Accord"));
    expect(screen.getByRole("textbox", { name: /^Trim/ })).toHaveValue("EX-V6");
    expect(vinInput()).toHaveValue("1HGCM82633A004352");

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));

    await waitFor(() => expect(action).toHaveBeenCalled());

    expect(
      Object.fromEntries(vi.mocked(action).mock.calls[0][1]),
    ).toMatchObject({
      vin: "1HGCM82633A004352",
      year: "2003",
      make: "Honda",
      model: "Accord",
      trim: "EX-V6",
    });
  });

  it("decodes on Enter instead of moving to the next step", async () => {
    const { user } = renderForm();

    await user.type(vinInput(), "1HGCM82633A004352{Enter}");

    expect(
      await screen.findByText("2003 Honda Accord EX-V6"),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("falls back to Other for a make outside the list", async () => {
    const { user } = renderForm();

    await user.type(vinInput(), "1G1YY22G965100001");
    await user.click(screen.getByRole("button", { name: "Decode" }));

    expect(await screen.findByText("2006 DMC DMC-12")).toBeInTheDocument();
    expect(makeInput()).toHaveValue("Other / not listed");
    expect(screen.getByRole("textbox", { name: "Make name" })).toHaveValue(
      "DMC",
    );
    expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue(
      "DMC-12",
    );
  });

  it("keeps a decoded model as Other when the year is unknown", async () => {
    const { user, action } = renderForm();

    await user.type(vinInput(), "JM1BPACL0K1000001");
    await user.click(screen.getByRole("button", { name: "Decode" }));

    expect(await screen.findByText("Mazda Mazda3")).toBeInTheDocument();
    expect(makeInput()).toHaveValue("Mazda");
    expect(modelCombobox()).toHaveValue("Other / not listed");
    expect(screen.getByRole("textbox", { name: "Model name" })).toHaveValue(
      "Mazda3",
    );

    await user.type(yearInput(), "2019");
    await waitFor(() => expect(modelRequests).toContain("mazda|2019"));
    await waitFor(() => expect(modelCombobox()).toBeEnabled());

    expect(screen.getByRole("textbox", { name: "Model name" })).toHaveValue(
      "Mazda3",
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));

    await waitFor(() => expect(action).toHaveBeenCalled());

    expect(
      Object.fromEntries(vi.mocked(action).mock.calls[0][1]),
    ).toMatchObject({ year: "2019", make: "Mazda", model: "Mazda3" });
  });

  it.each([
    ["an empty VIN", "", "Enter a VIN to decode"],
    ["a short VIN", "1HGCM8263", "VIN must be 17 characters (currently 9)"],
    [
      "a VIN with an O",
      "1HGCM82633O004352",
      "VIN can only use letters and digits, excluding I, O and Q",
    ],
    [
      "an unknown VIN",
      "ZZZZZZZZZZZZZZZZZ",
      "No vehicle data found for this VIN.",
    ],
  ])("explains %s", async (_name, vin, message) => {
    const { user } = renderForm();

    if (vin) {
      await user.type(vinInput(), vin);
    }

    await user.click(screen.getByRole("button", { name: "Decode" }));

    const status = await screen.findByText(message);

    expect(status).toBeInTheDocument();
    expect(vinInput()).toHaveAttribute("aria-invalid", "true");
    expect(yearInput()).toHaveValue("");
  });

  it("explains an upstream failure", async () => {
    server.use(
      http.get("*/api/vpic/decode/:vin", () =>
        HttpResponse.json(
          {
            error:
              "Vehicle data lookup is unavailable right now. Please try again.",
          },
          { status: 502 },
        ),
      ),
    );
    const { user } = renderForm();

    await user.type(vinInput(), "1HGCM82633A004352");
    await user.click(screen.getByRole("button", { name: "Decode" }));

    expect(
      await screen.findByText(
        "Vehicle data lookup is unavailable right now. Please try again.",
      ),
    ).toBeInTheDocument();
  });

  it("blocks Next for an invalid VIN even without decoding", async () => {
    const { user } = renderForm();

    await user.type(vinInput(), "ABC");
    await fillStepOne(user, { year: "2003", make: "Honda", model: "Civic" });
    await user.click(screen.getByRole("button", { name: "Next" }));

    const vinField = vinInput().closest("[data-slot=field]") as HTMLElement;

    expect(
      within(vinField).getByText("VIN must be 17 characters (currently 3)"),
    ).toBeInTheDocument();
    expect(vinInput()).toHaveFocus();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });
});
