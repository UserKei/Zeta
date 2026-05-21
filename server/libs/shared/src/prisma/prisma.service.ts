import { Injectable } from '@nestjs/common';

@Injectable()
export class PrismaService {
  getTest() {
    return 'test';
  }
}
