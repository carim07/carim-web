---
title: "El misterio de los disparadores de Lambda que desaparecen: una historia de drift de estado en Terraform"
date: 2025-10-31T10:00:00-07:00
lastmod: 2025-10-31T10:00:00-07:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "Análisis del desajuste de permisos de AWS Lambda con Terraform y cómo solucionarlo usando replace_triggered_by en lifecycle."

tags: ["Terraform", "AWS", "Lambda", "DevOps", "IaC", "EventBridge"]
categories: ["DevOps", "AWS"]

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

Todos hemos estado ahí: empiezas el día sintiéndote bien por terminar el trabajo del sprint anterior, café en mano, listo para abordar algo nuevo. Entonces llega la notificación de Slack que lo cambia todo.

"Oye, ¿puedes investigar por qué un par de Lambdas no se ejecutaron hace dos semanas?"

<!--more-->

El misterio era desconcertante: las funciones Lambda programadas habían perdido sus ejecuciones en un día específico, luego reanudaron su funcionamiento normal al día siguiente sin intervención. No eran funciones críticas (esas habrían disparado alertas inmediatas), pero eran lo suficientemente importantes como para que necesitáramos entender qué pasó y evitar que se repitiera.

Trabajando con un compañero, descubrimos que dos funciones habían fallado al ejecutarse: una activada por reglas de EventBridge, otra por eventos de S3. Diferentes disparadores, mismo problema, mismo día. Eso apuntaba a algo sistémico.

Mientras investigábamos la Lambda afectada en la consola, todo parecía normal. Los logs de CloudWatch no mostraban nada inusual. Los eventos de CloudTrail para ese período no revelaron anomalías. Entonces, mientras revisábamos la configuración de la Lambda, notamos algo extraño: el disparador había desaparecido ante nuestros ojos.

Una verificación rápida confirmó nuestra sospecha: un despliegue de producción acababa de completarse. El despliegue automatizado de Terraform desde nuestro pipeline de CI/CD había desconectado los disparadores de alguna manera. La infraestructura estaba ahí: reglas de EventBridge, targets, incluso la función Lambda misma, pero ya no estaban conectados.

## La Investigación

Profundizando más, encontramos algo interesante:

- ✅ Las reglas de EventBridge existían y estaban habilitadas
- ✅ Los targets de EventBridge apuntaban a la ARN correcta de Lambda
- ❌ Los disparadores de Lambda no mostraban nada en la consola
- ❌ Las invocaciones manuales desde EventBridge fallaban con errores "not authorized"

Esto apuntaba a una cosa: **permisos de Lambda faltantes**.

En AWS, tener una regla de EventBridge con un target no es suficiente. También necesitas un recurso `aws_lambda_permission` que otorgue explícitamente a EventBridge el derecho de invocar tu Lambda. Estos son dos recursos separados:

```hcl
# La regla y target de EventBridge
resource "aws_cloudwatch_event_rule" "my_rule" {
  name                = "my-scheduled-rule"
  schedule_expression = "cron(0 12 * * ? *)"
}

resource "aws_cloudwatch_event_target" "my_target" {
  rule = aws_cloudwatch_event_rule.my_rule.name
  arn  = aws_lambda_function.my_function.arn
}

# El permiso (¡ESTO faltaba!)
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.my_function.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.my_rule.arn
}
```

Cuando verificamos la política de recursos de la Lambda:

```bash
aws lambda get-policy \
  --function-name my_scheduled_lambda \
  --region us-west-2
```

Los permisos efectivamente faltaban. Pero la pregunta permanecía: **¿Por qué?**

### El Problema de Arquitectura de AWS

Así es como se ve la arquitectura cuando todo está configurado correctamente vs. cuando faltan permisos:

{{< mermaid >}}
flowchart LR
    %% Working configuration
    subgraph "Working Configuration"
        EB1[EventBridge Rule]
        ET1[EventBridge Target]
        LP1[Lambda Permission]
        L1[Lambda Function]

        EB1 -->|points to| ET1
        ET1 -->|invokes| L1
        LP1 -.->|grants access| L1
        EB1 -.->|authorized by| LP1

        style L1 fill:#90EE90,stroke:#2d5016,color:#000
        style LP1 fill:#90EE90,stroke:#2d5016,color:#000
    end

    %% Broken configuration
    subgraph "Broken Configuration"
        EB2[EventBridge Rule]
        ET2[EventBridge Target]
        LP2[Lambda Permission]
        L2[Lambda Function]

        EB2 -->|points to| ET2
        ET2 -.->|BLOCKED| L2
        LP2 -.->|MISSING| L2

        style L2 fill:#FFB6C1,stroke:#8B0000,color:#000
        style LP2 fill:#FFB6C1,stroke:#8B0000,color:#000
    end
{{< /mermaid >}}

