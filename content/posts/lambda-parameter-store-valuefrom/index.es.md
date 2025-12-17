---
title: "Por Qué AWS Lambda No Soporta ValueFrom para Variables de Entorno (Y Cómo Solucionarlo)"
date: 2025-12-23T10:00:00-00:00
lastmod: 2025-12-23T10:00:00-00:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "El camino desde la generación de .env en tiempo de build hasta la carga desde Parameter Store en tiempo de ejecución para funciones Lambda, los desafíos de rate limiting, y por qué ECS tiene una funcionalidad que Lambda necesita desesperadamente."

tags: ["DevOps", "AWS", "Lambda", "Parameter Store", "SSM", "ECS", "Terraform", "Serverless"]
categories: ["DevOps"]

lightgallery: true

toc:
  auto: true

code:
  copy: true
  maxShownLines: 50

math:
  enable: false

mermaid: true
---

Si alguna vez has mirado las definiciones de tareas de ECS con envidia desde el lado de Lambda, no estás solo.

<!--more-->

Si usas AWS Lambda para workers en segundo plano, listeners o tareas programadas, probablemente has lidiado con la gestión de secretos. Los secretos típicamente se almacenan en AWS Parameter Store, pero los pipelines de CI/CD a menudo los obtienen en tiempo de build y los incorporan en archivos `.env` que se envían con cada paquete Lambda. Cuando decides migrar a la carga de Parameter Store en **tiempo de ejecución**—como hace ECS nativamente con `valueFrom`—descubres una diferencia fundamental entre cómo ECS y Lambda manejan las variables de entorno. Una que puede causar semanas de depuración de errores de throttling.

Esta es la historia de esa migración, las pesadillas de rate limiting, y cómo encontrar finalmente un equilibrio.

## El Punto de Partida: Archivos .env Generados por CI/CD

Antes de la migración, los secretos ya están en AWS Parameter Store, pero los pipelines de CI/CD los obtienen en tiempo de build y generan archivos `.env` dinámicamente:

{{< mermaid >}}
flowchart LR
    subgraph AWS["AWS Parameter Store"]
        Params["Parámetros<br/>/myapp/prod/*"]
    end
    
    subgraph CICD["Pipeline CI/CD"]
        Fetch["Obtener Parámetros"]
        Generate["Generar archivo .env"]
        Build["Build & Empaquetar"]
    end
    
    subgraph Lambda["Funciones Lambda"]
        L1["Lambda 1<br/>(con .env incluido)"]
        L2["Lambda 2<br/>(con .env incluido)"]
        L3["Lambda N..."]
    end
    
    Params -->|"aws ssm get-parameters"| Fetch
    Fetch --> Generate
    Generate -->|"archivo .env"| Build
    Build -->|"Inyección en build-time"| Lambda
    
    style Params fill:#90EE90,stroke:#333,color:#000
    style Fetch fill:#FFE4B5,stroke:#333,color:#000
    style Generate fill:#FFE4B5,stroke:#333,color:#000
    style Build fill:#FFE4B5,stroke:#333,color:#000
{{< /mermaid >}}

### Cómo Funciona

El pipeline de CI/CD:
1. Se autentica en AWS
2. Ejecuta un script para obtener todos los parámetros de Parameter Store
3. Genera un archivo `.env` con todos los valores
4. Construye el paquete Lambda con el archivo `.env` incluido
5. Despliega el paquete

### Los Problemas

1. **Build-time vs runtime** - Las variables se incorporan en los paquetes Lambda en tiempo de build, no se obtienen en tiempo de ejecución
2. **Redespliegue para rotación** - Cambiar un secreto en Parameter Store requiere redesplegar cada Lambda
3. **Pipelines de CI/CD largos** - El paso de obtención de parámetros añade tiempo a cada build
4. **Estado inconsistente** - Si un despliegue falla a mitad de camino, algunos Lambdas tienen secretos nuevos, otros tienen los antiguos
5. **Sin actualizaciones dinámicas** - No se puede actualizar la configuración sin un ciclo completo de despliegue

