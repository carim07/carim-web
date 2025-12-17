---
title: "Deja de Usar Credenciales AWS de Larga Duración en CI/CD: Guía de GitHub OIDC"
date: 2025-12-16T10:00:00-00:00
lastmod: 2025-12-16T10:00:00-00:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "Cómo eliminar credenciales AWS de larga duración de los pipelines CI/CD implementando GitHub OIDC con encadenamiento de roles para despliegues multi-cuenta."

tags: ["DevOps", "AWS", "GitHub Actions", "OIDC", "Seguridad", "IAM", "Terraform", "CI/CD"]
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

Las credenciales de larga duración son una bomba de tiempo. Así es como desactivarlas.

<!--more-->

Al migrar de CircleCI a GitHub Actions, hay una elección: copiar el enfoque existente de access keys de AWS (el camino fácil) o finalmente implementar algo que se ha estado postergando—autenticación basada en OIDC. Elegir lo segundo puede transformar tu postura de seguridad de la noche a la mañana.

Esto no es solo un tutorial. Es una guía para implementar GitHub OIDC en un entorno AWS multi-cuenta con múltiples repositorios, múltiples cuentas AWS, y una arquitectura de encadenamiento de roles que te lleva de "credenciales que nunca expiran" a "credenciales que duran 15 minutos."

## El Problema: Credenciales de Larga Duración en Todas Partes

Antes de OIDC, la autenticación típica de CI/CD se ve así:

{{< mermaid >}}
flowchart LR
    subgraph CircleCI["Entorno CircleCI"]
        EnvVars["Variables de Entorno<br/>AWS_ACCESS_KEY_ID<br/>AWS_SECRET_ACCESS_KEY"]
    end
    
    subgraph AWS["Cuentas AWS"]
        Sandbox["Cuenta Sandbox"]
        Dev["Cuenta Desarrollo"]
        Staging["Cuenta Staging"]
        Prod["Cuenta Producción"]
    end
    
    EnvVars -->|"Credenciales Estáticas<br/>(Nunca Expiran)"| Sandbox
    EnvVars -->|"Credenciales Estáticas<br/>(Nunca Expiran)"| Dev
    EnvVars -->|"Credenciales Estáticas<br/>(Nunca Expiran)"| Staging
    EnvVars -->|"Credenciales Estáticas<br/>(Nunca Expiran)"| Prod
    
    style EnvVars fill:#FF6B6B,stroke:#333,color:#000
    style Sandbox fill:#FFE4B5,stroke:#333,color:#000
    style Dev fill:#FFE4B5,stroke:#333,color:#000
    style Staging fill:#FFE4B5,stroke:#333,color:#000
    style Prod fill:#FFE4B5,stroke:#333,color:#000
{{< /mermaid >}}

### Los Riesgos de Seguridad con los que Convives

1. **Credenciales que nunca expiran** - Access keys de AWS que se han rotado... una vez. Quizás dos. Permanecen en variables de entorno de CI/CD indefinidamente.

2. **Sin rastro de auditoría de quién las usó** - Cuando las credenciales se comparten entre jobs y workflows, CloudTrail muestra "Usuario CI/CD" para todo. Buena suerte investigando un incidente.

3. **Acceso demasiado permisivo** - Como rotar credenciales es doloroso, se hacen ampliamente permisivas. Una llave para gobernarlas a todas.

4. **Dispersión de credenciales** - Diferentes credenciales para diferentes entornos, almacenadas en múltiples lugares (plataforma CI/CD, gestores de secretos, laptops de algunos miembros del equipo para debugging).

5. **Sin forma de limitar por repositorio** - Cualquier pipeline técnicamente puede desplegar a cualquier entorno si obtiene las credenciales correctas.

## La Solución: GitHub OIDC + Encadenamiento de Roles

Después de migrar a GitHub Actions, puedes implementar una arquitectura completamente diferente:

