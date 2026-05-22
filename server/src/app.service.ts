import { Injectable } from '@nestjs/common';
import { PrismaService, ResponseService } from '@libs/shared';

@Injectable()
export class AppService {
  constructor(
    private prisma: PrismaService,
    private response: ResponseService,
  ) {}
  getHello() {
    return this.response.success('Hello World!');
  }
}
