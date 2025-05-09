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
temp_range = np.arange(0, 41, 1)     # Suhu dari 5 hingga 30
hum_range  = np.arange(0, 101, 1)    # Kelembaban dari 40 hingga 90
light_range = np.arange(0, 1000, 50) # Cahaya dari 0 hingga 2000 lux

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

# Suhu MFs - Adjusted for better control
suhu['Dingin'] = fuzz.trapmf(suhu.universe, [-1, -1, 5, 8])      # Falls to 0.5 at 20°C
suhu['Optimal'] = fuzz.trapmf(suhu.universe, [5, 10, 28, 30])    # Full membership 22-24°C, ends at 27°C
suhu['Panas'] = fuzz.trapmf(suhu.universe, [29, 31, 40, 40])      # Starts at 27°C, reaches 0.5 at 30°C

# Kelembaban MFs - Adjusted for new range
kelembaban['Kering'] = fuzz.trapmf(kelembaban.universe, [-1, -1, 40, 50])
kelembaban['Normal'] = fuzz.trapmf(kelembaban.universe, [40, 55, 75, 90])
kelembaban['Lembab'] = fuzz.trapmf(kelembaban.universe, [80, 90, 100, 100])

# Cahaya MFs
# DARK_FOR_WORK: Trapezoidal, 100% below 100, zero above 200
cahaya['Gelap'] = fuzz.trapmf(cahaya.universe, [0, 0, 50, 500])
# ADEQUATE_FOR_WORK: Trapezoidal, zero below 150, 100% above 500
cahaya['Optimal untuk bekerja'] = fuzz.trapmf(cahaya.universe, [150, 500, 1500, 1500])

# ---------------------------------------------------------
# 3. Plot Fungsi Keanggotaan
# ---------------------------------------------------------

# Atur ukuran plot agar nyaman dilihat dan lebih jelas
fig, (ax0, ax1, ax2) = plt.subplots(nrows=3, figsize=(12, 15))

# Detail view for critical transition area
# Create small subplot specifically for optimal-panas transition
# Create subplot for zoomed view of the critical area (29-31°C)
zoom_temp = np.arange(28, 32, 0.1)  # Finer granularity for zoom view
suhu_zoom = ctrl.Antecedent(zoom_temp, 'Suhu Zoom')
suhu_zoom['Optimal'] = fuzz.trapmf(suhu_zoom.universe, [5, 10, 29, 30])
suhu_zoom['Panas'] = fuzz.trapmf(suhu_zoom.universe, [29, 31, 40, 40])

# Plot Suhu
ax0.set_title('Fungsi Keanggotaan Suhu Udara', fontsize=14)
ax0.plot(temp_range, suhu['Dingin'].mf, 'b', linewidth=2.5, label='Dingin')
ax0.plot(temp_range, suhu['Optimal'].mf, 'g', linewidth=2.5, label='Optimal')
ax0.plot(temp_range, suhu['Panas'].mf, 'r', linewidth=2.5, label='Panas')
ax0.set_ylabel('Derajat Keanggotaan', fontsize=12)
ax0.set_xlabel('Suhu (°C)', fontsize=12)
ax0.legend(fontsize=12)
ax0.spines['top'].set_visible(False)
ax0.spines['right'].set_visible(False)
ax0.grid(True, linestyle='--', alpha=0.7)
# Set y-ticks for every 0.1 degree of membership with clearer labels
ax0.set_yticks(np.arange(0, 1.1, 0.1))
ax0.set_yticklabels([f"{y:.1f}" for y in np.arange(0, 1.1, 0.1)], fontsize=10)
# Set x-ticks for every degree to make them clearly visible
ax0.set_xticks(np.arange(0, 41, 1))
ax0.set_xticklabels([f"{x}" if x % 5 == 0 else "" for x in range(0, 41)], fontsize=10)
ax0.tick_params(axis='y', which='major', length=6)
ax0.set_xlim([0, 40])
# Highlight transition points at 0.5 membership
ax0.axhline(y=0.5, color='gray', linestyle='--', alpha=0.5)
ax0.text(6.5, 0.52, '0.5', fontsize=10, ha='center')

