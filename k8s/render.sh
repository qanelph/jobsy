#!/bin/bash

# Скрипт для рендеринга K8s манифестов из template/ в render/
# Аналогично airnold/k8s/render.sh

set -e

# Проверка переменных окружения
required_vars=(
    "ENV_NAME"
    "PLATFORM_DOMAIN"
    "CONTAINER_REGISTRY_ID"
    "IMAGE_TAG"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "Error: $var is not set"
        exit 1
    fi
done

echo "Rendering K8s manifests..."
echo "ENV_NAME: $ENV_NAME"
echo "PLATFORM_DOMAIN: $PLATFORM_DOMAIN"
echo "IMAGE_TAG: $IMAGE_TAG"

# Очистка render директории
rm -rf render/*

# Рендеринг всех YAML файлов
find template -name "*.yaml" | while read template_file; do
    # Получаем относительный путь
    relative_path="${template_file#template/}"
    output_file="render/$relative_path"
    
    # Создаём директорию если не существует
    mkdir -p "$(dirname "$output_file")"
    
    # Заменяем переменные
    envsubst < "$template_file" > "$output_file"
    
    echo "✓ Rendered: $output_file"
done

echo ""
echo "Done! Manifests rendered to render/"
echo ""
echo "To apply:"
echo "  kubectl apply -f render/ -n jobs"
