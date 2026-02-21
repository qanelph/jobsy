#!/bin/bash
set -e

echo "🚀 Запуск Jobsy Platform..."

# Запуск backend (Docker Compose)
echo "📦 Запуск backend (PostgreSQL + Orchestrator)..."
cd orchestrator
docker-compose up -d
cd ..

# Ждём пока backend поднимется
echo "⏳ Ждём backend..."
sleep 5

# Проверка backend
if curl -s http://localhost:9001/health > /dev/null; then
    echo "✅ Backend работает на http://localhost:9001"
else
    echo "❌ Backend не запустился"
    exit 1
fi

# Запуск frontend
echo "🎨 Запуск frontend..."
cd frontend

# Проверка node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
fi

echo "✅ Frontend запускается на http://localhost:9002"
echo ""
echo "🎉 Всё готово!"
echo "   Backend:  http://localhost:9001"
echo "   Frontend: http://localhost:9002"
echo ""

# Запуск frontend (не в фоне, чтобы видеть логи)
npm run dev