{{< mermaid >}}
flowchart TB
    subgraph GitHub["GitHub Actions"]
        Workflow["Ejecución del Workflow"]
        OIDC_Token["Token OIDC<br/>(JWT de corta duración)"]
    end
    
    subgraph AWS_Mgmt["Cuenta de Gestión (Identidad)"]
        OIDC_Provider["Proveedor OIDC de GitHub"]
        OIDC_Role["GitHubActionsOIDCRole<br/>(sesión de 15 min)"]
    end
    
    subgraph Target_Accounts["Cuentas AWS de Carga de Trabajo"]
        Sandbox_Role["DeploymentRole<br/>(Sandbox)"]
        Dev_Role["DeploymentRole<br/>(Desarrollo)"]
        Staging_Role["DeploymentRole<br/>(Staging)"]
        Prod_Role["DeploymentRole<br/>(Producción)"]
    end
    
    Workflow -->|"1. Solicitar Token"| OIDC_Token
    OIDC_Token -->|"2. AssumeRoleWithWebIdentity"| OIDC_Provider
    OIDC_Provider -->|"3. Validar y Emitir Credenciales"| OIDC_Role
    OIDC_Role -->|"4. Encadenar Rol (AssumeRole)"| Sandbox_Role
    OIDC_Role -->|"4. Encadenar Rol (AssumeRole)"| Dev_Role
    OIDC_Role -->|"4. Encadenar Rol (AssumeRole)"| Staging_Role
    OIDC_Role -->|"4. Encadenar Rol (AssumeRole)"| Prod_Role
    
    style OIDC_Token fill:#90EE90,stroke:#333,color:#000
    style OIDC_Provider fill:#87CEEB,stroke:#333,color:#000
    style OIDC_Role fill:#DDA0DD,stroke:#333,color:#000
    style Sandbox_Role fill:#FFD700,stroke:#333,color:#000
    style Dev_Role fill:#FFD700,stroke:#333,color:#000
    style Staging_Role fill:#FFD700,stroke:#333,color:#000
    style Prod_Role fill:#FFD700,stroke:#333,color:#000
{{< /mermaid >}}

### ¿Por Qué una Cuenta de Gestión Dedicada?

La mejor práctica es alojar el proveedor OIDC y el rol base en una **cuenta de Gestión dedicada** (a veces llamada cuenta de Identidad o Seguridad), separada de tus cuentas de carga de trabajo. Este enfoque ofrece varias ventajas:

1. **Clara separación de responsabilidades** - La infraestructura de identidad está aislada de las cargas de trabajo de aplicaciones
2. **Controles de seguridad más estrictos** - La cuenta de Gestión puede tener políticas de acceso más restrictivas ya que solo maneja autenticación
3. **Auditoría simplificada** - Todo el acceso entre cuentas se origina desde una única ubicación controlada
4. **Sigue el AWS Well-Architected Framework** - Se alinea con las recomendaciones de gestión de identidad del pilar de seguridad

### Qué Cambia

| Antes (Credenciales de Larga Duración) | Después (GitHub OIDC) |
|----------------------------------------|-----------------------|
| Las credenciales nunca expiran | Las credenciales duran máximo 15 minutos |
| Almacenadas en variables de entorno CI/CD | Sin credenciales almacenadas—generadas bajo demanda |
| Mismas credenciales para todos los jobs | Sesión única por ejecución de workflow |
| Sin restricciones a nivel de repositorio | Solo repos específicos pueden asumir roles |
| Difícil de auditar | Visibilidad completa en CloudTrail con nombres de sesión |
| Rotación manual (rara vez hecha) | Automática—cada ejecución obtiene credenciales frescas |

## La Arquitectura: Encadenamiento de Roles Explicado

No solo configures OIDC—implementa **encadenamiento de roles** para gestionar el acceso entre múltiples cuentas AWS. Aquí está por qué y cómo:

{{< mermaid >}}
flowchart TD
    subgraph GH["Workflow de GitHub Actions"]
        Token["Token JWT OIDC<br/>Contiene: repo, ref, actor, workflow"]
    end
    
    subgraph Step1["Paso 1: Autenticación OIDC"]
        direction LR
        OIDC["Proveedor OIDC de GitHub<br/>(Cuenta de Gestión)"]
        Base["GitHubActionsOIDCRole<br/>Permisos mínimos"]
    end
    
    subgraph Step2["Paso 2: Encadenamiento de Roles"]
        direction LR
        Target["Rol de Despliegue Destino<br/>(Cuenta de Carga de Trabajo)"]
    end
    
    Token -->|"AssumeRoleWithWebIdentity<br/>Valida: claims aud, sub"| OIDC
    OIDC -->|"Emite credenciales temporales"| Base
    Base -->|"AssumeRole<br/>(role-chaining: true)"| Target
    
    style Token fill:#90EE90,stroke:#333,color:#000
    style OIDC fill:#87CEEB,stroke:#333,color:#000
    style Base fill:#DDA0DD,stroke:#333,color:#000
    style Target fill:#FFD700,stroke:#333,color:#000
{{< /mermaid >}}

### ¿Por Qué Encadenamiento de Roles?

1. **Punto Único de Entrada**: Todas las GitHub Actions se autentican a través de un proveedor OIDC en la cuenta de Gestión. Esto centraliza la gestión de confianza.

2. **Separación de Responsabilidades**: El rol OIDC tiene permisos mínimos—solo puede asumir otros roles. Los permisos reales de despliegue viven en roles específicos de cada entorno en cada cuenta de carga de trabajo.

3. **Acceso Entre Cuentas**: Con múltiples cuentas AWS (sandbox, desarrollo, staging, producción), el encadenamiento de roles te permite desplegar a cualquiera de ellas desde un único punto de autenticación.

4. **Mínimo Privilegio**: Cada repositorio tiene su propio rol de despliegue con solo los permisos que necesita.

## Implementación: El Código Terraform

Veamos el código Terraform. Lo desglosaré pieza por pieza.

### Paso 1: Crear el Proveedor OIDC

Primero, crea el proveedor OIDC de GitHub en la cuenta de Gestión:

```hcl
# Despliega esto en tu cuenta de Gestión
locals {
  github_oidc_url           = "https://token.actions.githubusercontent.com"
  github_oidc_condition_key = "token.actions.githubusercontent.com"
  github_oidc_client_id     = "sts.amazonaws.com"
  github_oidc_thumbprint    = "6938fd4d98bab03faadb97b34396831e3780aea1"

  # Configuración de relación de confianza de repositorios
  trusted_repositories = [
    "repo:${var.github_organization}/frontend-app:*",
    "repo:${var.github_organization}/backend-api:*",
    "repo:${var.github_organization}/mobile-app:*",
    "repo:${var.github_organization}/infrastructure:*"
  ]
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url = local.github_oidc_url

  client_id_list  = [local.github_oidc_client_id]
  thumbprint_list = [local.github_oidc_thumbprint]

  tags = {
    Environment = "management"
    Purpose     = "GitHub Actions OIDC Authentication"
  }
}
```

**Puntos Clave:**
- El `thumbprint` es la huella digital del certificado OIDC de GitHub—AWS lo usa para verificar la firma del JWT
- `client_id_list` contiene `sts.amazonaws.com` porque eso es lo que GitHub Actions usa como audiencia
- Solo necesitas **un** proveedor OIDC en la cuenta de Gestión, incluso para configuraciones multi-cuenta

### Paso 2: Crear el Rol Base OIDC

Este rol es el "punto de entrada" para todas las GitHub Actions, creado en la cuenta de Gestión:

```hcl
# Despliega esto en tu cuenta de Gestión
resource "aws_iam_role" "github_oidc_role" {
  name = "GitHubActionsOIDCRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::${var.management_account_id}:oidc-provider/${local.github_oidc_condition_key}"
        }
        Condition = {
          StringEquals = {
            "${local.github_oidc_condition_key}:aud" = local.github_oidc_client_id
          }
          StringLike = {
            "${local.github_oidc_condition_key}:sub" = local.trusted_repositories
          }
        }
      }
    ]
  })

  tags = {
    Purpose = "GitHub OIDC authentication and cross-account role assumption"
  }
}

# Otorga a este rol permiso para asumir roles en cuentas de carga de trabajo
resource "aws_iam_role_policy" "github_oidc_assume_role" {
  name = "AssumeWorkloadAccountRoles"
  role = aws_iam_role.github_oidc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
        Resource = [
          "arn:aws:iam::${var.sandbox_account_id}:role/*-deployment-role",
          "arn:aws:iam::${var.development_account_id}:role/*-deployment-role",
          "arn:aws:iam::${var.staging_account_id}:role/*-deployment-role",
          "arn:aws:iam::${var.production_account_id}:role/*-deployment-role"
        ]
      }
    ]
  })
}
```

**La Magia Está en las Condiciones:**

- `aud` (audiencia): Debe ser `sts.amazonaws.com` - previene que tokens destinados a otros servicios sean usados
- `sub` (sujeto): Debe coincidir con los repositorios de confianza - aquí es donde se limita el acceso

El formato del claim `sub` es: `repo:OWNER/REPO:ref:refs/heads/BRANCH` o `repo:OWNER/REPO:*` para todas las ramas.

**Ejemplos de patrones de claim sub:**

```hcl
# Permitir todas las ramas de un repo específico
"repo:acme-corp/backend-api:*"

# Permitir solo la rama main
"repo:acme-corp/backend-api:ref:refs/heads/main"

# Permitir solo pull requests
"repo:acme-corp/backend-api:pull_request"

# Permitir entorno específico
"repo:acme-corp/backend-api:environment:production"
```

### Paso 3: Crear Roles de Despliegue Entre Cuentas

Cada cuenta de carga de trabajo necesita un rol de despliegue que confíe en el rol OIDC de la cuenta de Gestión:

```hcl
# Despliega esto en cada cuenta de carga de trabajo (sandbox, dev, staging, production)
resource "aws_iam_role" "deployment_role" {
  provider = aws.sandbox  # Cambia el provider para cada cuenta

  name = "DeploymentRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
        Effect = "Allow"
        Principal = {
          AWS = [
            # Confía en el rol OIDC de la cuenta de Gestión
            "arn:aws:iam::${var.management_account_id}:role/GitHubActionsOIDCRole"
          ]
        }
      }
    ]
  })

  tags = {
    Environment = "sandbox"
    Purpose     = "Cross-account deployment from GitHub OIDC role"
  }
}

# Repetir para cuentas de desarrollo, staging, producción...
```

### Paso 4: Roles de Despliegue Específicos por Repositorio

Para control más granular, crea roles específicos por repositorio en cada cuenta de carga de trabajo:

```hcl
# Despliega esto en la cuenta de carga de trabajo de Producción
# Rol de despliegue de frontend - limitado a S3 y CloudFront
resource "aws_iam_role" "frontend_deployment_role" {
  provider = aws.production

  name = "frontend-app-deployment-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
        Effect = "Allow"
        Principal = {
          AWS = [
            # Confía en el rol OIDC de la cuenta de Gestión
            "arn:aws:iam::${var.management_account_id}:role/GitHubActionsOIDCRole"
          ]
        }
      }
    ]
  })
}

# Adjunta solo los permisos que este repo necesita
resource "aws_iam_role_policy" "frontend_deployment_policy" {
  provider = aws.production

  name = "frontend-app-deployment-policy"
  role = aws_iam_role.frontend_deployment_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::my-frontend-bucket-*",
          "arn:aws:s3:::my-frontend-bucket-*/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation"
        ]
        Resource = "*"
      }
    ]
  })
}
```

## Implementación: El Workflow de GitHub Actions

Ahora veamos cómo se usa esto en workflows reales.

### La Acción de Autenticación Reutilizable

