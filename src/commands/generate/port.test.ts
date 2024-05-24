import { describe, expect, it } from "vitest";
import { getUmbrelAppYmls } from "../../modules/apps";
import { generatePort } from "./port";
import { officialAppStoreDir } from "../../modules/paths";

describe("umbrel generate port", () => {
  it("should generate a random port not used by any app", async () => {
    const port = await generatePort(".");
    const officialUmbrelAppYmls = await getUmbrelAppYmls(officialAppStoreDir);
    expect(officialUmbrelAppYmls.map((app) => app.port)).not.toContain(port);
    expect(port).toBeGreaterThanOrEqual(1024);
    expect(port).toBeLessThanOrEqual(65535);
  });
});