## La Causa Raíz

Después de investigar e investigar, descubrimos que esto es un **comportamiento conocido en las interacciones AWS/Terraform**:

1. Cuando AWS elimina una función Lambda, **elimina automáticamente todos los permisos asociados**
2. Esto es comportamiento de AWS, no un bug de Terraform
3. Cuando Terraform recrea una función Lambda (durante un despliegue), AWS elimina silenciosamente los permisos
4. El archivo de estado de Terraform todavía piensa que los permisos existen (estado obsoleto)
5. Los permisos **no aparecen en el plan** cuando la Lambda es reemplazada
6. Solo aparecen como necesitando recreación en la **siguiente** ejecución de Terraform

Esto crea una ventana peligrosa donde tu infraestructura se ve bien en Terraform, pero en realidad está rota en AWS.

### Pero Espera—¿Por Qué Se Estaban Reemplazando las Lambdas?

Aquí es donde la trama se complica. En circunstancias normales, los despliegues de Lambda con solo cambios de código deberían **actualizarse in-place**, no reemplazar la función. Así que tuvimos que preguntar: ¿qué realmente activó el reemplazo que causó este lío?

Revisando el historial de despliegues y los logs de CloudTrail reveló una historia fascinante de no una, sino dos migraciones arquitectónicas separadas que ambas causaron reemplazos de Lambda.

#### La Primera Migración: Paquetes Zip a Imágenes de Contenedor

El reemplazo inicial ocurrió durante una migración importante de infraestructura. Estábamos moviéndonos de:

**Antes:**

- Tipo de paquete: `Zip`
- Runtime: `nodejs22.x`
- Dependencias: montaje EFS (`/mnt/efs/node_modules`)
- Despliegue: Subir archivos zip a S3

**Después:**

- Tipo de paquete: `Image`
- Dependencias: Incluidas en imágenes de contenedor
- Despliegue: Push a ECR, referencia URI de imagen
- Node modules: Incluidos en la capa del contenedor (`/opt/nodejs/node_modules`)

Este es un **cambio que rompe compatibilidad** para AWS Lambda. No puedes cambiar el tipo de paquete de `Zip` a `Image` in-place: AWS requiere una eliminación y recreación completa. Cuando Terraform ejecutó esta migración:

1. Eliminó las funciones Lambda basadas en Zip
2. AWS eliminó automáticamente todos los permisos asociados
3. Creó nuevas funciones Lambda basadas en Image
4. **Pero no recreó los permisos en la misma ejecución**

Esto era comprensible: era una migración arquitectónica única. La verdadera sorpresa vino después.

#### El Segundo Problema: La Migración de Refactorización del Módulo

Después de migrar exitosamente a imágenes de contenedor, notamos algo en los logs de despliegue. Durante los primeros despliegues después de la migración, las Lambdas continuaron siendo reemplazadas en lugar de actualizarse in-place.

Los logs de CloudTrail mostraron un patrón claro:

- 15 de octubre: Migración inicial Zip→Image (reemplazos intencionales)
- 22 de octubre: Lambda reemplazada (versión 105)
- 30 de octubre: Lambda reemplazada nuevamente (versión 106)

Comparando los planes de Terraform entre estas ejecuciones reveló lo que estaba pasando. Los planes mostraron recursos cambiando entre:

```
- module.my_lambda.aws_lambda_function.this_image[0] (will be destroyed)
+ module.my_lambda.aws_lambda_function.this (will be created)
```

**La causa raíz:** Durante la migración Zip→Image, nuestro módulo Lambda también estaba siendo refactorizado de un patrón de doble recurso a un diseño más limpio de recurso único. El módulo antiguo tenía:

```hcl
# Estructura del módulo antiguo (usado durante la migración)
resource "aws_lambda_function" "this" {
  count = var.package_type == "Zip" ? 1 : 0
  # Configuración del paquete Zip
}

resource "aws_lambda_function" "this_image" {
  count = var.package_type == "Image" ? 1 : 0
  # Configuración de imagen de contenedor
}
```

El nuevo módulo usa un único recurso más limpio:

```hcl
# Estructura del módulo nuevo (actual)
resource "aws_lambda_function" "this" {
  package_type = "Image"
  image_uri    = var.image_uri
  # Un único recurso maneja todo
}
```