Crea una acción compuesta que maneje la autenticación de dos pasos:

```yaml
# .github/actions/configure-aws-credentials-chained/action.yml
name: 'Configure AWS Credentials (Chained)'
description: 'Autenticar vía OIDC a cuenta de Gestión, luego asumir rol destino en cuenta de carga de trabajo'

inputs:
  aws_region:
    description: 'Región AWS'
    required: true
  oidc_role_to_assume:
    description: 'Rol base a asumir vía GitHub OIDC (en cuenta de Gestión)'
    required: true
  target_role_to_assume:
    description: 'Rol de despliegue destino a asumir en cuenta de carga de trabajo (encadenado)'
    required: true
  base_session_name:
    description: 'Nombre de sesión para auth OIDC base'
    default: 'OIDC-Auth'
  target_session_name:
    description: 'Nombre de sesión para rol destino'
    default: 'Chained-Role'

runs:
  using: 'composite'
  steps:
    # Paso 1: Autenticar a cuenta de Gestión vía OIDC
    - name: '🔐 Configurar credenciales AWS (OIDC)'
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: ${{ inputs.oidc_role_to_assume }}
        role-session-name: GitHubActions-${{ inputs.base_session_name }}
        aws-region: ${{ inputs.aws_region }}

    # Paso 2: Encadenar al rol de despliegue destino en cuenta de carga de trabajo
    - name: '🔐 Configurar credenciales AWS (Rol Destino Encadenado)'
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: ${{ inputs.target_role_to_assume }}
        role-session-name: GitHubActions-${{ inputs.target_session_name }}
        aws-region: ${{ inputs.aws_region }}
        role-chaining: true  # ¡Esta es la clave!
```

### Usándolo en un Workflow

Aquí hay una versión simplificada de un workflow de despliegue de sitio estático:

```yaml
name: 'Pipeline CI/CD'

on:
  push:
    branches: [main, dev, release/*, feature/*]

permissions:
  id-token: write   # Requerido para OIDC
  contents: read

env:
  # La cuenta de Gestión aloja el proveedor OIDC
  MANAGEMENT_ACCOUNT_ID: "111111111111"
  # La cuenta de Producción es el destino del despliegue
  PRODUCTION_ACCOUNT_ID: "999999999999"

jobs:
  deploy:
    name: 'Desplegar Sitio Estático'
    runs-on: ubuntu-latest
    environment: production  # GitHub Environment para puertas de aprobación
    
    steps:
      - name: '📥 Checkout código'
        uses: actions/checkout@v4

      # Autenticación de dos pasos: OIDC (Gestión) → Encadenar Rol (Producción)
      - name: '🔐 Configurar credenciales AWS (Encadenado)'
        uses: ./.github/actions/configure-aws-credentials-chained
        with:
          aws_region: us-west-2
          # Paso 1: Autenticar a cuenta de Gestión
          oidc_role_to_assume: arn:aws:iam::${{ env.MANAGEMENT_ACCOUNT_ID }}:role/GitHubActionsOIDCRole
          # Paso 2: Encadenar a cuenta de Producción
          target_role_to_assume: arn:aws:iam::${{ env.PRODUCTION_ACCOUNT_ID }}:role/frontend-app-deployment-role
          base_session_name: OIDC-Auth
          target_session_name: StaticSite-production

      # Verificar que estamos en la cuenta correcta (debería mostrar cuenta de Producción)
      - name: '✅ Verificar conexión AWS'
        run: |
          echo "Conectado a Cuenta AWS: $(aws sts get-caller-identity --query Account --output text)"
          echo "ARN del Rol: $(aws sts get-caller-identity --query Arn --output text)"

      # ¡Desplegar!
      - name: '🚀 Sincronizar a S3'
        run: |
          aws s3 sync . s3://my-website-bucket/ --delete
```

## El Permiso Crítico: `id-token: write`

Algo que confunde a la gente inicialmente: **debes** establecer `id-token: write` en los permisos de tu workflow:

