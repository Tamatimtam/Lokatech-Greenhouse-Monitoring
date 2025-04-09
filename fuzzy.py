import matplotlib
matplotlib.use('Agg') # Set backend BEFORE importing pyplot
import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl
import matplotlib.pyplot as plt

# ---------------------------------------------------------
# 1. Definisikan Variabel Input (Antecedents) & Output
#    (Meskipun kita hanya plot input, mendefinisikannya
#     membantu menstrukturkan pemikiran)
# ---------------------------------------------------------

# Tentukan rentang nilai (Universe of Discourse)
# Sesuaikan rentang ini jika perlu
temp_range = np.arange(20, 36, 1)    # Suhu dari 20 hingga 35
hum_range  = np.arange(20, 101, 1)   # Kelembaban dari 50 hingga 100
light_range = np.arange(0, 2001, 50) # Cahaya dari 0 hingga 2000 lux

# Buat variabel fuzzy
suhu = ctrl.Antecedent(temp_range, 'Suhu Udara (°C)')
kelembaban = ctrl.Antecedent(hum_range, 'Kelembaban Relatif (%)')
cahaya = ctrl.Antecedent(light_range, 'Intensitas Cahaya (lux)')

# (Variabel output tidak perlu untuk plot MFs, tapi bisa ditambahkan jika perlu)
# kipas = ctrl.Consequent(np.arange(0, 2, 1), 'Status Kipas')
# lampu = ctrl.Consequent(np.arange(0, 2, 1), 'Status Lampu')

# ---------------------------------------------------------
# 2. Definisikan Fungsi Keanggotaan (Membership Functions - MFs)
#    Menggunakan bentuk trapesium (trapmf) atau segitiga (trimf)
#    Format trapmf: fuzz.trapmf(x, [a, b, c, d])
#    Format trimf:  fuzz.trimf(x, [a, b, c])
# ---------------------------------------------------------

# Suhu MFs (Contoh berdasarkan diskusi, sesuaikan!)
suhu['Dingin'] = fuzz.trapmf(suhu.universe, [20, 20, 24, 27])
suhu['Optimal'] = fuzz.trapmf(suhu.universe, [25, 27, 29, 31])
suhu['Panas'] = fuzz.trapmf(suhu.universe, [30, 32, 35, 35])

# Kelembaban MFs (Contoh berdasarkan diskusi, sesuaikan!)
kelembaban['Kering'] = fuzz.trapmf(kelembaban.universe, [20, 20, 70, 80])
kelembaban['Normal'] = fuzz.trapmf(kelembaban.universe, [75, 85, 85, 95])
kelembaban['Lembab'] = fuzz.trapmf(kelembaban.universe, [90, 95, 95, 100])

# Cahaya MFs
# DARK_FOR_WORK: Trapezoidal, 100% below 100, zero above 200
cahaya['Gelap'] = fuzz.trapmf(cahaya.universe, [0, 0, 200, 450])
# ADEQUATE_FOR_WORK: Trapezoidal, zero below 150, 100% above 250
cahaya['Optimal untuk bekerja'] = fuzz.trapmf(cahaya.universe, [150, 500, 2000, 2000])

# ---------------------------------------------------------
# 3. Plot Fungsi Keanggotaan
# ---------------------------------------------------------

# Atur ukuran plot agar nyaman dilihat
fig, (ax0, ax1, ax2) = plt.subplots(nrows=3, figsize=(8, 9))

# Plot Suhu
ax0.set_title('Fungsi Keanggotaan Suhu Udara')
ax0.plot(temp_range, suhu['Dingin'].mf, 'b', linewidth=1.5, label='Dingin')
ax0.plot(temp_range, suhu['Optimal'].mf, 'g', linewidth=1.5, label='Optimal')
ax0.plot(temp_range, suhu['Panas'].mf, 'r', linewidth=1.5, label='Panas')
ax0.set_ylabel('Derajat Keanggotaan')
ax0.set_xlabel('Suhu (°C)')
ax0.legend()
ax0.spines['top'].set_visible(False)
ax0.spines['right'].set_visible(False)
ax0.grid(True, linestyle='--', alpha=0.6)

# Plot Kelembaban
ax1.set_title('Fungsi Keanggotaan Kelembaban Relatif')
ax1.plot(hum_range, kelembaban['Kering'].mf, 'r', linewidth=1.5, label='Kering')
ax1.plot(hum_range, kelembaban['Normal'].mf, 'g', linewidth=1.5, label='Normal')
ax1.plot(hum_range, kelembaban['Lembab'].mf, 'b', linewidth=1.5, label='Lembab')
ax1.set_ylabel('Derajat Keanggotaan')
ax1.set_xlabel('Kelembaban Relatif (%)')
ax1.legend()
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)
ax1.grid(True, linestyle='--', alpha=0.6)

# Plot Cahaya
ax2.set_title('Fungsi Keanggotaan Intensitas Cahaya')
ax2.plot(light_range, cahaya['Gelap'].mf, 'k', linewidth=1.5, label='Gelap') # Hitam untuk Gelap
ax2.plot(light_range, cahaya['Optimal untuk bekerja'].mf, 'g', linewidth=1.5, label='Optimal untuk bekerja')
ax2.set_ylabel('Derajat Keanggotaan')
ax2.set_xlabel('Intensitas Cahaya (lux)')
ax2.legend()
ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)
ax2.grid(True, linestyle='--', alpha=0.6)

# Sesuaikan layout dan tampilkan
plt.tight_layout()
plt.savefig('fuzzy_membership_functions.png', dpi=300) # Re-enable saving
# plt.show() # Cannot show with Agg backend

print("Grafik fungsi keanggotaan telah disimpan sebagai 'fuzzy_membership_functions.png'") # Re-enable print statement
