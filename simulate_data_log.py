import json
import time
import random
import os
import math

# --- Parameter Simulasi ---
SIMULATION_DURATION_HOURS = 24  # Mau simulasi berapa jam?
DATA_INTERVAL_SECONDS = 5     # Tiap berapa detik data dikirim?
OUTPUT_FILENAME = "simulated_data_24h_log.jsonl" # Nama file buat nyimpen data log nya
SECTIONS = ['penyemaian', 'peremajaan', 'dewasa'] # Nama2 section greenhouse 

# --- Konfigurasi Sensor (Nilai Rata2 & Fluktuasi) ---
# Ini buat nentuin nilai sensornya nanti kira2 di angka berapa,
# plus seberapa jauh dia bisa naik-turun (fluktuasi),
# sama kemungkinan sensornya error (null_chance = 0.01 artinya 1% kemungkinan error)
SENSOR_CONFIG = {
    'temp': {'baseline': 25, 'fluctuation': 3, 'null_chance': 0.01}, # Suhu rata2 25 C, bisa naik/turun 3 C
    'humidity': {'baseline': 80, 'fluctuation': 10, 'null_chance': 0.01}, # Kelembapan rata2 80%, bisa naik/turun 10%
    'light': {'baseline': 5000, 'fluctuation': 2000, 'null_chance': 0.02} # Cahaya rata2 5000 lux, bisa naik/turun 2000 lux
}
ACTUATOR_MODES = ['auto', 'manual'] # Mode aktuator yg mungkin

# --- Perhitungan Awal ---
total_seconds = SIMULATION_DURATION_HOURS * 60 * 60 # Total detik dalam durasi simulasi
total_data_points = total_seconds // DATA_INTERVAL_SECONDS # Jumlah data point yg akan di generate
start_timestamp = int(time.time()) # Ambil waktu sekarang sbg awal timestamp

print(f"Mulai simulasi data untuk {SIMULATION_DURATION_HOURS} jam ({total_data_points} data points).")
print(f"Interval data: {DATA_INTERVAL_SECONDS} detik.")
print(f"Output akan disimpan di: {OUTPUT_FILENAME}")

# --- Loop Generate Data ---
try:
    # Buka file untuk ditulis ('w' = write)
    with open(OUTPUT_FILENAME, 'w') as f:
        current_timestamp = start_timestamp
        # Looping sebanyak jumlah data point yg dihitung tadi
        for i in range(total_data_points):
            
            # Bikin struktur data JSON dasar untuk iterasi ini
            data_payload = {
                "timestamp": current_timestamp,
                "sections": {}, # Nanti diisi data per section
                "averages": {"temp": 0, "humidity": 0, "light": 0}, # Nanti dihitung rata2nya
                "actuators": { # Bikin data aktuator random aja buat simulasi
                    "fan": {"state": random.choice([True, False]), "mode": random.choice(ACTUATOR_MODES)},
                    "light": {"state": random.choice([True, False]), "mode": random.choice(ACTUATOR_MODES)}
                }
            }

            # Variabel buat ngitung rata2 nanti
            temp_sum = 0
            temp_count = 0
            humidity_sum = 0
            humidity_count = 0
            light_sum = 0
            light_count = 0

            # Loop untuk tiap section (penyemaian, peremajaan, dewasa)
            for section in SECTIONS:
                section_data = {} # Data untuk section ini
                section_trends = {} # Tren nya dibikin simpel aja
                
                # Loop untuk tiap tipe sensor (temp, humidity, light)
                for sensor, config in SENSOR_CONFIG.items():
                    # Cek kemungkinan sensor error (hasilnya null)
                    if random.random() < config['null_chance']:
                        section_data[sensor] = None # Kalo error, nilainya null
                        section_trends[sensor] = "equals" # Tren nya 'equals' aja kalo error
                    else:
                        # Kalo ga error, generate nilai sensor
                        baseline = config['baseline'] 
                        fluctuation = config['fluctuation']
                        # Nilai = baseline + angka random antara (-fluctuation) sampai (+fluctuation)
                        value = baseline + random.uniform(-fluctuation, fluctuation) 
                        
                        # Pastiin nilainya masuk akal (ga terlalu rendah/tinggi) + dibulatkan
                        if sensor == 'temp':
                            value = round(max(15, min(40, value)), 1) # Suhu antara 15-40 C, 1 desimal
                            temp_sum += value
                            temp_count += 1
                        elif sensor == 'humidity':
                            value = round(max(30, min(100, value))) # Kelembapan 30-100%, bulat
                            humidity_sum += value
                            humidity_count += 1
                        elif sensor == 'light':
                            value = round(max(0, min(50000, value))) # Cahaya 0-50000 lux, bulat
                            light_sum += value
                            light_count += 1
                            
                        section_data[sensor] = value # Masukkan nilai ke data section
                        section_trends[sensor] = random.choice(["equals", "up", "down"]) # Tren nya random aja

                section_data["trends"] = section_trends # Masukkan data tren ke data section
                data_payload["sections"][section] = section_data # Masukkan data section ini ke payload utama

            # Hitung rata-rata dari semua sensor yg valid (ga null)
            data_payload["averages"]["temp"] = round(temp_sum / temp_count, 1) if temp_count > 0 else None
            data_payload["averages"]["humidity"] = round(humidity_sum / humidity_count) if humidity_count > 0 else None
            data_payload["averages"]["light"] = round(light_sum / light_count) if light_count > 0 else None

            # Ubah dictionary python jadi string JSON yg compact (ga pake spasi aneh2)
            # trus tambahin newline (\n) biar jadi format JSON Lines
            json_line = json.dumps(data_payload, separators=(',', ':')) 
            f.write(json_line + '\n')

            # Maju ke timestamp berikutnya
            current_timestamp += DATA_INTERVAL_SECONDS

            # Kasih tau progress biar ga dikira hang (tiap 10% lah kira2)
            if (i + 1) % (total_data_points // 10) == 0: 
                 progress_percent = ((i + 1) / total_data_points) * 100
                 print(f"Progress: {progress_percent:.0f}%...") # Pake titik2 biar keliatan jalan hehe

    print("Simulasi selesai! Data sudah ditulis ke file.")

    # --- Hitung Ukuran File ---
    # Setelah selesai nulis, cek ukuran filenya
    file_size_bytes = os.path.getsize(OUTPUT_FILENAME)
    file_size_kb = file_size_bytes / 1024 # Konversi ke Kilobyte
    file_size_mb = file_size_kb / 1024 # Konversi ke Megabyte

    print("\n--- Ukuran File Hasil Simulasi ---")
    print(f"File: {OUTPUT_FILENAME}")
    print(f"Total data point: {total_data_points}")
    print(f"Ukuran file: {file_size_bytes} bytes")
    print(f"Ukuran file: {file_size_kb:.2f} KB")
    print(f"Ukuran file: {file_size_mb:.2f} MB")
    # Hitung rata2 ukuran per data point
    if total_data_points > 0:
        print(f"Rata-rata ukuran per data: {file_size_bytes / total_data_points:.2f} bytes")

# Kalo ada error pas nulis file
except IOError as e:
    print(f"Waduh, error pas nulis file {OUTPUT_FILENAME}: {e}")
# Kalo ada error lain yg ga diduga
except Exception as e:
    print(f"Waduh, ada error aneh: {e}")