```yaml
permissions:
  id-token: write   # ¡Esto es requerido para OIDC!
  contents: read
```

Sin esto, GitHub no generará el token OIDC, y obtendrás errores crípticos de "not authorized to perform sts:AssumeRoleWithWebIdentity".

## Mapeo de Rama a Entorno

Mapea ramas a entornos (y sus correspondientes cuentas de carga de trabajo) automáticamente:

```yaml
env:
  MANAGEMENT_ACCOUNT_ID: "111111111111"
  SANDBOX_ACCOUNT_ID: "222222222222"
  DEVELOPMENT_ACCOUNT_ID: "333333333333"
  STAGING_ACCOUNT_ID: "444444444444"
  PRODUCTION_ACCOUNT_ID: "999999999999"

# ...

- name: 'Mapear rama a entorno'
  id: env-mapping
  run: |
    case "${{ github.ref_name }}" in
      "main")
        echo "environment=production" >> $GITHUB_OUTPUT
        echo "account_id=${{ env.PRODUCTION_ACCOUNT_ID }}" >> $GITHUB_OUTPUT
        ;;
      "dev")
        echo "environment=development" >> $GITHUB_OUTPUT
        echo "account_id=${{ env.DEVELOPMENT_ACCOUNT_ID }}" >> $GITHUB_OUTPUT
        ;;
      "release/"*)
        echo "environment=staging" >> $GITHUB_OUTPUT
        echo "account_id=${{ env.STAGING_ACCOUNT_ID }}" >> $GITHUB_OUTPUT
        ;;
      "feature/"*)
        echo "environment=sandbox" >> $GITHUB_OUTPUT
        echo "account_id=${{ env.SANDBOX_ACCOUNT_ID }}" >> $GITHUB_OUTPUT
        ;;
    esac
```

Esto se integra hermosamente con OIDC—incluso puedes limitar tu política de confianza a ramas específicas:

```hcl
# Solo permitir despliegues a producción desde la rama main
StringEquals = {
  "${local.github_oidc_condition_key}:sub" = "repo:acme-corp/backend-api:ref:refs/heads/main"
}
```

## Depuración de Problemas OIDC

Cuando las cosas salen mal (y lo harán durante la configuración), así es como depurar:

### 1. Verificar los Claims del Token OIDC

Agrega este paso para ver qué está enviando GitHub:

```yaml
- name: '🔍 Depurar Token OIDC'
  run: |
    # El token está disponible en esta variable de entorno
    echo "Vista previa del Token (primeros 50 caracteres): ${ACTIONS_ID_TOKEN_REQUEST_TOKEN:0:50}..."
    
    # Decodifica el JWT (parte del medio) para ver los claims
    # ¡No hagas esto en logs de producción!
```

### 2. Errores Comunes y Soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Falta permiso `id-token: write` | Agrégalo a los permisos del workflow |
| `Invalid identity token` | Thumbprint OIDC incorrecto | Verifica que estás usando el thumbprint actual de GitHub |
| `Condition not satisfied` | El claim `sub` no coincide | Revisa tu patrón de repositorio en la política de confianza |
| `Invalid principal in policy` | ARN del proveedor OIDC incorrecto | Verifica el ARN del principal federado |
| `Access denied assuming role in workload account` | La política de confianza no permite la cuenta de Gestión | Verifica que el rol de la cuenta de carga de trabajo confía en el ARN del rol OIDC |

### 3. Verificar Tu Política de Confianza

Prueba las condiciones de tu política de confianza localmente:

```bash
# Decodifica un token OIDC de GitHub de ejemplo para ver los claims reales
# El claim 'sub' se verá como: repo:ORG/REPO:ref:refs/heads/BRANCH
```

## Mejores Prácticas de Seguridad

Después de implementar esto en repositorios, aquí están las prácticas a adoptar:

### 1. Limita las Políticas de Confianza Estrictamente

