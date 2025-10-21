// This test relies on the test setup to validate that a real PSQL connection string is provided.
// Do not set fallback defaults here; tests should fail fast if env is missing.

jest.mock("knex", () => {
  const migrate = { latest: jest.fn().mockResolvedValue([]) };
  const knexFactory = jest.fn().mockImplementation(() => ({ migrate }));
  return { knex: knexFactory };
});

jest.mock("fs", () => ({
  existsSync: jest.fn().mockImplementation((_p: string) => true),
}));

import { knex as mockedKnex } from "knex";
import DBConnection from "../../database/pgdb-manager.class";

describe("PostgresDatabaseManager knex migrations", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("runs knex.migrate.latest when knex_migrations directory exists", async () => {
    // Call initialize which should detect knex_migrations and call migrate.latest
    await DBConnection.initialize();

    // Expect knex factory was called and migrate.latest invoked
    const k = mockedKnex as unknown as jest.Mock;
    expect(k).toHaveBeenCalledTimes(1);

    // The instance returned by knexFactory has migrate.latest
    const instance = k.mock.results[0].value;
    expect(instance.migrate.latest).toHaveBeenCalled();

    // cleanup
    await DBConnection.close();
  });
});
