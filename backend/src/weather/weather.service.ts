import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WeatherLog } from './schema/weather-log.schema';
import { CreateWeatherLogDto } from './dto/create-weather-log.dto';
import * as csvWriter from 'csv-writer';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';

@Injectable()
export class WeatherService {
  constructor(
    @InjectModel(WeatherLog.name) private weatherModel: Model<WeatherLog>,
  ) {}

  async create(dto: CreateWeatherLogDto): Promise<WeatherLog> {
    // Calcular expiresAt baseado na granularidade
    const expiresAt = new Date();
    if (dto.granularity === 'hourly') {
      expiresAt.setDate(expiresAt.getDate() + 7); // Dados horários expiram em 7 dias
    } else if (dto.granularity === 'daily') {
      expiresAt.setMonth(expiresAt.getMonth() + 13); // Dados diários expiram em 13 meses
    }

    const filter = {
      timestamp: dto.timestamp,
      'location.name': dto.location.name,
    };

    const update = {
      $set: {
        ...dto,
        expiresAt,
      },
    };

    // UPSERT: Atualizar se já existe registro para esse timestamp/localização
    // Isso evita duplicatas quando o sistema reinicia ou mensagens são reprocessadas
    // Usando updateOne + findOne para evitar race conditions
    await this.weatherModel.updateOne(
      filter,
      update,
      {
        upsert: true, // Criar se não existir
      }
    );

    // Buscar o documento atualizado/criado
    const result = await this.weatherModel.findOne(filter).exec();
    if (!result) {
      throw new Error('Falha ao criar/atualizar registro');
    }
    return result;
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<WeatherLog[]> {
    return this.weatherModel
      .find({
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .sort({ timestamp: -1 })
      .exec();
  }

  async exportToCsv(): Promise<string> {
    const logs = await this.weatherModel.find().sort({ timestamp: -1 }).exec();
    
    const outputPath = path.join(process.cwd(), 'exports', `weather-${Date.now()}.csv`);
    
    // Criar pasta exports se não existir
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const writer = csvWriter.createObjectCsvWriter({
      path: outputPath,
      header: [
        { id: 'timestamp', title: 'Data/Hora' },
        { id: 'location', title: 'Local' },
        { id: 'temperature', title: 'Temperatura (°C)' },
        { id: 'humidity', title: 'Umidade (%)' },
        { id: 'windSpeed', title: 'Vento (km/h)' },
        { id: 'condition', title: 'Condição' },
        { id: 'rainProbability', title: 'Prob. Chuva (%)' },
      ],
    });

    const records = logs.map(log => ({
      timestamp: log.timestamp.toISOString(),
      location: log.location.name,
      temperature: log.temperature,
      humidity: log.humidity,
      windSpeed: log.windSpeed,
      condition: log.condition,
      rainProbability: log.rainProbability || 0,
    }));

    await writer.writeRecords(records);
    
    return outputPath;
  }

  async exportToXlsx(): Promise<string> {
    const logs = await this.weatherModel.find().sort({ timestamp: -1 }).exec();
    
    const data = logs.map(log => ({
      'Data/Hora': log.timestamp.toISOString(),
      'Local': log.location.name,
      'Temperatura (°C)': log.temperature,
      'Umidade (%)': log.humidity,
      'Vento (km/h)': log.windSpeed,
      'Condição': log.condition,
      'Prob. Chuva (%)': log.rainProbability || 0,
      'Sensação Térmica (°C)': log.feelsLike || log.temperature,
      'Pressão (hPa)': log.pressure || 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados Climáticos');

    const outputPath = path.join(process.cwd(), 'exports', `weather-${Date.now()}.xlsx`);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    XLSX.writeFile(workbook, outputPath);
    
    return outputPath;
  }



  private average(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Verifica se existem dados em um range de datas
   */
  async hasDataInRange(startDate: Date, endDate: Date): Promise<boolean> {
    const count = await this.weatherModel.countDocuments({
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
      granularity: 'hourly',
    });

    return count > 0;
  }

  /**
   * Busca dados da Forecast API (past_days=8, forecast_days=0)
   * Retorna APENAS dados reais até AGORA (sem previsão futura)
   */
  async fetchFromForecastAPI(): Promise<any[]> {
    try {
      const url = 'https://api.open-meteo.com/v1/forecast';
      const params = new URLSearchParams({
        latitude: process.env.LOCATION_LAT || '-27.5935',
        longitude: process.env.LOCATION_LON || '-48.5589',
        past_days: '8',  // 8 dias inclui HOJE até hora atual
        forecast_days: '0',  // NÃO pegar previsão futura
        hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,weather_code,apparent_temperature,pressure_msl',
        timezone: process.env.LOCATION_TIMEZONE || 'America/Sao_Paulo',
      });

      const response = await fetch(`${url}?${params}`);
      const data = await response.json();

      const hourlyData = data.hourly;
      const times = hourlyData.time || [];

      const weatherLogs: any[] = [];
      const now = new Date();

      for (let i = 0; i < times.length; i++) {
        const timestamp = new Date(times[i]);
        
        // FILTRO: pegar APENAS dados até AGORA (não previsão futura)
        if (timestamp > now) {
          continue; // Pular dados futuros
        }
        
        const isForecast = timestamp > now;

        // Calcular expiresAt: 7 dias a partir de agora
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const weatherCode = hourlyData.weather_code?.[i] || 0;

        weatherLogs.push({
          timestamp,
          location: {
            name: process.env.LOCATION_NAME || 'Florianopolis',
            latitude: parseFloat(process.env.LOCATION_LAT || '-27.5935'),
            longitude: parseFloat(process.env.LOCATION_LON || '-48.5589'),
          },
          temperature: hourlyData.temperature_2m?.[i] || 0,
          humidity: hourlyData.relative_humidity_2m?.[i] || 0,
          windSpeed: hourlyData.wind_speed_10m?.[i] || 0,
          condition: this.mapWeatherCode(weatherCode),
          rainProbability: hourlyData.precipitation_probability?.[i] || 0,
          feelsLike: hourlyData.apparent_temperature?.[i],
          pressure: hourlyData.pressure_msl?.[i],
          isForecast,
          granularity: 'hourly',
          expiresAt,
        });
      }

      return weatherLogs;
    } catch (error) {
      console.error('Erro ao buscar da Forecast API:', error);
      throw error;
    }
  }

  /**
   * Mapeia weather code para condição
   */
  private mapWeatherCode(code: number): string {
    const codeMap = {
      0: 'clear',
      1: 'mainly_clear',
      2: 'partly_cloudy',
      3: 'overcast',
      45: 'foggy',
      48: 'foggy',
      51: 'drizzle',
      53: 'drizzle',
      55: 'drizzle',
      61: 'rainy',
      63: 'rainy',
      65: 'rainy',
      71: 'snowy',
      73: 'snowy',
      75: 'snowy',
      77: 'snowy',
      80: 'rainy',
      81: 'rainy',
      82: 'rainy',
      85: 'snowy',
      86: 'snowy',
      95: 'thunderstorm',
      96: 'thunderstorm',
      99: 'thunderstorm',
    };
    return codeMap[code] || 'unknown';
  }

  /**
   * Popula dados iniciais no MongoDB se estiver vazio
   */
  async seedInitialData(): Promise<void> {
    console.log('🌱 Populando dados iniciais...');

    const weatherLogs = await this.fetchFromForecastAPI();

    // Usar insertMany com ordered=false para continuar mesmo se houver duplicatas
    try {
      await this.weatherModel.insertMany(weatherLogs, { ordered: false });
      console.log(`✅ ${weatherLogs.length} registros inseridos com sucesso`);
    } catch (error) {
      // Ignorar erros de chave duplicada (dados já existem)
      if (error.code === 11000) {
        console.log('⚠️  Alguns dados já existiam, ignorando duplicatas');
      } else {
        throw error;
      }
    }
  }

  /**
   * Helper para fazer requisições HTTPS
   */
  private async httpsGet(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Busca dados históricos da Archive API da Open-Meteo
   * Retorna dados diários agregados
   */
  private async fetchHistoricalDataFromArchiveAPI(
    startDate: Date,
    endDate: Date,
  ): Promise<WeatherLog[]> {
    try {
      const formatDate = (date: Date): string => {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
      };

      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      console.log(`📊 Buscando dados históricos da Archive API: ${startDateStr} até ${endDateStr}`);

      const dailyParams = [
        'temperature_2m_max',
        'temperature_2m_min',
        'temperature_2m_mean',
        'relative_humidity_2m_mean',
        'wind_speed_10m_max',
        'precipitation_sum',
        'weather_code',
      ].join(',');

      const url = `https://archive-api.open-meteo.com/v1/archive?` +
        `latitude=-27.5935&longitude=-48.5589` +
        `&start_date=${startDateStr}&end_date=${endDateStr}` +
        `&daily=${dailyParams}&timezone=America/Sao_Paulo`;

      const data = await this.httpsGet(url);

      if (!data.daily || !data.daily.time) {
        console.log('⚠️  Archive API não retornou dados');
        return [];
      }

      // Processar dados diários
      const weatherLogs: Partial<WeatherLog>[] = [];
      const times = data.daily.time;

      for (let i = 0; i < times.length; i++) {
        const date = new Date(times[i]);
        // Definir timestamp para meio-dia (12:00) para representar o dia
        date.setHours(12, 0, 0, 0);

        const weatherCode = data.daily.weather_code?.[i] || 0;
        const condition = this.mapWeatherCode(weatherCode);

        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 13); // 13 meses

        weatherLogs.push({
          timestamp: date,
          location: {
            name: 'Florianópolis',
            latitude: -27.5935,
            longitude: -48.5589,
          },
          temperature: data.daily.temperature_2m_mean?.[i] || 0,
          temperature_min: data.daily.temperature_2m_min?.[i],
          temperature_max: data.daily.temperature_2m_max?.[i],
          humidity: data.daily.relative_humidity_2m_mean?.[i] || 0,
          windSpeed: data.daily.wind_speed_10m_max?.[i] || 0,
          condition,
          rainProbability: this.calculateRainProbabilityFromPrecipitation(
            data.daily.precipitation_sum?.[i] || 0,
          ),
          isForecast: false,
          granularity: 'daily',
          expiresAt,
        });
      }

      console.log(`✅ ${weatherLogs.length} registros diários obtidos da Archive API`);
      return weatherLogs as WeatherLog[];
    } catch (error) {
      console.error('❌ Erro ao buscar dados da Archive API:', error.message);
      return [];
    }
  }

  /**
   * Calcula probabilidade de chuva baseado na precipitação
   */
  private calculateRainProbabilityFromPrecipitation(precipitation: number): number {
    if (precipitation === 0) return 0;
    if (precipitation < 2.5) return 25;
    if (precipitation < 7.5) return 50;
    if (precipitation < 15) return 75;
    return 100;
  }

  /**
   * Busca dados de -7 a +7 dias do MongoDB
   * Para os gráficos padrão do dashboard
   */
  async getForecastRange(): Promise<WeatherLog[]> {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sevenDaysAhead = new Date(now);
    sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

    return this.weatherModel
      .find({
        timestamp: {
          $gte: sevenDaysAgo,
          $lte: sevenDaysAhead,
        },
        granularity: 'hourly',
      })
      .sort({ timestamp: 1 })
      .exec();
  }

  /**
   * Gráfico personaliz\u00e1vel: retorna dados agregados conforme período selecionado
   * Períodos: today, last_week, last_2_weeks, last_month, last_3_months, last_6_months, last_12_months
   */
  async getCustomChart(params: {
    metric?: string;
    period?: string;
  }): Promise<any> {
    const { metric = 'temperature', period = 'last_week' } = params;

    // Calcular datas de início e fim baseado no período
    const { startDate, endDate, aggregationType } = this.calculatePeriodDates(period);

    const periodInDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Para períodos > 7 dias, buscar dados históricos da Archive API
    if (periodInDays > 7) {
      console.log(`📊 Período longo detectado (${periodInDays} dias). Verificando dados históricos...`);

      // Verificar se há dados DIÁRIOS suficientes no MongoDB
      const dailyDataCount = await this.weatherModel.countDocuments({
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
        granularity: 'daily',
      });

      // Buscar o primeiro registro disponível no MongoDB
      const firstRecord = await this.weatherModel
        .findOne({ granularity: 'daily' })
        .sort({ timestamp: 1 })
        .exec();

      const expectedDailyRecords = periodInDays;
      const hasEnoughData = dailyDataCount >= expectedDailyRecords * 0.95; // 95% ao invés de 80%
      const coversStartDate = firstRecord && new Date(firstRecord.timestamp) <= startDate;

      console.log(`📈 Dados diários no MongoDB: ${dailyDataCount}/${expectedDailyRecords}`);
      console.log(`📅 Primeiro registro: ${firstRecord ? new Date(firstRecord.timestamp).toISOString().split('T')[0] : 'nenhum'}`);
      console.log(`📅 Data inicial requisitada: ${startDate.toISOString().split('T')[0]}`);
      console.log(`✅ Cobertura completa: ${hasEnoughData && coversStartDate ? 'SIM' : 'NÃO'}`);

      if (!hasEnoughData || !coversStartDate) {
        console.log(`⚠️  Dados insuficientes. Buscando da Archive API...`);

        // Calcular data inicial limitada a 13 meses atrás
        const archiveStartDate = new Date(startDate);
        const thirteenMonthsAgo = new Date();
        thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

        if (archiveStartDate < thirteenMonthsAgo) {
          archiveStartDate.setTime(thirteenMonthsAgo.getTime());
        }

        // Buscar dados históricos
        const historicalData = await this.fetchHistoricalDataFromArchiveAPI(
          archiveStartDate,
          endDate,
        );

        // Salvar no MongoDB
        if (historicalData.length > 0) {
          try {
            await this.weatherModel.insertMany(historicalData, { ordered: false });
            console.log(`✅ ${historicalData.length} registros históricos salvos no MongoDB`);
          } catch (error) {
            if (error.code === 11000) {
              console.log('⚠️  Alguns dados históricos já existiam');
            } else {
              console.error('❌ Erro ao salvar dados históricos:', error.message);
            }
          }
        }
      }
    }

    // Buscar dados do MongoDB (horários para today/last_week, diários para períodos maiores)
    const data = await this.weatherModel
      .find({
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
        // Para períodos > 7 dias, usar apenas dados diários
        ...(periodInDays > 7 ? { granularity: 'daily' } : {}),
      })
      .sort({ timestamp: 1 })
      .exec();

    console.log(`📊 Dados encontrados para agregação: ${data.length} registros`);

    // Agregar dados conforme o tipo de agregação
    return this.aggregateData(data, metric, aggregationType);
  }

  /**
   * Calcula datas de início/fim e tipo de agregação baseado no período
   */
  private calculatePeriodDates(period: string): {
    startDate: Date;
    endDate: Date;
    aggregationType: 'hour' | 'day' | 'week' | 'month';
  } {
    const now = new Date();
    let endDate = new Date(now);
    let startDate = new Date(now);
    let aggregationType: 'hour' | 'day' | 'week' | 'month' = 'day';

    switch (period) {
      case 'today':
        // Calcular início e fim do dia em UTC considerando timezone de São Paulo (UTC-3)
        // Exemplo: se agora é 07/12/2025 18:00 UTC-3, queremos 07/12/2025 00:00 UTC-3 até 07/12/2025 23:59 UTC-3
        // Converter para UTC: 00:00 UTC-3 = 03:00 UTC, 23:59 UTC-3 = 02:59 UTC do dia seguinte
        const nowLocal = new Date(now.getTime() - 3 * 60 * 60 * 1000); // Converter para UTC-3
        const startLocal = new Date(nowLocal);
        startLocal.setHours(0, 0, 0, 0);
        const endLocal = new Date(nowLocal);
        endLocal.setHours(23, 59, 59, 999);
        
        // Converter de volta para UTC para buscar no banco
        startDate = new Date(startLocal.getTime() + 3 * 60 * 60 * 1000);
        endDate = new Date(endLocal.getTime() + 3 * 60 * 60 * 1000);
        aggregationType = 'hour';
        break;

      case 'last_week':
        startDate.setDate(startDate.getDate() - 7);
        aggregationType = 'day';
        break;

      case 'last_2_weeks':
        startDate.setDate(startDate.getDate() - 14);
        aggregationType = 'week';
        break;

      case 'last_month':
        startDate.setDate(startDate.getDate() - 30);
        aggregationType = 'week';
        break;

      case 'last_3_months':
        startDate.setMonth(startDate.getMonth() - 3);
        aggregationType = 'month';
        break;

      case 'last_6_months':
        startDate.setMonth(startDate.getMonth() - 6);
        aggregationType = 'month';
        break;

      case 'last_12_months':
        startDate.setMonth(startDate.getMonth() - 12);
        aggregationType = 'month';
        break;

      default:
        startDate.setDate(startDate.getDate() - 7);
        aggregationType = 'day';
    }

    return { startDate, endDate, aggregationType };
  }

  /**
   * Gera chave de agrupamento baseado no período
   */
  private getGroupKey(date: Date, groupBy: string): string {
    const d = new Date(date);
    const offset = -3 * 60; // UTC-3
    const localTime = new Date(d.getTime() + offset * 60 * 1000);

    switch (groupBy) {
      case 'hour':
        return `${String(localTime.getUTCDate()).padStart(2, '0')}/${String(localTime.getUTCMonth() + 1).padStart(2, '0')} ${String(localTime.getUTCHours()).padStart(2, '0')}:00`;

      case 'day':
        return `${String(localTime.getUTCDate()).padStart(2, '0')}/${String(localTime.getUTCMonth() + 1).padStart(2, '0')}`;

      case 'week':
        const weekNum = this.getWeekNumber(localTime);
        return `Semana ${weekNum}`;

      case 'month':
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return months[localTime.getUTCMonth()];

      default:
        return localTime.toISOString().split('T')[0];
    }
  }

  /**
   * Calcula número da semana no ano
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Agrega dados conforme o tipo de agregação
   */
  private aggregateData(
    data: WeatherLog[],
    metric: string,
    aggregationType: 'hour' | 'day' | 'week' | 'month',
  ): Array<{ period: string; avg: number; min: number; max: number; count: number }> {
    if (data.length === 0) {
      return [];
    }

    // Agrupar com informações do timestamp para ordenação correta
    const grouped = new Map<string, { logs: WeatherLog[]; firstTimestamp: Date }>();

    data.forEach((log) => {
      const key = this.getGroupKey(log.timestamp, aggregationType);
      if (!grouped.has(key)) {
        grouped.set(key, { logs: [], firstTimestamp: new Date(log.timestamp) });
      }
      const group = grouped.get(key);
      if (group) {
        group.logs.push(log);
        // Manter o timestamp mais antigo
        if (new Date(log.timestamp) < group.firstTimestamp) {
          group.firstTimestamp = new Date(log.timestamp);
        }
      }
    });

    // Calcular estatísticas e formatar labels
    const result: Array<{ period: string; avg: number; min: number; max: number; count: number; timestamp: Date }> = [];

    grouped.forEach((group, key) => {
      const values = group.logs.map((log) => log[metric]).filter((v) => v != null);

      if (values.length > 0) {
        // Para semanas, formatar como "dd/MM-dd/MM"
        let periodLabel = key;
        if (aggregationType === 'week') {
          const offset = -3 * 60; // UTC-3
          const firstDay = new Date(group.firstTimestamp.getTime() + offset * 60 * 1000);
          const lastDay = new Date(firstDay);
          lastDay.setDate(lastDay.getDate() + 6); // Último dia da semana

          periodLabel = `${String(firstDay.getUTCDate()).padStart(2, '0')}/${String(firstDay.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay.getUTCDate()).padStart(2, '0')}/${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}`;
        }

        result.push({
          period: periodLabel,
          avg: this.average(values),
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length,
          timestamp: group.firstTimestamp,
        });
      }
    });

    // Ordenar por timestamp (mais antigo primeiro)
    return result
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .map(({ period, avg, min, max, count }) => ({ period, avg, min, max, count }));
  }
}