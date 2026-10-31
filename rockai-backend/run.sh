#!/bin/bash
echo "========================================================"
echo "INICIANDO SERVICO LOCAL ROCK AI PRO (FASTAPI + IA)"
echo "========================================================"
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
