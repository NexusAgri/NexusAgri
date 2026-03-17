module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { lat, lon, city } = req.query;

    // Step 1: resolve coordinates
    let latitude, longitude, locationName;

    if (lat && lon) {
      latitude = parseFloat(lat);
      longitude = parseFloat(lon);
      // Reverse geocode via wttr.in just for name
      try {
        const gr = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
          headers: { 'User-Agent': 'TernakOS/1.0' }
        });
        const gd = await gr.json();
        locationName = gd.address?.city || gd.address?.town || gd.address?.village || gd.address?.county || `${lat},${lon}`;
      } catch { locationName = `${lat},${lon}`; }
    } else {
      // Geocode city name to coordinates
      const cityName = city || 'Mojosari';
      try {
        const gr = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`, {
          headers: { 'User-Agent': 'TernakOS/1.0' }
        });
        const gd = await gr.json();
        if (gd && gd[0]) {
          latitude = parseFloat(gd[0].lat);
          longitude = parseFloat(gd[0].lon);
          locationName = gd[0].display_name.split(',').slice(0,2).join(', ');
        } else {
          // Fallback: Mojosari coordinates
          latitude = -7.5472;
          longitude = 112.4564;
          locationName = cityName;
        }
      } catch {
        latitude = -7.5472;
        longitude = 112.4564;
        locationName = cityName;
      }
    }

    // Step 2: fetch real-time weather from Open-Meteo (free, no API key, very accurate)
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FJakarta&forecast_days=5`;

    const weatherRes = await fetch(weatherUrl);
    const weatherData = await weatherRes.json();

    const current = weatherData.current;
    const daily = weatherData.daily;

    // WMO weather code to description
    function wmoDesc(code) {
      const codes = {
        0: 'Cerah', 1: 'Sebagian Cerah', 2: 'Berawan Sebagian', 3: 'Mendung',
        45: 'Berkabut', 48: 'Embun Beku',
        51: 'Gerimis Ringan', 53: 'Gerimis Sedang', 55: 'Gerimis Lebat',
        61: 'Hujan Ringan', 63: 'Hujan Sedang', 65: 'Hujan Lebat',
        71: 'Salju Ringan', 73: 'Salju Sedang', 75: 'Salju Lebat',
        80: 'Hujan Lokal', 81: 'Hujan Lokal Sedang', 82: 'Hujan Lokal Lebat',
        95: 'Petir', 96: 'Petir dengan Hujan Es', 99: 'Petir Lebat',
      };
      return codes[code] || 'Berawan';
    }

    const dayNames = ['Hari ini', 'Besok', 'Lusa', '4 Hari Lagi', '5 Hari Lagi'];

    res.status(200).json({
      temp: Math.round(current.temperature_2m),
      feels_like: Math.round(current.apparent_temperature),
      humidity: current.relative_humidity_2m,
      desc: wmoDesc(current.weather_code),
      wind_kmph: Math.round(current.wind_speed_10m),
      precip: current.precipitation,
      location: locationName,
      forecast: daily.time.slice(0, 5).map((date, i) => ({
        date: date,
        day: dayNames[i],
        max: Math.round(daily.temperature_2m_max[i]),
        min: Math.round(daily.temperature_2m_min[i]),
        desc: wmoDesc(daily.weather_code[i]),
        precip: daily.precipitation_sum[i]
      }))
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
