@echo off
rem Mr. Johnson dev server — double-click me.
rem Serves this folder at http://localhost:8123 with caching off.
cd /d "%~dp0"
python serve.py 8123
pause
