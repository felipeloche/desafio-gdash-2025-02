import api from './api';
import type { WeatherLog } from '@/types';

export const weatherService = {
  async exportCSV(): Promise<Blob> {
    const { data } = await api.get('/weather/export/csv', {
      responseType: 'blob',
    });
    return data;
  },

  async exportXLSX(): Promise<Blob> {
    const { data } = await api.get('/weather/export/xlsx', {
      responseType: 'blob',
    });
    return data;
  },

  async getForecastRange(): Promise<WeatherLog[]> {
    const { data } = await api.get<WeatherLog[]>('/weather/forecast-range');
    return data;
  },

  async getCustomChart(params: {
    metric?: string;
    period?: string;
  }): Promise<Array<{
    period: string;
    avg: number;
    min: number;
    max: number;
    count: number;
  }>> {
    const { data } = await api.get('/weather/custom-chart', { params });
    return data;
  },
};