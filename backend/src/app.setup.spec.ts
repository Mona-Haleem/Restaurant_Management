import type { INestApplication } from '@nestjs/common';
import { API_PREFIX, configureApp } from './app.setup';

describe('configureApp', () => {
  it('puts every route under /v1', () => {
    const setGlobalPrefix = jest.fn();
    const app = { setGlobalPrefix } as unknown as INestApplication;

    expect(configureApp(app)).toBe(app);
    expect(setGlobalPrefix).toHaveBeenCalledWith(API_PREFIX);
    expect(API_PREFIX).toBe('v1');
  });
});
