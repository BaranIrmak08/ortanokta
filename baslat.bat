@echo off
rem Orta Nokta'yi yerelde baslatir: toplu tasima sunucusu (MOTIS) + site sunucusu.
rem Ilk kurulum icin README.md'ye bak.
cd /d "%~dp0motis"
start "Orta Nokta - MOTIS" motis.exe server
cd /d "%~dp0"
start "Orta Nokta - Site" python sunucu.py
timeout /t 3 >nul
start http://localhost:5173
