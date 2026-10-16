import os
import re

# Patrones seguros para detectar secretos
PATRONES = [
    re.compile(r'api[_-]?key\s*[:=]\s*[\'"][0-9a-zA-Z_-]{16,}[\'"]', re.IGNORECASE),
    re.compile(r'password\s*[:=]\s*[\'"].+?[\'"]', re.IGNORECASE),
    re.compile(r'bearer\s+[0-9a-zA-Z_\-\.=]+', re.IGNORECASE),
    re.compile(r'ghp_[0-9a-zA-Z]{36}', re.IGNORECASE)
]

EXCLUIDOS = ['.png', '.jpg', '.jpeg', '.db', '.zip', '.pdf', 'escanear.py', 'gitleaks.exe']
encontrados = False
ruta_raiz = os.getcwd()

for carpeta_actual, _, archivos in os.walk(ruta_raiz):
    if '.venv' in carpeta_actual or 'node_modules' in carpeta_actual or '.git' in carpeta_actual:
        continue
    for archivo in archivos:
        if any(archivo.endswith(ext) for ext in EXCLUIDOS):
            continue
        ruta_archivo = os.path.join(carpeta_actual, archivo)
        try:
            with open(ruta_archivo, 'r', encoding='utf-8', errors='ignore') as f:
                for num_linea, linea in enumerate(f, 1):
                    for patron in PATRONES:
                        if patron.search(linea):
                            print(f"[ALERTA] Posible secreto en: {ruta_archivo} (Línea {num_linea})")
                            encontrados = True
        except Exception:
            pass

if not encontrados:
    print("Escaneo finalizado: No se encontraron patrones sospechosos de credenciales.")