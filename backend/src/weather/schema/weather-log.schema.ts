import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class WeatherLog extends Document {
  @Prop({ required: true })
  timestamp: Date;

  @Prop({ type: Object, required: true })
  location: {
    name: string;
    latitude: number;
    longitude: number;
  };

  @Prop({ required: true })
  temperature: number; // Celsius

  @Prop({ required: true })
  humidity: number; // Percentage

  @Prop({ required: true })
  windSpeed: number; // km/h

  @Prop({ required: true })
  condition: string; // clear, cloudy, rainy, etc.

  @Prop()
  rainProbability?: number; // Percentage

  @Prop()
  feelsLike?: number; // Celsius

  @Prop()
  pressure?: number; // hPa

  @Prop({ type: Object })
  rawData?: any; // Dados brutos da API

  // Novos campos para controle de dados
  @Prop({ default: false })
  isForecast: boolean; // true = previsão, false = dado real

  @Prop({ default: 'hourly', enum: ['hourly', 'daily'] })
  granularity: string; // 'hourly' ou 'daily'

  @Prop({ type: Date })
  expiresAt?: Date; // TTL index (7 dias para hourly, 13 meses para daily)

  // Campos para dados diários (agregação)
  @Prop()
  temperature_min?: number; // Temperatura mínima do dia

  @Prop()
  temperature_max?: number; // Temperatura máxima do dia

  @Prop()
  humidity_avg?: number; // Umidade média do dia

  @Prop()
  windSpeed_avg?: number; // Velocidade do vento média

  @Prop()
  rainProbability_avg?: number; // Probabilidade de chuva média
}

export const WeatherLogSchema = SchemaFactory.createForClass(WeatherLog);

// Criar índices
WeatherLogSchema.index({ timestamp: 1 });
WeatherLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
WeatherLogSchema.index({ granularity: 1, timestamp: -1 });
// Índice único composto para evitar duplicatas (mesmo timestamp + mesma localização)
WeatherLogSchema.index({ timestamp: 1, 'location.name': 1 }, { unique: true });