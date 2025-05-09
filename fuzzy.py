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
suhu['Optimal'] = fuzz.trapmf(suhu.universe, [5, 10, 29, 31])    # Full membership 22-24°C, ends at 27°C
suhu['Panas'] = fuzz.trapmf(suhu.universe, [30, 32, 40, 40])      # Starts at 27°C, reaches 0.5 at 30°C

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

# Find and mark the 0.5 membership intersections for each temperature function
# For Dingin-Optimal transition
dingin_mf = suhu['Dingin'].mf
for i in range(len(temp_range)-1):
    if (dingin_mf[i] >= 0.5 and dingin_mf[i+1] < 0.5):
        dingin_x = np.interp(0.5, [dingin_mf[i+1], dingin_mf[i]], [temp_range[i+1], temp_range[i]])
        ax0.plot([dingin_x, dingin_x], [0, 0.5], 'b--', linewidth=1.5)
        ax0.text(dingin_x,  -0.05, f'{dingin_x:.1f}°C', fontsize=5, ha='center', color='blue', weight='bold')
        break

# For Optimal-Panas transition (around 30°C)
optimal_mf = suhu['Optimal'].mf
panas_mf = suhu['Panas'].mf
for i in range(29, len(temp_range)-1):  # Start from 29°C
    if (optimal_mf[i] >= 0.5 and optimal_mf[i+1] < 0.5):
        optimal_x2 = np.interp(0.5, [optimal_mf[i+1], optimal_mf[i]], [temp_range[i+1], temp_range[i]])
        ax0.plot([optimal_x2, optimal_x2], [0, 0.5], 'g--', linewidth=1.5)
        ax0.text(optimal_x2,  -0.05, f'{optimal_x2:.1f}°C', fontsize=5, ha='center', color='green', weight='bold')
        break

# For Optimal (lower transition point, around 7°C)
for i in range(5, 10):  # Check around 5-10°C
    if (optimal_mf[i] < 0.5 and optimal_mf[i+1] >= 0.5):
        optimal_x1 = np.interp(0.5, [optimal_mf[i], optimal_mf[i+1]], [temp_range[i], temp_range[i+1]])
        ax0.plot([optimal_x1, optimal_x1], [0, 0.5], 'g--', linewidth=1.5)
        ax0.text(optimal_x1,  -0.05, f'{optimal_x1:.1f}°C', fontsize=5, ha='center', color='green', weight='bold')
        break

# For Panas (find where it crosses 0.5)
for i in range(29, len(temp_range)-1):
    if (panas_mf[i] < 0.5 and panas_mf[i+1] >= 0.5):
        panas_x = np.interp(0.5, [panas_mf[i], panas_mf[i+1]], [temp_range[i], temp_range[i+1]])
        ax0.plot([panas_x, panas_x], [0, 0.5], 'r--', linewidth=1.5)
        ax0.text(panas_x,  -0.05, f'{panas_x:.1f}°C', fontsize=5, ha='center', color='red', weight='bold')
        break

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

# Find intersections with 0.5 line for humidity functions and mark them
# For Kering
kering_mf = kelembaban['Kering'].mf
for i in range(40, 60):  # Approximate range where transition occurs
    if (kering_mf[i] >= 0.5 and kering_mf[i+1] < 0.5):
        kering_x = np.interp(0.5, [kering_mf[i+1], kering_mf[i]], [i+1, i])
        ax1.plot([kering_x, kering_x], [0, 0.5], 'r--', linewidth=1.5)
        ax1.text(kering_x,  -0.05, f'{kering_x:.1f}%', fontsize=5, ha='center', color='red', weight='bold')
        break

# For Normal (both transitions)
normal_mf = kelembaban['Normal'].mf
# First transition (lower)
for i in range(40, 60):  # Approximate range where transition occurs
    if (normal_mf[i] < 0.5 and normal_mf[i+1] >= 0.5):
        normal_x1 = np.interp(0.5, [normal_mf[i], normal_mf[i+1]], [i, i+1])
        ax1.plot([normal_x1, normal_x1], [0, 0.5], 'g--', linewidth=1.5)
        ax1.text(normal_x1,  -0.05, f'{normal_x1:.1f}%', fontsize=5, ha='center', color='green', weight='bold')
        break

