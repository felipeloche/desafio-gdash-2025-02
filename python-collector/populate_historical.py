import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List
import requests
import pika
from dotenv import load_dotenv

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Carregar variáveis de ambiente
load_dotenv()

class HistoricalDataPopulator:
    """
    Popula dados históricos da API Open-Meteo Archive.

    A API Archive permite buscar dados desde 1940 até alguns dias atrás.
    Útil para popular o banco de dados com histórico para análises comparativas.
    """

    def __init__(self):
        # USAR FORECAST API (mesma que dashboard e collector) para consistência total
        # Forecast API retorna histórico recente + previsão futura
        self.forecast_api_url = 'https://api.open-meteo.com/v1/forecast'
        self.location_name = os.getenv('LOCATION_NAME', 'Florianopolis')
        self.location_lat = float(os.getenv('LOCATION_LAT', -27.5935))
        self.location_lon = float(os.getenv('LOCATION_LON', -48.5589))
        self.location_timezone = os.getenv('LOCATION_TIMEZONE', 'America/Sao_Paulo')

        self.rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@rabbitmq:5672')
        self.rabbitmq_queue = os.getenv('RABBITMQ_QUEUE', 'weather-data')

        # Configurações de período - 7 dias de dados (mesma fonte do dashboard)
        self.days_back = 7

        logger.info(f"🏛️  Historical Data Populator inicializado")
        logger.info(f"📍 Local: {self.location_name}")
        logger.info(f"📅 Período: últimos {self.days_back} dias (API Forecast - mesma do dashboard)")

    def fetch_historical_data(self, start_date: str, end_date: str) -> List[Dict]:
        """
        Busca dados da API Forecast (mesma do dashboard e collector).
        
        IMPORTANTE: Usa Forecast API para TOTAL CONSISTÊNCIA com dashboard header.
        Todos os dados vêm da mesma fonte: Open-Meteo Forecast API.

        Args:
            start_date: Data inicial no formato YYYY-MM-DD
            end_date: Data final no formato YYYY-MM-DD

        Returns:
            Lista de registros climáticos processados
        """
        try:
            # Forecast API: past_days=8 garante 7 dias completos + HOJE até agora
            # forecast_days=0 para não pegar previsão futura
            params = {
                'latitude': self.location_lat,
                'longitude': self.location_lon,
                'hourly': 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
                'timezone': self.location_timezone,
                'past_days': 8,  # 8 dias inclui HOJE até a hora atual
                'forecast_days': 0,  # Não pegar previsão futura
            }

            logger.info(f"🔍 Buscando dados de {start_date} até {end_date} (API Forecast - mesma do dashboard)...")
            response = requests.get(self.forecast_api_url, params=params, timeout=30)
            response.raise_for_status()

            data = response.json()

            # Processar dados horários
            hourly_data = data.get('hourly', {})
            times = hourly_data.get('time', [])

            if not times:
                logger.warning("⚠️  Nenhum dado retornado pela API")
                return []

            records = []
            now = datetime.now()  # Hora atual
            
            for i, timestamp_str in enumerate(times):
                # Converter timestamp ISO para datetime
                timestamp = datetime.fromisoformat(timestamp_str)
                
                # FILTRO: Pegar APENAS dados ATÉ AGORA (não previsão futura)
                if timestamp > now:
                    continue  # Pular dados futuros (previsão)

                weather_code = hourly_data.get('weather_code', [])[i] if i < len(hourly_data.get('weather_code', [])) else 0

                # Calcular expiresAt: 7 dias a partir do timestamp
                expires_at = timestamp + timedelta(days=7)

                record = {
                    'timestamp': timestamp.isoformat() + 'Z',
                    'location': {
                        'name': self.location_name,
                        'latitude': self.location_lat,
                        'longitude': self.location_lon,
                    },
                    'temperature': hourly_data.get('temperature_2m', [])[i] if i < len(hourly_data.get('temperature_2m', [])) else 0,
                    'humidity': hourly_data.get('relative_humidity_2m', [])[i] if i < len(hourly_data.get('relative_humidity_2m', [])) else 0,
                    'windSpeed': hourly_data.get('wind_speed_10m', [])[i] if i < len(hourly_data.get('wind_speed_10m', [])) else 0,
                    'condition': self._map_weather_code(weather_code),
                    'expiresAt': expires_at.isoformat() + 'Z',
                    'isForecast': False,
                    'granularity': 'hourly',
                }
                records.append(record)

            logger.info(f"✅ {len(records)} registros processados")
            return records

        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Erro ao buscar dados da API: {e}")
            return []
        except Exception as e:
            logger.error(f"❌ Erro inesperado: {e}")
            return []

    def send_to_queue(self, record: Dict) -> bool:
        """Enviar registro individual para fila RabbitMQ"""
        try:
            parameters = pika.URLParameters(self.rabbitmq_url)
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()

            channel.queue_declare(queue=self.rabbitmq_queue, durable=True)

            message = json.dumps(record)
            channel.basic_publish(
                exchange='',
                routing_key=self.rabbitmq_queue,
                body=message,
                properties=pika.BasicProperties(delivery_mode=2)
            )

            connection.close()
            return True

        except Exception as e:
            logger.error(f"❌ Erro ao enviar para fila: {e}")
            return False

    def send_batch_to_queue(self, records: List[Dict], batch_size: int = 100):
        """
        Enviar registros em lotes para RabbitMQ.

        Args:
            records: Lista de registros a serem enviados
            batch_size: Tamanho do lote (padrão: 100)
        """
        try:
            parameters = pika.URLParameters(self.rabbitmq_url)
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()

            channel.queue_declare(queue=self.rabbitmq_queue, durable=True)

            total = len(records)
            success_count = 0

            for i, record in enumerate(records):
                try:
                    message = json.dumps(record)
                    channel.basic_publish(
                        exchange='',
                        routing_key=self.rabbitmq_queue,
                        body=message,
                        properties=pika.BasicProperties(delivery_mode=2)
                    )
                    success_count += 1

                    # Log a cada batch_size registros
                    if (i + 1) % batch_size == 0:
                        logger.info(f"📤 Progresso: {i + 1}/{total} registros enviados")

                except Exception as e:
                    logger.error(f"❌ Erro ao enviar registro {i}: {e}")

            connection.close()
            logger.info(f"✅ Total enviado: {success_count}/{total} registros")

        except Exception as e:
            logger.error(f"❌ Erro fatal ao enviar lote: {e}")

    def _map_weather_code(self, code: int) -> str:
        """Mapear código WMO para condição legível"""
        code_map = {
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
        }
        return code_map.get(code, 'unknown')

    def populate(self, chunk_days: int = 7):
        """
        Popula dados históricos dos últimos 7 dias usando API Forecast (mesma do dashboard).
        
        IMPORTANTE: Forecast API = MESMA fonte do dashboard header (consistência total).
        Usa parâmetro past_days=7 para pegar últimos 7 dias.

        Args:
            chunk_days: Tamanho do chunk (padrão 7 dias)
        """
        logger.info("=" * 80)
        logger.info("🏛️  INICIANDO POPULAÇÃO DE DADOS HISTÓRICOS")
        logger.info("=" * 80)
        logger.info("📡 Usando API Forecast (MESMA do dashboard e collector)")
        logger.info(f"📅 Período: últimos {self.days_back} dias")

        # Forecast API com past_days retorna últimos 7 dias automaticamente
        # Não precisa calcular datas manualmente - API faz isso
        end_date = datetime.now()
        start_date = end_date - timedelta(days=self.days_back)
        
        records = self.fetch_historical_data(
            start_date.strftime('%Y-%m-%d'),
            end_date.strftime('%Y-%m-%d')
        )

        if records:
            logger.info(f"📤 Enviando {len(records)} registros para RabbitMQ...")
            self.send_batch_to_queue(records, batch_size=100)
            total_records = len(records)
        else:
            logger.warning("⚠️  Nenhum registro retornado pela API")

        logger.info("\n" + "=" * 80)
        logger.info(f"✅ POPULAÇÃO CONCLUÍDA!")
        logger.info(f"📊 Total de registros enviados: {total_records}")
        logger.info(f"⏱️  Go Worker processará os dados e salvará no MongoDB")
        logger.info("=" * 80)


def main():
    """Função principal"""
    populator = HistoricalDataPopulator()

    # Popular últimos 7 dias da API Forecast (mesma fonte do dashboard)
    populator.populate()


if __name__ == '__main__':
    main()
