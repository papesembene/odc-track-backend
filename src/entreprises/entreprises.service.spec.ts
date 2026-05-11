import { EntreprisesService } from './entreprises.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('EntreprisesService', () => {
  let service: EntreprisesService;

  beforeEach(() => {
    service = new EntreprisesService({} as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
