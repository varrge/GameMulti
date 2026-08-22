import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PluginApiExceptionFilter } from './plugin/plugin-api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3401);
  const appUrl = config.get<string>('APP_URL', 'http://localhost:3301');

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'bind/confirm', method: RequestMethod.GET },
      { path: 'bind/confirm', method: RequestMethod.POST },
      { path: 'bind/account', method: RequestMethod.GET },
    ],
  });
  app.enableCors({
    origin: appUrl,
    credentials: true,
  });
  app.useGlobalFilters(new PluginApiExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