La secuencia de migración fue:

1. **Primer despliegue (15 oct):** Migrado de Zip a Image, creando recursos `this_image[0]`
2. **Actualización del módulo:** Refactorizado para usar un único recurso `this`
3. **Despliegues subsecuentes (22, 30 oct):** Terraform migrando estado de `this_image[0]` a `this`

Durante estos despliegues transicionales:

1. Terraform vio `this_image[0]` en el archivo de estado
2. El código actual definía `this`
3. Terraform destruyó `this_image[0]`, creó `this`
4. AWS eliminó todos los permisos cuando la Lambda fue eliminada
5. Los permisos no fueron recreados en la misma ejecución

Después de algunos ciclos de despliegue, Terraform completó la migración de estado automáticamente, y los planes subsecuentes mostraron el comportamiento correcto: actualizaciones in-place.

#### La Lección

Lo que parecía ser un simple problema de drift de permisos era en realidad una tormenta perfecta de cambios:

1. **Comportamiento de AWS**: Eliminación automática de permisos cuando las Lambdas son eliminadas
2. **Migración planificada**: Tipo de paquete Zip→Image requiriendo reemplazo
3. **Refactorización del módulo**: Migración de estado de patrón de doble recurso a patrón de recurso único
4. **Período transicional**: Múltiples despliegues necesarios para reconciliar completamente el estado

La solución `replace_triggered_by` no solo arregló el drift de permisos inmediato sino que también nos protegió durante el período de migración de estado. Aún más importante, evitará este problema si alguna vez necesitamos reemplazar Lambdas nuevamente por cualquier razón (cambios de VPC, etc.).

La lección más grande: las migraciones importantes de infraestructura rara vez ocurren de forma aislada. Cuando múltiples cambios se combinan, tener patrones de infraestructura defensivos como `replace_triggered_by` se vuelve crítico.

## Por Qué Terraform No Detecta Esto

El problema es que los recursos `aws_lambda_permission` no detectan automáticamente cuando la función Lambda a la que hacen referencia ha sido recreada. Aunque el permiso referencia la Lambda, Terraform los trata como recursos independientes durante la operación de reemplazo.

Esto es lo que sucede durante un despliegue típico de Lambda:

```
Terraform Plan:
- aws_lambda_function.this will be replaced
  (image_uri changed)

Terraform Apply:
1. Eliminar Lambda antigua → AWS elimina permisos automáticamente
2. Crear nueva Lambda → ¡Éxito!
3. Terraform verifica permisos... el estado dice que existen ✓

Siguiente Ejecución de Terraform:
- aws_lambda_permission.eventbridge[0] will be created
  (drift detectado - permiso faltante en AWS)
```

¿Notas el retraso de una ejecución? Ese es el problema.

### La Línea de Tiempo del State Drift

Este diagrama de secuencia ilustra exactamente cómo ocurre el drift de estado:

{{< mermaid >}}
sequenceDiagram
    participant Dev as Developer
    participant TF as Terraform
    participant State as Terraform State
    participant AWS as AWS

    Note over Dev,AWS: Ejecución de Despliegue Inicial
    Dev->>TF: terraform plan
    TF->>State: Verificar estado actual
    State-->>TF: Lambda + Permisos existen
    TF->>AWS: Verificar recursos actuales
    AWS-->>TF: Imagen de Lambda cambiada
    TF->>Dev: Plan: Reemplazar Lambda

    Dev->>TF: terraform apply
    TF->>AWS: Eliminar Lambda antigua
    Note over AWS: AWS elimina automáticamente<br/>los permisos de Lambda!
    TF->>AWS: Crear nueva Lambda
    AWS-->>TF: Lambda creada ✓
    TF->>State: Actualizar: Lambda reemplazada
    Note over State: Permisos todavía marcados<br/>como "existentes" ❌

    Note over Dev,AWS: Siguiente Ejecución de Despliegue (Detección de Drift)
    Dev->>TF: terraform plan
    TF->>State: Verificar permisos
    State-->>TF: Permisos existen (¡INCORRECTO!)
    TF->>AWS: Verificar permisos
    AWS-->>TF: Permisos NO ENCONTRADOS
    TF->>Dev: Plan: Crear permisos

    Note over Dev,AWS: ¡Ventana de Infraestructura Rota!
{{< /mermaid >}}

## La Solución: `replace_triggered_by`

