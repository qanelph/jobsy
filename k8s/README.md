# Kubernetes Deployment

Kubernetes манифесты для Jobsy Platform.

## Структура

```
k8s/
├── template/           # Шаблоны с переменными
│   ├── orchestrator/   # Backend Deployment + Service + RBAC
│   ├── frontend/       # Frontend Deployment + Service
│   ├── postgres/       # PostgreSQL Deployment + Service + PVC
│   └── ingress/        # Ingress с wildcard роутингом
├── render/             # Отрендеренные манифесты (git ignored)
└── render.sh           # Скрипт рендеринга
```

## Deployment

### 1. Настройка переменных окружения

Создайте `.env` файл:

```bash
export ENV_NAME=prod
export PLATFORM_DOMAIN=jobsy.poehali.dev
export CONTAINER_REGISTRY_ID=your-registry-id
export IMAGE_TAG=latest
```

Загрузите переменные:
```bash
source .env
```

### 2. Рендеринг манифестов

```bash
./render.sh
```

Это создаст файлы в `render/` с подставленными значениями.

### 3. Создание namespace

```bash
kubectl create namespace jobs
```

### 4. Создание Secrets

#### PostgreSQL credentials
```bash
kubectl create secret generic prod-postgres-secret \
  --from-literal=username=postgres \
  --from-literal=password=your-secure-password \
  -n jobs
```

#### Orchestrator environment
```bash
kubectl create secret generic prod-orchestrator-env \
  --from-literal=DATABASE_URL=postgresql://postgres:password@postgres-service:5432/orchestrator \
  --from-literal=JWT_SECRET_KEY=your-jwt-secret \
  --from-literal=TELEGRAM_BOT_TOKEN=123456:ABC-DEF... \
  -n jobs
```

#### Frontend environment
```bash
kubectl create secret generic prod-frontend-env \
  --from-literal=NEXT_PUBLIC_TG_BOT_USERNAME=YourBotUsername \
  -n jobs
```

### 5. Применение манифестов

```bash
kubectl apply -f render/ -n jobs
```

### 6. Проверка

```bash
# Проверка подов
kubectl get pods -n jobs

# Проверка сервисов
kubectl get svc -n jobs

# Проверка ingress
kubectl get ingress -n jobs

# Логи orchestrator
kubectl logs -n jobs deployment/orchestrator -f
```

## Архитектура

### Ingress роутинг

```
jobsy.poehali.dev              → frontend-service:80
api.jobsy.poehali.dev          → orchestrator-service:80
*.jobsy.poehali.dev            → agent-proxy-service:80 (для агентов)
```

### Динамическое создание агентов

Когда пользователь создаёт агента через UI:

1. Orchestrator получает запрос POST /agents
2. Создаёт Secret с credentials агента
3. Создаёт PVC для данных агента
4. Создаёт Deployment с jobs контейнером (+ browser sidecar если нужен)
5. Создаёт Service для агента
6. Обновляет Ingress rule:
   - `{agent-name}.jobsy.poehali.dev` → service агента

### RBAC

Orchestrator имеет ServiceAccount `orchestrator-sa` с правами:
- Создавать/удалять Deployments
- Создавать/удалять Services
- Создавать/удалять Secrets
- Создавать/удалять PVCs
- Обновлять Ingress
- Читать Pod logs

## Масштабирование

### Вертикальное (увеличение ресурсов)

Обновите resources в template/orchestrator/deployment.yaml:
```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "1000m"
```

### Горизонтальное (больше реплик)

Orchestrator: 1 реплика (stateful)
Frontend: можно увеличить replicas до 2-3

```bash
kubectl scale deployment frontend --replicas=2 -n jobs
```

## Мониторинг

### Health checks

```bash
# Orchestrator
curl https://api.jobsy.poehali.dev/health

# Frontend
curl https://jobsy.poehali.dev
```

### Логи

```bash
# Все логи в namespace
kubectl logs -n jobs --all-containers=true --selector=app=orchestrator

# Конкретного агента
kubectl logs -n jobs deployment/agent-alice-agent -c jobs
```

## Удаление

### Удалить всё
```bash
kubectl delete namespace jobs
```

### Удалить только агенты (оставить платформу)
```bash
kubectl delete deployment -n jobs -l managed-by=orchestrator
```