## El Sueño: ValueFrom al Estilo ECS

Cuando miras cómo ECS maneja esto, encuentras la solución elegante que deseas:

```hcl
# Definición de Tarea ECS - Variables de entorno desde Parameter Store
resource "aws_ecs_task_definition" "api" {
  container_definitions = jsonencode([{
    secrets = [
      {
        name      = "DATABASE_PASSWORD"
        valueFrom = "arn:aws:ssm:us-west-2:123456789012:parameter/myapp/prod/DATABASE_PASSWORD"
      },
      {
        name      = "API_KEY"
        valueFrom = "arn:aws:ssm:us-west-2:123456789012:parameter/myapp/prod/API_KEY"
      }
      # ... 130+ variables más
    ]
  }])
}
```

**Lo que sucede con ECS:**
1. La tarea inicia
2. El agente de ECS obtiene todos los parámetros de Parameter Store
3. Los parámetros se inyectan como variables de entorno
4. El contenedor inicia con `process.env.DATABASE_PASSWORD` ya configurado
5. **El código de la aplicación no sabe ni le importa de dónde vienen las variables de entorno**

Esto es hermoso. El contenedor no tiene conocimiento de dónde vienen sus variables de entorno. Es pura inyección de variables de entorno, manejada por la plataforma.

## La Realidad: Lambda No Soporta ValueFrom

Aquí está la verdad dolorosa: **AWS Lambda no soporta `valueFrom` ni `secrets` en la configuración de variables de entorno.**

```hcl
# Función Lambda - Esto es TODO lo que puedes hacer
resource "aws_lambda_function" "worker" {
  function_name = "my-worker"
  
  environment {
    variables = {
      # Solo valores estáticos permitidos
      NODE_ENV      = "production"
      RELEASE_STAGE = "production"
      # No se puede hacer: DATABASE_PASSWORD = valueFrom("arn:aws:ssm:...")
    }
  }
}
```

Las variables de entorno de Lambda son:
- **Solo strings estáticos** - Sin referencias a Parameter Store, Secrets Manager, o cualquier fuente externa
- **Establecidas en tiempo de despliegue** - No se obtienen en tiempo de ejecución
- **Visibles en la Consola de AWS** - Cualquiera con acceso a Lambda puede verlas
- **Límite total de 4KB** - Todas las variables de entorno combinadas no pueden exceder 4KB

### Por Qué Esto Importa

Si quieres que Lambda use secretos de Parameter Store:
1. Tu **código de aplicación** debe obtenerlos
2. Necesitas manejar la **autenticación a SSM**
3. Necesitas manejar el **caché** (o no)
4. Necesitas manejar **errores y reintentos**
5. **Los cold starts se vuelven más lentos** - Cada cold start potencialmente significa llamadas API a Parameter Store

## La Solución: Carga de Parameter Store en Runtime

Como Lambda no puede hacer `valueFrom`, lo construyes tú mismo en la capa de aplicación:

{{< mermaid >}}
flowchart TB
    subgraph Lambda["Cold Start de Lambda"]
        Init["Handler Lambda Invocado"]
        Load["loadEnvVarsFromParameterStore()"]
        SSM["Cliente AWS SSM"]
        Validate["Validar & Combinar"]
        Ready["Aplicación Lista"]
    end
    
    subgraph AWS["AWS Parameter Store"]
        Params["130+ Parámetros<br/>/myapp/prod/*"]
    end
    
    Init --> Load
    Load --> SSM
    SSM -->|"GetParametersByPath<br/>(10 params por llamada)"| Params
    Params -->|"Respuesta paginada"| SSM
    SSM --> Validate
    Validate --> Ready
    
    style Init fill:#FFE4B5,stroke:#333,color:#000
    style Load fill:#87CEEB,stroke:#333,color:#000
    style SSM fill:#DDA0DD,stroke:#333,color:#000
    style Params fill:#90EE90,stroke:#333,color:#000
    style Ready fill:#90EE90,stroke:#333,color:#000
{{< /mermaid >}}

