import { IsDate, IsNumber, IsString, IsObject, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class LocationDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNumber()
  latitude: number;

  @ApiProperty()
  @IsNumber()
  longitude: number;
}

export class CreateWeatherLogDto {
  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  timestamp: Date;

  @ApiProperty({ type: LocationDto })
  @IsObject()
  location: LocationDto;

  @ApiProperty({ example: 25.5 })
  @IsNumber()
  temperature: number;

  @ApiProperty({ example: 70, minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  humidity: number;

  @ApiProperty({ example: 15.5 })
  @IsNumber()
  windSpeed: number;

  @ApiProperty({ example: 'clear' })
  @IsString()
  condition: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  rainProbability?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  feelsLike?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  pressure?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  rawData?: any;

  // Novos campos para controle de dados
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  isForecast?: boolean;

  @ApiProperty({ required: false, default: 'hourly' })
  @IsOptional()
  @IsString()
  granularity?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  expiresAt?: any;

  // Campos para dados diários
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  temperature_min?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  temperature_max?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  humidity_avg?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  windSpeed_avg?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  rainProbability_avg?: number;
}