```hcl
# ❌ Demasiado permisivo - cualquier rama
"repo:acme-corp/backend-api:*"

# ✅ Mejor - solo ramas específicas
"repo:acme-corp/backend-api:ref:refs/heads/main"
"repo:acme-corp/backend-api:ref:refs/heads/dev"
```

### 2. Usa Roles Específicos por Repositorio

No des a cada repositorio los mismos permisos:

```hcl
# Repo de sitio web estático - solo necesita S3 y CloudFront
resource "aws_iam_role" "frontend_deployment_role" { ... }

# Repo de API - necesita ECS, Lambda, RDS, etc.
resource "aws_iam_role" "backend_api_deployment_role" { ... }

# Repo de infraestructura - necesita permisos de admin de Terraform
resource "aws_iam_role" "infrastructure_deployment_role" { ... }
```

### 3. Usa GitHub Environments para Puertas de Aprobación

```yaml
jobs:
  deploy-production:
    environment: production  # Requiere aprobación antes de ejecutar
```

Configura revisores requeridos en la configuración del repositorio de GitHub para el entorno `production`.

### 4. Bloquea la Cuenta de Gestión

Ya que la cuenta de Gestión es la puerta de entrada a todas las cuentas de carga de trabajo:
- Restringe quién puede modificar roles IAM en esta cuenta
- Habilita logging de CloudTrail para todos los eventos OIDC
- Usa SCPs de AWS Organizations para prevenir cambios accidentales
- Considera usar AWS IAM Access Analyzer para auditar políticas de confianza

### 5. Monitorea con CloudTrail

Cada autenticación OIDC crea eventos de CloudTrail con:
- El repositorio de GitHub
- El nombre del workflow
- El actor que lo disparó
- El nombre de sesión que especificaste

Esto hace la investigación de incidentes dramáticamente más fácil.

## Los Resultados: Antes y Después

### Mejoras de Seguridad

| Métrica | Antes | Después |
|---------|-------|---------|
| Duración de credenciales | Indefinida | 15 minutos |
| Almacenamiento de credenciales | Variables de entorno CI/CD, gestores de secretos | Ninguno (generadas bajo demanda) |
| Frecuencia de rotación | "Cuando nos acordamos" | Cada ejecución de workflow |
| Alcance por repositorio | Ninguno | Confianza por repositorio |
| Rastro de auditoría | "Usuario CI/CD" | Info completa de repo/rama/actor |
| Gestión de identidad | Dispersa | Centralizada en cuenta de Gestión |

### Mejoras Operacionales

- **Cero tareas de rotación de credenciales** - Es automático
- **Sin dispersión de credenciales** - Nada que gestionar o filtrar
- **Depuración más fácil** - CloudTrail muestra exactamente qué repo/workflow hizo qué
- **Onboarding más simple** - Nuevos repos solo necesitan actualizaciones de política de confianza
- **Límite de seguridad claro** - Cuenta de Gestión aislada de cargas de trabajo

## Conclusión

Migrar a GitHub OIDC es una de las mejores decisiones de seguridad que puedes tomar durante una migración a GitHub Actions. Sí, la configuración inicial requiere entender claims JWT, políticas de confianza, y encadenamiento de roles. Pero una vez que está en su lugar:

- **No más ansiedad por rotación de credenciales**
- **No más "¿quién tiene acceso a estas llaves?"**
- **No más credenciales en variables de entorno**

Usar una cuenta de Gestión dedicada para autenticación OIDC sigue las mejores prácticas de AWS y proporciona una separación limpia entre gestión de identidad y tus cuentas de carga de trabajo. Si todavía estás usando credenciales AWS de larga duración en tus pipelines CI/CD, espero que este post te dé el mapa para hacer el cambio. La inversión vale la pena.

La parte más difícil no es la implementación técnica—es convencerte a ti mismo de que la complejidad temporal de configurar esto vale la simplificación permanente de no gestionar credenciales nunca más.

---

*¿Preguntas sobre implementar OIDC para tu configuración? Encuéntrame en [LinkedIn](https://linkedin.com/in/carimfadil).*

