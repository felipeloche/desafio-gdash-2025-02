import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { WeatherModule } from './weather/weather.module';
import { InsightsModule } from './insights/insights.module';
import { ExternalApiModule } from './external-api/external-api.module';
import { UsersService } from './users/users.service';
import { WeatherService } from './weather/weather.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/weaither-db'),
    UsersModule,
    AuthModule,
    WeatherModule,
    InsightsModule,
    ExternalApiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  constructor(
    private usersService: UsersService,
    private weatherService: WeatherService,
  ) {}

  async onModuleInit() {
    // Criar usuário padrão ao iniciar
    await this.usersService.createDefaultUser();

    // Verificar e popular dados iniciais se MongoDB estiver vazio
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const now = new Date();

    const hasData = await this.weatherService.hasDataInRange(sevenDaysAgo, now);

    if (!hasData) {
      console.log('📊 MongoDB vazio, populando dados iniciais...');
      await this.weatherService.seedInitialData();
    } else {
      console.log('✅ MongoDB já possui dados dos últimos 7 dias');
    }
  }
}