Terraform 1.2 introdujo un meta-argumento de lifecycle llamado `replace_triggered_by` específicamente para manejar esta clase de problemas. Fuerza a Terraform a recrear un recurso siempre que otro recurso sea reemplazado.

Así es como lo implementamos:

### Para Permisos Dentro del Módulo Lambda

```hcl
resource "aws_lambda_permission" "eventbridge_execution_allowed" {
  count = var.eventbridge_execution_allowed_arns != null ? length(var.eventbridge_execution_allowed_arns) : 0

  statement_id  = "AllowExecutionFromEventBridge_${count.index}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "events.amazonaws.com"
  source_arn    = var.eventbridge_execution_allowed_arns[count.index]

  # Esto fuerza a Terraform a recrear permisos cuando Lambda cambia
  lifecycle {
    replace_triggered_by = [
      aws_lambda_function.this
    ]
  }
}
```

### El Problema del Límite del Módulo

Sin embargo, nos topamos con un problema con las Lambdas activadas por S3. Teníamos algunos permisos definidos **fuera** del módulo Lambda:

```hcl
# En la configuración principal de terraform (fuera del módulo)
resource "aws_lambda_permission" "s3_invoke" {
  function_name = module.my_lambda.lambda_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.my_bucket.arn

  lifecycle {
    replace_triggered_by = [
      module.my_lambda.aws_lambda_function.this  # ❌ ¡Esto no funciona!
    ]
  }
}
```

**El problema:** `replace_triggered_by` solo puede referenciar recursos directos, no outputs de módulos. Incluso si expones el recurso Lambda como un output, no puedes usarlo en `replace_triggered_by` a través de límites de módulos.

#### Visualizando el Problema del Límite del Módulo

{{< mermaid >}}
flowchart TB
    %% Visualize module and root config without an outer cluster to avoid title overlap
    subgraph "lambda_module"
        LF1[aws_lambda_function.this]
        LP1[aws_lambda_permission EventBridge]

        LP1 -.->|replace_triggered_by OK| LF1

        style LP1 fill:#90EE90,stroke:#2d5016,color:#000
    end

    subgraph "root_config"
        S3[aws_s3_bucket]
        LP2[aws_lambda_permission S3 invoke]

        LP2 -->|function_name| LF1
        LP2 -.->|replace_triggered_by cannot cross boundary| LF1
        S3 -->|source_arn| LP2

        style LP2 fill:#FFB6C1,stroke:#8B0000,color:#000
    end

    Note["Module outputs cannot be used in replace_triggered_by"]
    style Note fill:#FFE4B5,stroke:#8B4513,color:#000
{{< /mermaid >}}

### La Solución Final: Mover Permisos al Módulo

Resolvimos esto moviendo **todos** los permisos al módulo Lambda:

**Paso 1: Agregar un parámetro opcional para buckets S3**

```hcl
# modules/lambda/variable.tf
variable "s3_execution_allowed_arns" {
  description = "Lista de ARNs de buckets S3 permitidos para invocar esta Lambda"
  type        = list(string)
  default     = null
}
```

**Paso 2: Crear permisos S3 dentro del módulo**

```hcl
# modules/lambda/main.tf
resource "aws_lambda_permission" "s3_execution_allowed" {
  count = var.s3_execution_allowed_arns != null ? length(var.s3_execution_allowed_arns) : 0

  statement_id  = "AllowExecutionFromS3Bucket_${count.index}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = var.s3_execution_allowed_arns[count.index]

  lifecycle {
    replace_triggered_by = [
      aws_lambda_function.this
    ]
  }
}
```

**Paso 3: Actualizar configuraciones Lambda para usar el parámetro del módulo**

```hcl
module "my_lambda" {
  source = "./modules/lambda"
  # ... otros parámetros ...
  s3_execution_allowed_arns = [aws_s3_bucket.my_bucket.arn]
}

# Eliminar completamente el recurso aws_lambda_permission externo
```

#### Arquitectura Antes y Después

