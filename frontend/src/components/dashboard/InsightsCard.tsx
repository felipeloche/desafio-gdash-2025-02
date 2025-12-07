import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Insight } from '@/types';
import ReactMarkdown from 'react-markdown';

interface InsightsCardProps {
  insights: Insight[];
  onGenerate: () => void;
  loading?: boolean;
}

export function InsightsCard({ insights, onGenerate, loading }: InsightsCardProps) {
  // Encontrar o insight de IA (o mais recente do tipo summary com source 'Google Gemini AI')
  const aiInsight = insights.find(
    (i) => i.type === 'summary' && i.metadata?.source === 'Google Gemini AI'
  );

  return (
    <div className="space-y-4">
      {/* AI Insight Card */}
      {aiInsight ? (
        <Card className="border-2 border-green-100 bg-[#e6faf5]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-600" />
                <CardTitle className="text-cyan-900">{aiInsight.title}</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerate}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Gerar Nova Análise
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none prose-headings:text-cyan-900 prose-p:text-gray-700 prose-strong:text-cyan-800">
              <ReactMarkdown>{aiInsight.content}</ReactMarkdown>
            </div>
            <div className="mt-4 text-xs text-gray-500">
              Gerado em: {new Date(aiInsight.generatedAt).toLocaleString('pt-BR')}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-2 border-green-100 bg-[#e6faf5]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-600" />
                <CardTitle className="text-cyan-900">Insights de IA</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerate}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Gerar Insights
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">
              Nenhum insight disponível. Clique em "Gerar Insights" para criar análises com IA.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}