# Second transition (upper)
for i in range(80, 95):  # Approximate range where transition occurs
    if (normal_mf[i] >= 0.5 and normal_mf[i+1] < 0.5):
        normal_x2 = np.interp(0.5, [normal_mf[i+1], normal_mf[i]], [i+1, i])
        ax1.plot([normal_x2, normal_x2], [0, 0.5], 'g--', linewidth=1.5)
        ax1.text(normal_x2,  -0.05, f'{normal_x2:.1f}%', fontsize=5, ha='center', color='green', weight='bold')
        break

# For Lembab
lembab_mf = kelembaban['Lembab'].mf
for i in range(80, 95):  # Approximate range where transition occurs
    if (lembab_mf[i] < 0.5 and lembab_mf[i+1] >= 0.5):
        lembab_x = np.interp(0.5, [lembab_mf[i], lembab_mf[i+1]], [i, i+1])
        ax1.plot([lembab_x, lembab_x], [0, 0.5], 'b--', linewidth=1.5)
        ax1.text(lembab_x,  -0.05, f'{lembab_x:.1f}%', fontsize=5, ha='center', color='blue', weight='bold')
        break

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

# Find intersections with 0.5 line for light intensity functions
# For Gelap
gelap_mf = cahaya['Gelap'].mf
for i in range(0, len(light_range)-1):  # Check full range to find intersection
    if (gelap_mf[i] >= 0.5 and gelap_mf[i+1] < 0.5):
        gelap_x = np.interp(0.5, [gelap_mf[i+1], gelap_mf[i]], [light_range[i+1], light_range[i]])
        ax2.plot([gelap_x, gelap_x], [0, 0.5], 'k--', linewidth=1.5)
        ax2.text(gelap_x,  -0.05, f'{gelap_x:.1f} lux', fontsize=5, ha='center', color='black', weight='bold')
        break

# For Optimal
optimal_mf = cahaya['Optimal untuk bekerja'].mf
for i in range(6, len(light_range)-1):  # Check in reasonable range (~300-350 lux)
    if (optimal_mf[i] < 0.5 and optimal_mf[i+1] >= 0.5):
        optimal_x = np.interp(0.5, [optimal_mf[i], optimal_mf[i+1]], [light_range[i], light_range[i+1]])
        ax2.plot([optimal_x, optimal_x], [0, 0.5], 'g--', linewidth=1.5)
        ax2.text(optimal_x,  -0.05, f'{optimal_x:.1f} lux', fontsize=5, ha='center', color='green', weight='bold')
        break

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

# Find intersection with 0.5 line in the zoomed view
# For Optimal
for i in range(len(zoom_temp)-1):
    if (suhu_zoom['Optimal'].mf[i] >= 0.5 and suhu_zoom['Optimal'].mf[i+1] < 0.5):
        optimal_x = np.interp(0.5, [suhu_zoom['Optimal'].mf[i+1], suhu_zoom['Optimal'].mf[i]], 
                             [zoom_temp[i+1], zoom_temp[i]])
        ax_zoom.plot([optimal_x, optimal_x], [0, 0.5], 'g--', linewidth=1.5)
        ax_zoom.text(optimal_x,  -0.05, f'{optimal_x:.2f}°C', fontsize=5, ha='center', color='green', weight='bold')
        break

# For Panas
for i in range(len(zoom_temp)-1):
    if (suhu_zoom['Panas'].mf[i] < 0.5 and suhu_zoom['Panas'].mf[i+1] >= 0.5):
        panas_x = np.interp(0.5, [suhu_zoom['Panas'].mf[i], suhu_zoom['Panas'].mf[i+1]], 
                            [zoom_temp[i], zoom_temp[i+1]])
        ax_zoom.plot([panas_x, panas_x], [0, 0.5], 'r--', linewidth=1.5)
        ax_zoom.text(panas_x,  -0.05, f'{panas_x:.2f}°C', fontsize=5, ha='center', color='red', weight='bold')
        break
plt.savefig('fuzzy_transition_detail.png', dpi=300)

# Sesuaikan layout dan tampilkan
plt.figure(fig.number)  # Kembali ke figure utama
plt.tight_layout()
plt.savefig('fuzzy_membership_functions.png', dpi=300) # Re-enable saving
# plt.show() # Cannot show with Agg backend

print("Grafik fungsi keanggotaan telah disimpan sebagai 'fuzzy_membership_functions.png'") # Re-enable print statement
