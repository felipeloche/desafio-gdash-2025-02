import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { InsightsCard } from '@/components/dashboard/InsightsCard';
import { TemperatureChart } from '@/components/dashboard/TemperatureChart';
import { RainChart } from '@/components/dashboard/RainChart';
import { WeatherTable } from '@/components/dashboard/WeatherTable';
import { CustomizableChart } from '@/components/dashboard/CustomizableChart';
import { LayoutDashboard, MapPin } from 'lucide-react';
import { weatherService } from '@/services/weather.service';
import { insightsService } from '@/services/insights.service';
import { WeatherLog, Insight } from '@/types';
import { useToast } from '@/components/ui/use-toast';

export function Dashboard() {
  const { toast } = useToast();
  const [weatherLogs, setWeatherLogs] = useState<WeatherLog[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [logsData, insightsData] = await Promise.all([
        weatherService.getForecastRange(),
        insightsService.getLatest(),
      ]);

      setWeatherLogs(logsData);
      setInsights(insightsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar os dados do dashboard.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateInsights() {
    setInsightsLoading(true);
    try {
      await insightsService.generate();
      const latestInsights = await insightsService.getLatest();
      setInsights(latestInsights);
      toast({
        title: 'Insights gerados',
        description: 'Novos insights foram gerados com sucesso!',
      });
    } catch (error) {
      console.error('Error generating insights:', error);
      toast({
        title: 'Erro ao gerar insights',
        description: 'Não foi possível gerar novos insights.',
        variant: 'destructive',
      });
    } finally {
      setInsightsLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <Header title="Dashboard" icon={<LayoutDashboard className="h-6 w-6" />} />

      <div className="space-y-6 p-6">
        {/* Location */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="h-4 w-4" />
          <span>Florianópolis, SC - Brasil</span>
        </div>

        {/* 1. Insights Semanais da IA */}
        <InsightsCard
          insights={insights}
          onGenerate={handleGenerateInsights}
          loading={insightsLoading}
        />

        {/* 2. Previsão de Temperatura e Probabilidade de Chuva */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold">Previsão do Tempo</h2>
            <p className="text-sm text-gray-600">
              Acompanhe a temperatura e probabilidade de chuva
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TemperatureChart data={weatherLogs} />
            <RainChart data={weatherLogs} />
          </div>
        </div>

        {/* 3. Gráfico Customizável */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold">Análise Personalizada</h2>
            <p className="text-sm text-gray-600">
              Crie gráficos customizados com diferentes métricas
            </p>
          </div>

          <CustomizableChart />
        </div>

        {/* 4. Histórico de Registros */}
        <WeatherTable data={weatherLogs} />
      </div>
    </div>
  );
}