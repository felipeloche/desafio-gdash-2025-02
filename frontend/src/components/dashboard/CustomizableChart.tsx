import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3, RefreshCw } from 'lucide-react';
import { weatherService } from '@/services/weather.service';
import { useToast } from '@/components/ui/use-toast';

const METRICS = [
  { value: 'temperature', label: 'Temperatura (°C)' },
  { value: 'humidity', label: 'Umidade (%)' },
  { value: 'windSpeed', label: 'Velocidade do Vento (km/h)' },
  { value: 'rainProbability', label: 'Probabilidade de Chuva (%)' },
  { value: 'feelsLike', label: 'Sensação Térmica (°C)' },
  { value: 'pressure', label: 'Pressão (hPa)' },
];

const PERIODS = [
  { value: 'today', label: 'Hoje' },
  { value: 'last_week', label: 'Última Semana' },
  { value: 'last_month', label: 'Último Mês' },
  { value: 'last_3_months', label: 'Últimos 3 Meses' },
  { value: 'last_6_months', label: 'Últimos 6 Meses' },
  { value: 'last_12_months', label: 'Últimos 12 Meses' },
];

export function CustomizableChart() {
  const { toast } = useToast();
  const [metric, setMetric] = useState('temperature');
  const [period, setPeriod] = useState('last_week');
  const [data, setData] = useState<Array<{
    period: string;
    avg: number;
    min: number;
    max: number;
    count: number;
  }>>([]);
  const [loading, setLoading] = useState(false);

  async function handleGenerateChart() {
    setLoading(true);
    try {
      const chartData = await weatherService.getCustomChart({ metric, period });
      setData(chartData);
    } catch (error) {
      console.error('Error loading chart data:', error);
      toast({
        title: 'Erro ao carregar gráfico',
        description: 'Não foi possível carregar os dados do gráfico.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const metricLabel = METRICS.find((m) => m.value === metric)?.label || 'Métrica';
  const periodLabel = PERIODS.find((p) => p.value === period)?.label || 'Período';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Gráfico Personalizável
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Controles */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium">Métrica</label>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a métrica" />
              </SelectTrigger>
              <SelectContent>
                {METRICS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium">Período</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateChart}
            disabled={loading}
            className="md:w-auto"
          >
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Carregando...
              </>
            ) : (
              'Gerar Gráfico'
            )}
          </Button>
        </div>

        {/* Gráfico */}
        {data.length > 0 ? (
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="period"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: '#666' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: '#666' }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  formatter={(value: number) => [
                    `${value.toFixed(1)}`,
                    metricLabel,
                  ]}
                  labelFormatter={(label) => `Período: ${label}`}
                />
                <Bar dataKey="avg" fill="#14b8a6" name="Média" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[400px] items-center justify-center text-gray-500">
            <div className="text-center">
              <BarChart3 className="mx-auto mb-2 h-12 w-12 text-gray-400" />
              <p>Selecione a métrica e o período, depois clique em "Gerar Gráfico"</p>
            </div>
          </div>
        )}

        {/* Legenda */}
        {data.length > 0 && (
          <div className="mt-4 rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-700">
              Mostrando: <span className="text-primary">{metricLabel}</span> -{' '}
              <span className="text-primary">{periodLabel}</span>
            </p>
            <p className="text-xs text-gray-600">
              {data.length} período(s) com dados disponíveis
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