### El Código de Aplicación

Crea un cargador de env que obtiene parámetros durante la inicialización de Lambda:

```typescript
// env.aws.loader.ts
import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm"
import { from, expand, reduce, EMPTY, of } from "rxjs"

const AWS_ENV_MAP: Record<ReleaseStage, string> = {
  sandbox: "sandbox",
  development: "dev",
  staging: "staging",
  production: "prod",
}

export const getParameterPath = (releaseStage: ReleaseStage): string => 
  `/myapp/${AWS_ENV_MAP[releaseStage]}/`

export const loadEnvVarsFromParameterStore: EnvVarsLoader = () => {
  // Omitir en ambientes de prueba
  if (isTestNodeEnv) return of({})

  const ssmClient = createSsmClient()
  const releaseStage = getReleaseStage()
  const paramPath = getParameterPath(releaseStage)

  console.log("loadEnvVarsFromParameterStore:", { releaseStage, paramPath })
  console.time("loadedEnvVarsFromParameterStore")

  return from(getParametersByPath(ssmClient, paramPath)).pipe(
    // Manejar paginación - GetParametersByPath devuelve máx 10 a la vez
    expand(({ NextToken, Parameters }, index) => {
      const count = Parameters?.length || 0
      console.log("loadedEnvVarsFromParameterStore:", { index, count })
      return NextToken ? getParametersByPath(ssmClient, paramPath, NextToken) : EMPTY
    }),
    // Combinar todas las páginas en un solo objeto
    reduce((acc, output) => {
      return { ...acc, ...mapParametersToEnvVars(output) }
    }, {} as EnvVars),
    tap(() => {
      console.timeEnd("loadedEnvVarsFromParameterStore")
    }),
  )
}
```

### El Lado de Terraform

Cada módulo Lambda incluye automáticamente los permisos de Parameter Store:

```hcl
# Módulo Lambda - Políticas requeridas para todos los Lambdas
locals {
  required_policies = [
    # Política de acceso a Parameter Store
    {
      actions = [
        "ssm:GetParametersByPath",
        "ssm:GetParameters",
        "ssm:GetParameter"
      ]
      resources = [
        "arn:aws:ssm:${local.aws_region}:${local.aws_account_id}:parameter/${local.app_parameters_path[var.release_stage]}/*"
      ]
    },
    # Política de descifrado KMS para parámetros SecureString
    {
      actions   = ["kms:Decrypt"]
      resources = ["arn:aws:kms:${local.aws_region}:${local.aws_account_id}:key/alias/aws/ssm"]
    }
  ]
}
```

## El Desastre: Rate Exceeded

Todo funciona genial en desarrollo. Luego despliegas a producción con 25+ funciones Lambda, y el caos comienza:

```
ThrottlingException: Rate exceeded
```

### Entendiendo los Límites de Rate de Parameter Store

AWS Parameter Store tiene **límites de throughput por defecto muy bajos**:

| Tier | GetParameter / GetParameters | GetParametersByPath |
|------|------------------------------|---------------------|
| Standard | 40 TPS compartidos | 40 TPS compartidos |
| Advanced | 100 TPS compartidos | 100 TPS compartidos |

**TPS = Transacciones Por Segundo**, y es **compartido entre todas las llamadas API en la cuenta**.

### El Problema Matemático

Hagamos las cuentas:
- Tienes **130+ parámetros** por ambiente
- `GetParametersByPath` devuelve **máx 10 parámetros por llamada** (límite de AWS)
- Así que cada cold start de Lambda necesita **13+ llamadas API** para cargar todos los parámetros
- Tienes **25+ funciones Lambda**
- Durante un despliegue, **todas las 25 funciones hacen cold start simultáneamente**

**25 funciones × 13 llamadas API = 325 llamadas API** en segundos

Con un límite de 40 TPS, estás **8x sobre la cuota** durante los despliegues.

