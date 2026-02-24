FROM python:3.11-slim

WORKDIR /app

# Установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование кода
COPY src/ ./src/
COPY alembic/ ./alembic/
COPY alembic.ini .

# Создание .env файла по умолчанию (будет переопределён в docker-compose)
ENV DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/jobsy
ENV JWT_SECRET_KEY=change-me-in-production

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
