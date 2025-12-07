import os
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional
import requests
import pika
from dotenv import load_dotenv
from populate_historical import HistoricalDataPopulator

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Carregar variáveis de ambiente
load_dotenv()

class WeatherCollector:
    def __init__(self):
        self.weather_api_url = os.getenv('WEATHER_API_URL', 'https://api.open-meteo.com/v1/forecast')
        self.location_name = os.getenv('LOCATION_NAME', 'Florianopolis')
        self.location_lat = float(os.getenv('LOCATION_LAT', -27.5935))
        self.location_lon = float(os.getenv('LOCATION_LON', -48.5589))
        self.location_timezone = os.getenv('LOCATION_TIMEZONE', 'America/Sao_Paulo')
        
        self.rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672')
        self.rabbitmq_queue = os.getenv('RABBITMQ_QUEUE', 'weather-data')
        
        self.collection_interval = int(os.getenv('COLLECTION_INTERVAL_SECONDS', 3600))
        
        logger.info(f"Collector inicializado para {self.location_name}")
        logger.info(f"Intervalo de coleta: {self.collection_interval}s")

    def collect_weather_data(self) -> Optional[Dict]:
        """Coletar dados da API Open-Meteo"""
        try:
            # Usar EXATAMENTE os mesmos parâmetros do frontend para consistência
            params = {
                'latitude': self.location_lat,
                'longitude': self.location_lon,
                'current': 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
                'timezone': self.location_timezone,
            }
            
            logger.info(f"Coletando dados climáticos de {self.location_name}...")
            response = requests.get(self.weather_api_url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            # Mapear weather_code para condição
            weather_code = data['current'].get('weather_code', 0)
            condition = self._map_weather_code(weather_code)
            
            # Normalizar timestamp para hora cheia (00:00:00)
            now = datetime.utcnow()
            rounded_time = now.replace(minute=0, second=0, microsecond=0)
            
            # Calcular expiresAt: 7 dias a partir da hora normalizada
            expires_at = rounded_time + timedelta(days=7)

            # Estruturar dados
            weather_data = {
                'timestamp': rounded_time.isoformat() + 'Z',
                'location': {
                    'name': self.location_name,
                    'latitude': self.location_lat,
                    'longitude': self.location_lon,
                },
                'temperature': data['current'].get('temperature_2m', 0),
                'humidity': data['current'].get('relative_humidity_2m', 0),
                'windSpeed': data['current'].get('wind_speed_10m', 0),
                'condition': condition,
                'rainProbability': self._calculate_rain_probability(
                    data['current'].get('precipitation', 0),
                    data['current'].get('rain', 0)
                ),
                'feelsLike': data['current'].get('apparent_temperature', 0),
                'pressure': data['current'].get('pressure_msl', 0),
                'rawData': data,
                # Novos campos
                'isForecast': False,  # Dados coletados são sempre reais (não previsão)
                'granularity': 'hourly',
                'expiresAt': expires_at.isoformat() + 'Z',
            }
            
            logger.info(f"✅ Dados coletados: {weather_data['temperature']}°C, {weather_data['humidity']}%, {condition}")
            return weather_data
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Erro ao coletar dados da API: {e}")
            return None
        except Exception as e:
            logger.error(f"❌ Erro inesperado: {e}")
            return None

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

    def _calculate_rain_probability(self, precipitation: float, rain: float) -> int:
        """Calcular probabilidade de chuva baseado nos dados"""
        if rain > 0 or precipitation > 0:
            return min(100, int((rain + precipitation) * 20))
        return 0

    def send_to_queue(self, data: Dict) -> bool:
        """Enviar dados para fila RabbitMQ"""
        try:
            # Conectar ao RabbitMQ
            parameters = pika.URLParameters(self.rabbitmq_url)
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()
            
            # Declarar fila
            channel.queue_declare(queue=self.rabbitmq_queue, durable=True)
            
            # Enviar mensagem
            message = json.dumps(data)
            channel.basic_publish(
                exchange='',
                routing_key=self.rabbitmq_queue,
                body=message,
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Mensagem persistente
                )
            )
            
            logger.info(f"✅ Dados enviados para fila '{self.rabbitmq_queue}'")
            
            connection.close()
            return True
            
        except pika.exceptions.AMQPConnectionError as e:
            logger.error(f"❌ Erro de conexão com RabbitMQ: {e}")
            return False
        except Exception as e:
            logger.error(f"❌ Erro ao enviar para fila: {e}")
            return False

    def run_once(self):
        """Executar coleta uma vez"""
        logger.info("=" * 60)
        logger.info(f"Iniciando coleta - {datetime.now()}")
        
        data = self.collect_weather_data()
        
        if data:
            success = self.send_to_queue(data)
            if success:
                logger.info("✅ Coleta concluída com sucesso")
            else:
                logger.error("❌ Falha ao enviar dados para fila")
        else:
            logger.error("❌ Falha ao coletar dados")
        
        logger.info("=" * 60)

    def run_continuous(self):
        """Executar coleta continuamente"""
        logger.info("🚀 Iniciando coletor contínuo...")
        logger.info(f"📍 Local: {self.location_name}")
        logger.info(f"⏱️  Intervalo: {self.collection_interval}s")
        
        # População de histórico desabilitada para evitar duplicatas
        # Se precisar popular histórico, execute: docker exec -it weaither-python-collector python populate_historical.py
        logger.info("ℹ️  População de dados históricos desabilitada (evita duplicatas)")

        # Executar imediatamente na primeira vez
        try:
            self.run_once()
        except Exception as e:
            logger.error(f"❌ Erro na primeira execução: {e}")

        while True:
            try:
                # Calcular tempo até a próxima hora cheia
                now = datetime.now()
                next_run = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
                sleep_seconds = (next_run - now).total_seconds()
                
                logger.info(f"⏳ Aguardando {int(sleep_seconds)}s até a próxima hora cheia ({next_run.strftime('%H:%M')})...")
                time.sleep(sleep_seconds)
                
                self.run_once()
                
            except KeyboardInterrupt:
                logger.info("\n⏹️  Coletor interrompido pelo usuário")
                break
            except Exception as e:
                logger.error(f"❌ Erro no loop principal: {e}")
                logger.info("⏳ Aguardando 60s antes de tentar novamente...")
                time.sleep(60)

if __name__ == '__main__':
    collector = WeatherCollector()
    collector.run_continuous()