import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns the API name', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    expect(moduleRef.get(AppController).getApiInfo()).toEqual({ name: 'tablz-api' });
  });
});