### Síntomas

- Timeouts aleatorios de Lambda durante el despliegue
- Fallos intermitentes en todas las funciones
- Algunas funciones iniciando bien, otras fallando
- Sin patrón claro—cualquier función que alcance el rate limit falla

## La Solución: Reducir las Llamadas API a Parameter Store

Existen varias opciones:

### Opción 1: Habilitar High Throughput en la Configuración de Parameter Store

AWS te permite aumentar el límite de throughput directamente en la consola de Parameter Store:

1. Ve a **AWS Systems Manager → Parameter Store → Settings**
2. En **Parameter Store throughput**, selecciona **High throughput limit**
3. Esto aumenta tu límite de 40 TPS a **1,000 TPS**

{{< admonition type=warning title="Consideración de Costos" >}}
El high throughput genera cargos adicionales por llamada API sobre el límite del tier estándar. Revisa los [precios de AWS](https://aws.amazon.com/systems-manager/pricing/) para las tarifas actuales.
{{< /admonition >}}

Esta es una victoria rápida y algo que deberías habilitar inmediatamente, pero no resuelve el problema fundamental de hacer demasiadas llamadas API.

### Opción 2: Agregar Lógica de Reintento con Modo Adaptativo

Configura tu cliente SSM con modo de reintento adaptativo y aumenta los intentos máximos:

```typescript
import { SSMClient } from "@aws-sdk/client-ssm"

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION,
  retryMode: "adaptive",
  maxAttempts: 5,
})
```

**¿Por qué modo adaptativo?**
- Ajusta automáticamente los delays de reintento basándose en las respuestas de error
- Usa backoff exponencial con jitter
- Maneja errores de throttling (429) con gracia
- Mejor que el modo de reintento "standard" por defecto para escenarios de alta concurrencia

Esto ayuda significativamente durante las estampidas de despliegue, pero aún podrías ver throttling ocasional con muchos cold starts concurrentes.

### Opción 3: Pasar No-Secretos como Variables de Entorno de Lambda

Este es el enfoque recomendado. El insight clave:

**No todos los 130+ parámetros son secretos.**

Muchos son solo configuración:
- Endpoints de API (`EXTERNAL_API_BASE_URL`, `WEBHOOK_URL`)
- Feature flags (`FEATURE_X_ENABLED`, `API_V2_THRESHOLD`)
- Identificadores de recursos (`SENTRY_DSN`, `ANALYTICS_APP_ID`)
- URLs de colas (`PROCESSING_QUEUE_URL`, `NOTIFICATION_QUEUE_URL`)

Estos pueden ser variables de entorno de Lambda con seguridad porque:
1. No son sensibles
2. Ya son visibles en el código de Terraform
3. No necesitan rotación

{{< mermaid >}}
flowchart TB
    subgraph Terraform["Despliegue Terraform"]
        NonSecrets["Parámetros No-Secretos<br/>(90+ valores)"]
        Secrets["Parámetros Secretos<br/>(40+ valores)"]
    end
    
    subgraph Lambda["Configuración Lambda"]
        EnvVars["environment {<br/>variables = {...}<br/>}"]
        IAM["Política IAM para SSM"]
    end
    
    subgraph Runtime["Runtime de Lambda"]
        ProcessEnv["process.env<br/>(No-secretos listos)"]
        SSMFetch["Fetch SSM<br/>(Solo secretos)"]
        Merged["Config Combinada"]
    end
    
    NonSecrets -->|"Inyección directa"| EnvVars
    Secrets -->|"Permanecen en SSM"| IAM
    
    EnvVars --> ProcessEnv
    IAM --> SSMFetch
    ProcessEnv --> Merged
    SSMFetch -->|"Solo ~4 llamadas API<br/>en vez de 13+"| Merged
    
    style NonSecrets fill:#90EE90,stroke:#333,color:#000
    style Secrets fill:#FFE4B5,stroke:#333,color:#000
    style ProcessEnv fill:#87CEEB,stroke:#333,color:#000
    style SSMFetch fill:#DDA0DD,stroke:#333,color:#000
{{< /mermaid >}}

{{< admonition type=warning title="Recuerda el Límite de 4KB" >}}
Las variables de entorno de Lambda tienen un **límite total de 4KB** para todas las variables combinadas. Antes de mover parámetros a variables de entorno, calcula tu tamaño total:

```bash
# Verifica el tamaño de tus env vars en bytes
echo -n "KEY1=value1\nKEY2=value2\n..." | wc -c
```

Si estás cerca del límite, puede que necesites ser selectivo sobre qué variables pasar directamente.
{{< /admonition >}}

#### Una Nota sobre Código Compartido y Simplificación

En nuestro caso, pasamos **todas** las variables de entorno no secretas a **cada** función Lambda. ¿Por qué? Porque compartimos un método común de validación de entorno en todas las funciones—el mismo código que valida las variables requeridas se ejecuta en cada Lambda.

Esta es una simplificación que intercambia eficiencia por consistencia:
- ✅ **Pros:** Única fuente de verdad, más fácil de mantener, sin sorpresas de "variable faltante"
- ❌ **Contras:** Cada Lambda recibe variables que puede no necesitar, usa más del presupuesto de 4KB

**Mejora futura:** Dividir la lógica de validación y pasar solo las variables que cada Lambda realmente necesita. Esto requiere más configuración de Terraform pero es más eficiente para funciones Lambda con requisitos específicos y limitados.

### Las Nuevas Matemáticas

- **Antes:** 130 params ÷ 10 por llamada = **13 llamadas API por cold start**
- **Después:** 40 secretos ÷ 10 por llamada = **4 llamadas API por cold start**

**25 funciones × 4 llamadas API = 100 llamadas API** - Bien bajo el límite de 40 TPS distribuido en varios segundos.

### Cambios de Implementación

**Módulo Terraform Lambda:**

```hcl
resource "aws_lambda_function" "this" {
  function_name = var.lambda_name
  
  environment {
    variables = merge(
      {
        NODE_PATH     = "/opt/nodejs/node_modules"
        NODE_ENV      = var.node_env
        RELEASE_STAGE = var.release_stage
      },
      var.non_secret_env_vars  # Nuevo: Pasar no-secretos directamente
    )
  }
}
```

**Código de Aplicación:**

```typescript
export const loadEnvVarsFromParameterStore: EnvVarsLoader = () => {
  if (isTestNodeEnv) return of({})

  const ssmClient = createSsmClient()
  const releaseStage = getReleaseStage()
  
  // Ahora solo obtener la ruta de secretos
  const secretsPath = `/myapp/${AWS_ENV_MAP[releaseStage]}/secrets/`
  
  // ... resto de la lógica de carga
}
```

## Bonus: Script de Despliegue con Lógica de Reintento

Para desarrollo local y depuración, crea un script que maneje el throttling de Parameter Store con gracia:

```bash
#!/bin/bash
# get-env-vars.sh - Obtiene todas las vars de env con backoff exponencial

function GetParameterStoreValues() {
  local max_retries=5
  local backoff=2
  
  while true; do
    attempt=1
    while [[ $attempt -le $max_retries ]]; do
      params=$(aws ssm get-parameters-by-path \
        --path "$paramNamePrefix" \
        --region $REGION \
        --recursive \
        --with-decryption \
        $tokenParam)

      if [[ $? -eq 0 ]]; then
        break
      fi

      # Añadir jitter para prevenir efecto manada
      local backoff_with_jitter=$(add_jitter $backoff)
      echo "🔄 Throttling detectado, reintentando en $backoff_with_jitter segundos..." >&2
      sleep $backoff_with_jitter
      backoff=$((backoff * 2))
      attempt=$((attempt + 1))
    done
    
    # Manejar paginación...
  done
}
```

El jitter es crucial—sin él, múltiples procesos paralelos reintentan exactamente al mismo tiempo y golpean el rate limit de nuevo.

## Lo Que Desearíamos Que AWS Agregara

Si pudieras pedirle a AWS una funcionalidad de Lambda, sería:

```hcl
# SUEÑO: Lambda con soporte valueFrom
resource "aws_lambda_function" "worker" {
  function_name = "my-worker"
  
  environment {
    variables = {
      NODE_ENV = "production"
    }
    # Por favor, AWS, agrega esto:
    secrets = [
      {
        name      = "DATABASE_PASSWORD"
        valueFrom = "arn:aws:ssm:us-west-2:123456789012:parameter/myapp/prod/DATABASE_PASSWORD"
      }
    ]
  }
}
```

Esto:
1. Eliminaría el código SSM a nivel de aplicación para Lambda
2. Movería las llamadas API a la fase de init de Lambda (problema de AWS, no nuestro)
3. Permitiría a AWS optimizar y cachear entre instancias de función
4. Proporcionaría paridad con ECS, EKS, y otros servicios de cómputo

## Lecciones Aprendidas

### 1. Build-Time vs Runtime: Un Cambio Fundamental

Pasar de archivos `.env` generados por CI/CD a carga de Parameter Store en runtime no es solo un cambio técnico—es un modelo operacional diferente. La carga en runtime significa rotación de secretos más rápida pero añade latencia al cold start.

### 2. ECS y Lambda No Son Iguales

A pesar de que ambos son "serverless" (en el sentido de que no gestionas servidores), tienen capacidades fundamentalmente diferentes. ECS obtiene `valueFrom` gratis; Lambda te hace construirlo tú mismo.

### 3. Los Rate Limits Se Componen con la Escala

40 TPS suena razonable hasta que tienes 25 funciones haciendo 13 llamadas API cada una. Siempre calcula tu peor escenario (estampida de despliegue).

### 4. No Todo Necesita Ser un Secreto

Separar secretos de configuración reduce las llamadas API y simplifica la depuración (puedes ver la config no-secreta en la consola de Lambda).

### 5. Construye Resiliencia para los Límites de API de AWS

El backoff exponencial con jitter no es opcional—es requerido para cualquier sistema en producción usando APIs de AWS a escala.

## La Comparación: Variables de Entorno ECS vs Lambda

| Capacidad | ECS | Lambda |
|-----------|-----|--------|
| Variables de entorno estáticas | ✅ | ✅ |
| `valueFrom` Parameter Store | ✅ | ❌ |
| `valueFrom` Secrets Manager | ✅ | ❌ |
| Inyección automática de secretos | ✅ | ❌ |
| Código de aplicación para secretos | No necesario | Requerido |
| Impacto en cold start | Ninguno | +200-500ms |
| Rate limits de llamadas API | AWS maneja | Tú manejas |

## Conclusión

Pasar de generación de `.env` en build-time a carga de Parameter Store en runtime es la decisión correcta para flexibilidad operacional—los secretos ahora pueden rotarse sin redesplegar Lambdas. Pero la falta de soporte `valueFrom` de Lambda lo hace más complejo de lo esperado.

Si estás planeando una migración similar:

1. **Audita tus parámetros** - Separa secretos de configuración
2. **Calcula tu matemática de llamadas API** - Parámetros ÷ 10 × cantidad de funciones
3. **Implementa reintentos con backoff** - Vas a golpear rate limits
4. **Considera pasar no-secretos como vars de env de Lambda** - Reduce llamadas API dramáticamente
5. **Vigila tus tiempos de cold start** - Las llamadas SSM añaden latencia

Equipo de Lambda, si están leyendo esto: por favor agreguen soporte para `valueFrom`. ECS lo ha tenido por años. Nos encantaría dejar de escribir código de carga SSM en cada proyecto basado en Lambda.

---

*¿Has lidiado con desafíos similares? Me encantaría escuchar tus soluciones. Encuéntrame en [LinkedIn](https://linkedin.com/in/carimfadil).*

