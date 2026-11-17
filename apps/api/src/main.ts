import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: false });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT || 3001), '127.0.0.1');
}
bootstrap();
