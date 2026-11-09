@echo off
rem Orta Nokta'yi yerelde baslatir: toplu tasima sunucusu (MOTIS) + site.
rem Ilk kurulum: python veri\indir.py, python veri\hazirla.py, motis klasorunde motis.exe import
cd /d "%~dp0motis"
start "Orta Nokta - MOTIS" motis.exe server
cd /d "%~dp0"
start "Orta Nokta - Site" python -m http.server 5173
timeout /t 3 >nul
start http://localhost:5173
