import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WeatherService } from './weather.service';
import { CreateWeatherLogDto } from './dto/create-weather-log.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as fs from 'fs';

@ApiTags('weather')
@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Post('logs')
  @ApiOperation({ summary: 'Criar registro de clima (usado pelo Go Worker)' })
  create(@Body() createWeatherLogDto: CreateWeatherLogDto) {
    return this.weatherService.create(createWeatherLogDto);
  }



  @Get('export/csv')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exportar dados em CSV' })
  async exportCsv(@Res() res: Response) {
    try {
      const filePath = await this.weatherService.exportToCsv();
      
      res.download(filePath, 'weather-data.csv', (err) => {
        if (err) {
          console.error('Erro ao enviar arquivo:', err);
        }
        // Deletar arquivo após download
        fs.unlinkSync(filePath);
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao gerar CSV', error: error.message });
    }
  }

  @Get('export/xlsx')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exportar dados em XLSX' })
  async exportXlsx(@Res() res: Response) {
    try {
      const filePath = await this.weatherService.exportToXlsx();

      res.download(filePath, 'weather-data.xlsx', (err) => {
        if (err) {
          console.error('Erro ao enviar arquivo:', err);
        }
        // Deletar arquivo após download
        fs.unlinkSync(filePath);
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao gerar XLSX', error: error.message });
    }
  }



  @Get('forecast-range')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obter dados de -7 a +7 dias (dados horários)',
    description: 'Retorna dados horários dos últimos 7 dias até os próximos 7 dias. Para gráficos padrão do dashboard.'
  })
  getForecastRange() {
    return this.weatherService.getForecastRange();
  }

  @Get('custom-chart')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gráfico personaliz\u00e1vel com agregação de dados',
    description: 'Retorna dados agregados conforme métrica e período selecionados. Suporta agregação horária, diária, semanal e mensal.'
  })
  @ApiQuery({
    name: 'metric',
    required: false,
    enum: ['temperature', 'humidity', 'windSpeed', 'rainProbability'],
    description: 'Métrica a ser analisada',
    example: 'temperature'
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['today', 'last_week', 'last_2_weeks', 'last_month', 'last_3_months', 'last_6_months', 'last_12_months'],
    description: 'Período de análise',
    example: 'last_week'
  })
  getCustomChart(
    @Query('metric') metric?: string,
    @Query('period') period?: string,
  ) {
    return this.weatherService.getCustomChart({ metric, period });
  }
}