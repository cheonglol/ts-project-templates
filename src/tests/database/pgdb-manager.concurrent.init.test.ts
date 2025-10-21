import { knex as mockedKnex } from "knex";
import DBConnection from "../../database/pgdb-manager.class";

jest.mock("knex", () => {
  // Return a factory function that produces a fake knex instance
  const mockDestroy = jest.fn().mockResolvedValue(undefined);
  const mockRaw = jest.fn().mockResolvedValue({ rows: [{ test: 1 }] });
  const mockTransaction = jest.fn().mockImplementation(async (cb: (trx: unknown) => Promise<unknown>) => cb({ raw: mockRaw, insert: jest.fn(), transaction: jest.fn() }));

  const fakeKnexInstance = {
    raw: mockRaw,
    transaction: mockTransaction,
    destroy: mockDestroy,
  };

  const knexFactory = jest.fn().mockImplementation(() => fakeKnexInstance);
  return { knex: knexFactory };
});

describe("PostgresDatabaseManager initialize concurrency", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("concurrent initialize calls result in a single knex() creation", async () => {
    // Call initialize twice concurrently
    await Promise.all([DBConnection.initialize(), DBConnection.initialize()]);

    // Expect knex factory to be called only once
    expect((mockedKnex as unknown as jest.Mock).mock.calls.length).toBe(1);

    // Clean up
    await DBConnection.close();
  });
});
