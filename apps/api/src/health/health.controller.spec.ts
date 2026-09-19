import { HealthController } from './health.controller';

function buildResMock() {
  const res = { statusCode: 0, body: undefined as unknown, status: jest.fn(), json: jest.fn() };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

describe('HealthController', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiQueue: any;
  let controller: HealthController;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) };
    aiQueue = { client: Promise.resolve({ info: jest.fn().mockResolvedValue('# Server') }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    controller = new HealthController(prisma as any, aiQueue as any);
  });

  it('returns 200 and status ok when both the database and Redis are reachable', async () => {
    const res = buildResMock();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await controller.check(res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
  });

  it('returns 503 and status degraded when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const res = buildResMock();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await controller.check(res as any);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.body).toMatchObject({ status: 'degraded', checks: { database: 'down', redis: 'ok' } });
  });

  it('returns 503 and status degraded when Redis is unreachable', async () => {
    aiQueue.client = Promise.resolve({ info: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    const res = buildResMock();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await controller.check(res as any);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.body).toMatchObject({ status: 'degraded', checks: { database: 'ok', redis: 'down' } });
  });
});