# Plot Kelembaban
ax1.set_title('Fungsi Keanggotaan Kelembaban Relatif', fontsize=14)
ax1.plot(hum_range, kelembaban['Kering'].mf, 'r', linewidth=2.5, label='Kering')
ax1.plot(hum_range, kelembaban['Normal'].mf, 'g', linewidth=2.5, label='Normal')
ax1.plot(hum_range, kelembaban['Lembab'].mf, 'b', linewidth=2.5, label='Lembab')
ax1.set_ylabel('Derajat Keanggotaan', fontsize=12)
ax1.set_xlabel('Kelembaban Relatif (%)', fontsize=12)
ax1.legend(fontsize=12)
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)
ax1.grid(True, linestyle='--', alpha=0.7)
# Set y-ticks for every 0.1 degree of membership with clearer labels
ax1.set_yticks(np.arange(0, 1.1, 0.1))
ax1.set_yticklabels([f"{y:.1f}" for y in np.arange(0, 1.1, 0.1)], fontsize=10)
# Set x-ticks for clearer display
ax1.set_xticks(np.arange(0, 101, 1))
ax1.set_xticklabels([f"{x}" if x % 10 == 0 else "" for x in range(0, 101)], fontsize=10)
ax1.tick_params(axis='y', which='major', length=6)
ax1.set_xlim([0, 100])
# Highlight transition points
ax1.axhline(y=0.5, color='gray', linestyle='--', alpha=0.5)

# Plot Cahaya
ax2.set_title('Fungsi Keanggotaan Intensitas Cahaya', fontsize=14)
ax2.plot(light_range, cahaya['Gelap'].mf, 'k', linewidth=2.5, label='Gelap') # Hitam untuk Gelap
ax2.plot(light_range, cahaya['Optimal untuk bekerja'].mf, 'g', linewidth=2.5, label='Optimal untuk bekerja')
ax2.set_ylabel('Derajat Keanggotaan', fontsize=12)
ax2.set_xlabel('Intensitas Cahaya (lux)', fontsize=12)
ax2.legend(fontsize=12)
ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)
ax2.grid(True, linestyle='--', alpha=0.7)
# Set y-ticks for every 0.1 degree of membership with clearer labels
ax2.set_yticks(np.arange(0, 1.1, 0.1))
ax2.set_yticklabels([f"{y:.1f}" for y in np.arange(0, 1.1, 0.1)], fontsize=10)
# Set x-ticks for clearer display
ax2.set_xticks(np.arange(0, 1001, 50))
ax2.set_xticklabels([f"{x}" if x % 200 == 0 else "" for x in range(0, 1001, 50)], fontsize=10)
ax2.tick_params(axis='y', which='major', length=6)
# Highlight transition points
ax2.axhline(y=0.5, color='gray', linestyle='--', alpha=0.5)

# Tambahkan subplot khusus untuk zoom-in pada area transisi Optimal-Panas
# Ini akan membuat subplot tersendiri yang menampilkan detail transisi
fig2, ax_zoom = plt.subplots(figsize=(8, 4))
ax_zoom.set_title('Detail Transisi: Suhu Optimal - Panas (29-31°C)', fontsize=14)
ax_zoom.plot(zoom_temp, suhu_zoom['Optimal'].mf, 'g', linewidth=2.5, label='Optimal')
ax_zoom.plot(zoom_temp, suhu_zoom['Panas'].mf, 'r', linewidth=2.5, label='Panas')
ax_zoom.set_ylabel('Derajat Keanggotaan', fontsize=12)
ax_zoom.set_xlabel('Suhu (°C)', fontsize=12)
ax_zoom.legend(fontsize=12)
ax_zoom.spines['top'].set_visible(False)
ax_zoom.spines['right'].set_visible(False)
ax_zoom.grid(True, linestyle='--', alpha=0.7)
ax_zoom.set_yticks(np.arange(0, 1.1, 0.1))
ax_zoom.set_yticklabels([f"{y:.1f}" for y in np.arange(0, 1.1, 0.1)], fontsize=10)
ax_zoom.set_xticks(np.arange(28, 32.1, 0.2))
ax_zoom.set_xlim([28, 32])
ax_zoom.axhline(y=0.5, color='gray', linestyle='--', alpha=0.5)
ax_zoom.text(30, 0.52, '0.5', fontsize=10, ha='center')
plt.savefig('fuzzy_transition_detail.png', dpi=300)

# Sesuaikan layout dan tampilkan
plt.figure(fig.number)  # Kembali ke figure utama
plt.tight_layout()
plt.savefig('fuzzy_membership_functions.png', dpi=300) # Re-enable saving
# plt.show() # Cannot show with Agg backend

print("Grafik fungsi keanggotaan telah disimpan sebagai 'fuzzy_membership_functions.png'") # Re-enable print statement
