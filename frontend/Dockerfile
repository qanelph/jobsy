FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Копируем всё для dev режима
COPY . .

# Не устанавливаем зависимости - они будут в volume

EXPOSE 3000

CMD ["sh", "-c", "npm install && npm run dev"]