{{< mermaid >}}
flowchart TB
    subgraph "BEFORE: Broken Configuration"
        %% spacer to prevent title overlap with inner subgraph title
        pad_before[pad]
        style pad_before fill:transparent,stroke-width:0px,color:transparent
        subgraph "lambda_module_before"
            LF1[Lambda Function]
            LP1[EventBridge Permission]

            LP1 -.->|replace_triggered_by OK| LF1
        end

        subgraph "root_config_before"
            LP2["S3 Permission (missing)"]

            LP2 -.->|cannot trigger on Lambda replace| LF1
        end

        style LP2 fill:#FFB6C1,stroke:#8B0000,color:#000
    end

    subgraph "AFTER: Working Configuration"
        subgraph "lambda_module_after"
            LF2[Lambda Function]
            LP3[EventBridge Permission]
            LP4[S3 Permission]

            LP3 -.->|replace_triggered_by OK| LF2
            LP4 -.->|replace_triggered_by OK| LF2

            style LP3 fill:#90EE90,stroke:#2d5016,color:#000
            style LP4 fill:#90EE90,stroke:#2d5016,color:#000
            style LF2 fill:#90EE90,stroke:#2d5016,color:#000
        end

        subgraph "root_config_after"
            Note["All permissions now in module"]
            style Note fill:#E6F3FF,stroke:#1e40af,color:#000
        end
    end
{{< /mermaid >}}

## Los Resultados

Después de implementar esta solución:

1. **Todos los permisos de Lambda ahora están co-localizados con el recurso Lambda**
2. **`replace_triggered_by` funciona correctamente** ya que todo está en el mismo módulo
3. **No más drift de estado** - los permisos se recrean en la misma ejecución que la Lambda
4. **Patrón consistente** - permisos de EventBridge, API Gateway y S3 todos manejados de la misma manera

Cuando ejecutamos `terraform plan` y la Lambda necesita reemplazo, ahora vemos:

```
Terraform will perform the following actions:

  # module.my_lambda.aws_lambda_function.this will be replaced

  # module.my_lambda.aws_lambda_permission.eventbridge_execution_allowed[0] will be replaced

  # module.my_lambda.aws_lambda_permission.s3_execution_allowed[0] will be replaced
```

¡Todo en el mismo plan! No más retraso de una ejecución, no más disparadores faltantes.

## Puntos Clave

1. **AWS elimina automáticamente los permisos de Lambda cuando la Lambda es eliminada** - esto es por diseño, no un bug

2. **Terraform no siempre detecta esta eliminación durante el plan de reemplazo** - solo aparece en la siguiente ejecución

3. **`replace_triggered_by` es la solución correcta** - pero solo funciona dentro del mismo módulo/configuración

4. **Los límites de módulos importan** - no puedes usar `replace_triggered_by` a través de límites de módulos, incluso con outputs

5. **Co-localizar recursos dependientes** - mantener recursos estrechamente acoplados (como Lambdas y sus permisos) en el mismo módulo

## ¿Qué Pasa con Versiones Antiguas de Terraform?

Si estás atascado en Terraform < 1.2, tienes algunas opciones, aunque ninguna es tan limpia como `replace_triggered_by`:

- **Documentar el comportamiento**: Aceptar el retraso de una ejecución y asegurarte de que tu equipo sepa ejecutar apply dos veces después de reemplazos de Lambda
- **Tainting manual**: Usar `terraform taint` en recursos de permisos cuando sabes que una Lambda será reemplazada
- **Scripts wrapper**: Crear automatización que maneje el proceso de apply de dos pasos
- **Usar Terraform Cloud**: Las características de detección de drift pueden ayudar a detectar estos problemas

Dicho esto, si puedes actualizar a Terraform 1.2+, vale la pena solo por esta característica.

## Monitoreo y Prevención

Después de este incidente, también configuramos alarmas de CloudWatch para detectar problemas de permisos más rápido. Ahora monitoreamos fallos de invocación de Lambda y comparamos conteos esperados vs reales de disparadores de EventBridge. No evitará el problema, pero al menos sabremos inmediatamente si algo sale mal.

## Referencias

- [Documentación de `replace_triggered_by` de Terraform](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle#replace_triggered_by)
- [Stack Overflow: Recreación de permisos Lambda causando downtime](https://stackoverflow.com/questions/67058655/terraform-recreates-api-permissions-for-lambda-on-each-apply-causing-downtime-l)
- [Stack Overflow: Permiso Lambda reemplazado en cada apply](https://stackoverflow.com/questions/59369087/terraform-0-12-aws-lambda-permission-resource-replaced-every-apply)

## Conclusión

La solución `replace_triggered_by` es infraestructura defensiva: protege no solo contra este problema específico, sino contra cualquier escenario futuro donde las Lambdas necesiten ser reemplazadas. Dado lo frecuente que evoluciona la infraestructura (cambios de VPC, actualizaciones de runtime, migraciones de tipo de paquete), esa tranquilidad vale la pena.

Si estás gestionando funciones Lambda con Terraform y disparadores de EventBridge o S3, implementa este patrón antes de encontrarte con problemas de drift. Tu yo futuro te lo agradecerá.
