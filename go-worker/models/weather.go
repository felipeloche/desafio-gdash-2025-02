package models

import "time"

// Location representa a localização geográfica
type Location struct {
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// WeatherData representa os dados climáticos recebidos do RabbitMQ
type WeatherData struct {
	Timestamp       time.Time   `json:"timestamp"`
	Location        Location    `json:"location"`
	Temperature     float64     `json:"temperature"`
	Humidity        float64     `json:"humidity"`
	WindSpeed       float64     `json:"windSpeed"`
	Condition       string      `json:"condition"`
	RainProbability *float64    `json:"rainProbability,omitempty"`
	FeelsLike       *float64    `json:"feelsLike,omitempty"`
	Pressure        *float64    `json:"pressure,omitempty"`
	RawData         interface{} `json:"rawData,omitempty"`

	// Novos campos para controle de dados
	IsForecast      bool        `json:"isForecast"`
	Granularity     string      `json:"granularity"`
	ExpiresAt       *time.Time  `json:"expiresAt,omitempty"`

	// Campos para dados diários
	TemperatureMin  *float64    `json:"temperature_min,omitempty"`
	TemperatureMax  *float64    `json:"temperature_max,omitempty"`
	HumidityAvg     *float64    `json:"humidity_avg,omitempty"`
	WindSpeedAvg    *float64    `json:"windSpeed_avg,omitempty"`
	RainProbAvg     *float64    `json:"rainProbability_avg,omitempty"`
}

// APIResponse representa a resposta da API NestJS
type APIResponse struct {
	ID        string    `json:"_id,omitempty"`
	Message   string    `json:"message,omitempty"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"createdAt,omitempty"`
}