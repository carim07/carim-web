---
title: "Rompiendo Dependencias Circulares: El Costo Oculto de la Refactorización de Security Groups en Terraform"
date: 2025-11-15T10:00:00-07:00
lastmod: 2025-11-15T10:00:00-07:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "Cómo refactorizar reglas de Security Groups de AWS para arreglar dependencias circulares crea errores de recursos duplicados, y por qué los bloques de import de Terraform no pueden salvarte."

tags: ["Terraform", "AWS", "Security Groups", "DevOps", "IaC", "ECS", "ALB"]
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

A veces la mejor solución a un problema crea un nuevo problema que no esperabas. Esta es una historia sobre arreglar un error de Terraform, solo para descubrir que la solución en sí introduce toda una nueva clase de desafíos de despliegue.

<!--more-->

## La Configuración

Teníamos una arquitectura sencilla: un Application Load Balancer (ALB) reenviando tráfico a un servicio ECS ejecutando nuestra API. Los security groups estaban configurados para permitir el flujo de tráfico entre ellos. Nada especial, solo infraestructura estándar de AWS.

Entonces llegó el error de validación de Terraform:

```
Error: Cycle: aws_security_group.alb_sg, aws_security_group.api_service_sg
```

Una **dependencia circular**. El security group del ALB referenciaba el security group del ECS, y viceversa. Terraform no podía determinar cuál crear primero.

## El Problema: Dependencias Circulares

Así es como se veía el código original:

```hcl
# ALB Security Group
resource "aws_security_group" "alb_sg" {
  vpc_id = var.VPC_ID
  name   = "${var.project}_alb_sg_${local.namespace}"

  # Egress to ECS service
  egress {
    description     = "Forward traffic to ECS service on port 3000"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.api_service_sg.id]  # ← References ECS SG
  }
}

# ECS Service Security Group
resource "aws_security_group" "api_service_sg" {
  vpc_id = var.VPC_ID
  name   = "${var.project}_api_service_sg_${local.namespace}"

  # Ingress from ALB
  ingress {
    description     = "Allow traffic from ALB SG on port 3000"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]  # ← References ALB SG
  }
}
```

El ciclo es claro:
- El security group del ALB necesita el ID del security group del ECS para su regla de egress
- El security group del ECS necesita el ID del security group del ALB para su regla de ingress
- Terraform: "¡No puedo crear ninguno primero!" 🤯

### Visualizando la Dependencia Circular

{{< mermaid >}}
flowchart LR
    ALB[aws_security_group.alb_sg]
    ECS[aws_security_group.api_service_sg]
    
    ALB -->|egress rule references| ECS
    ECS -->|ingress rule references| ALB
    
    style ALB fill:#FFB6C1,stroke:#8B0000,color:#000
    style ECS fill:#FFB6C1,stroke:#8B0000,color:#000
    
    Note["Terraform Error: Cycle detected!"]
    style Note fill:#FFE4B5,stroke:#8B4513,color:#000
{{< /mermaid >}}

## La Solución Estándar: Reglas de Security Group Separadas

Este es un patrón bien documentado en la comunidad de Terraform. En lugar de definir reglas inline dentro del recurso del security group, las extraes en recursos separados `aws_security_group_rule`:

```hcl
# ALB Security Group (no inline rules)
resource "aws_security_group" "alb_sg" {
  vpc_id = var.VPC_ID
  name   = "${var.project}_alb_sg_${local.namespace}"
  
  # No egress rules defined inline
}

# ECS Service Security Group (no inline rules)
resource "aws_security_group" "api_service_sg" {
  vpc_id = var.VPC_ID
  name   = "${var.project}_api_service_sg_${local.namespace}"
  
  # No ingress rules defined inline
}

# Separate rule: ALB → ECS egress
resource "aws_security_group_rule" "alb_egress_to_ecs" {
  type                     = "egress"
  description              = "Forward traffic to ECS service on port 3000"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.alb_sg.id
  source_security_group_id = aws_security_group.api_service_sg.id
}

# Separate rule: ECS ← ALB ingress
resource "aws_security_group_rule" "ecs_ingress_from_alb" {
  type                     = "ingress"
  description              = "Allow traffic from ALB SG on port 3000"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.api_service_sg.id
  source_security_group_id = aws_security_group.alb_sg.id
}
```

**Por qué funciona:**

1. Ambos security groups se crean primero (sin reglas)
2. Luego se crean los recursos de reglas separados
3. Las reglas pueden referenciar ambos security groups porque ya existen
4. ¡Sin dependencia circular!

### La Arquitectura Corregida

{{< mermaid >}}
flowchart TB
    subgraph "Phase 1: Create Security Groups"
        ALB1[aws_security_group.alb_sg]
        ECS1[aws_security_group.api_service_sg]
        
        style ALB1 fill:#90EE90,stroke:#2d5016,color:#000
        style ECS1 fill:#90EE90,stroke:#2d5016,color:#000
    end
    
    subgraph "Phase 2: Create Rules"
        RULE1[aws_security_group_rule.alb_egress_to_ecs]
        RULE2[aws_security_group_rule.ecs_ingress_from_alb]
        
        RULE1 -->|references| ALB1
        RULE1 -->|references| ECS1
        RULE2 -->|references| ALB1
        RULE2 -->|references| ECS1
        
        style RULE1 fill:#90EE90,stroke:#2d5016,color:#000
        style RULE2 fill:#90EE90,stroke:#2d5016,color:#000
    end
{{< /mermaid >}}

¡Perfecto! Hicimos commit de la solución, mergeamos a `develop`, y activamos el pipeline de despliegue.

Entonces llegó el error que motivó toda esta investigación.

## El Nuevo Problema: Reglas Duplicadas

```
Error: [WARN] A duplicate Security Group rule was found on (sg-0123456789abcdef0).
Error: operation error EC2: AuthorizeSecurityGroupIngress, 
https response error StatusCode: 400, RequestID: 34a71c7a-d5ee-464c-aa7a-cd9c70bcd8f6,
api error InvalidPermission.Duplicate: the specified rule 
"peer: sg-0fedcba9876543210, TCP, from port: 3000, to port: 3000, ALLOW" 
already exists

  with aws_security_group_rule.ecs_ingress_from_alb,
  on service.tf line 79, in resource "aws_security_group_rule" "ecs_ingress_from_alb":
  79: resource "aws_security_group_rule" "ecs_ingress_from_alb" {
```

Espera, ¿qué? ¿La regla *ya existe*? ¡Pero acabamos de definirla como un nuevo recurso!

### Lo Que Realmente Pasó

Esto es lo importante sobre las reglas de security group inline versus recursos separados `aws_security_group_rule`: **ambos crean lo mismo en AWS**.

Cuando defines una regla inline:
```hcl
resource "aws_security_group" "example" {
  ingress {
    from_port = 3000
    to_port   = 3000
    protocol  = "tcp"
    security_groups = [aws_security_group.other.id]
  }
}
```

AWS crea una regla de security group. Terraform la gestiona como parte del recurso del security group.

Cuando defines una regla por separado:
```hcl
resource "aws_security_group_rule" "example" {
  security_group_id        = aws_security_group.example.id
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.other.id
}
```

AWS crea... exactamente la misma regla de security group. Terraform la gestiona como un recurso separado.

**El problema:** Cuando refactorizamos de inline a reglas separadas, las reglas reales ya existían en AWS (creadas por la configuración inline). Nuestro nuevo código intentó crearlas de nuevo como recursos separados, y AWS dijo "¡no, esas reglas ya existen!"

### El Problema de Gestión de Estado

Esto es fundamentalmente un **problema de migración de estado de Terraform**, no un problema de AWS. Rastreemos lo que pasó:

{{< mermaid >}}
sequenceDiagram
    participant Dev as Developer
    participant TF as Terraform
    participant State as Terraform State
    participant AWS as AWS

    Note over Dev,AWS: Before Refactoring
    Dev->>TF: terraform apply (inline rules)
    TF->>AWS: Create security groups with inline rules
    AWS->>AWS: Creates sg-xxx with rules
    TF->>State: Track as aws_security_group resources

    Note over Dev,AWS: After Code Refactoring
    Dev->>TF: terraform plan (separate rules)
    TF->>State: Check state
    State-->>TF: Security groups exist (inline rules tracked)
    TF->>TF: Compare with new code
    Note over TF: New code defines<br/>aws_security_group_rule<br/>resources
    TF->>Dev: Plan: Create new rule resources

    Dev->>TF: terraform apply
    TF->>AWS: Create security group rule
    AWS-->>TF: ERROR: Rule already exists!
    
    Note over Dev,AWS: State thinks rules are inline,<br/>AWS has the actual rules,<br/>New code wants separate resources
{{< /mermaid >}}

El archivo de estado todavía rastrea las reglas como parte de los recursos del security group (inline), pero el nuevo código las define como recursos separados. Terraform no se da cuenta de que son lo mismo.

## Solución Intentada #1: Bloques de Import

Mi primer instinto fue usar los bloques de import de Terraform (disponibles en Terraform 1.2+). La idea era decirle a Terraform: "Oye, estos recursos de reglas separados que estás intentando crear? Ya existen. Solo impórtalos al estado."

```hcl
import {
  to = aws_security_group_rule.ecs_ingress_from_alb
  id = "${aws_security_group.api_service_sg.id}_ingress_tcp_3000_3000_${aws_security_group.alb_sg.id}"
}

resource "aws_security_group_rule" "ecs_ingress_from_alb" {
  # ... configuration ...
}
```

¡Elegante! ¡Declarativo! ¿Debería funcionar perfectamente, verdad?

### Por Qué Fallaron los Bloques de Import

**Problema #1: Dependencia Circular (¡De Nuevo!)**

El ID del bloque de import referencia ambos security groups:
- El bloque de import del Archivo A referencia `aws_security_group.alb_sg.id` (del Archivo B)
- El bloque de import del Archivo B referencia `aws_security_group.api_service_sg.id` (del Archivo A)

¡Volvimos a una dependencia circular! El mismo problema que estábamos intentando arreglar.

**Intento de Solución: Usar Data Sources**

```hcl
data "aws_security_group" "existing_alb_sg_for_import" {
  name = "${var.project}_alb_sg_${local.namespace}"
}

import {
  to = aws_security_group_rule.ecs_ingress_from_alb
  id = "${data.aws_security_group.existing_ecs_sg.id}_ingress_tcp_3000_3000_${data.aws_security_group.existing_alb_sg.id}"
}
```

Esto rompió la dependencia circular usando búsquedas de data sources independientes en lugar de referencias de recursos.

**Problema #2: Los Bloques de Import No Soportan Valores Computados**

```
Error: cannot use computed values in import block ID
```

Los bloques de import de Terraform requieren **valores de cadena literales** conocidos en tiempo de plan. No puedes usar:
- Atributos de data sources (computados en tiempo de apply)
- Atributos de recursos (computados en tiempo de apply)  
- Cualquier interpolación que no sea una variable simple

El ID de import debe ser una cadena hardcodeada o una variable simple. No se permiten búsquedas dinámicas.

### El Comentario Útil del Bot de Cursor

Cuando abrí un PR con la solución de bloques de import, el bot de Cursor inmediatamente lo marcó:

> **Bug: Imports Cíclicos Rompen Terraform Plan**
>
> El bloque de import crea una dependencia circular con el bloque de import en `load_balancer.tf`. Este import referencia `aws_security_group.alb_sg.id` del archivo del load balancer, mientras que el import de ese archivo referencia `aws_security_group.api_service_sg.id` de este archivo. Terraform fallará con un error de ciclo al evaluar estos IDs de bloques de import interdependientes durante la fase de plan.

Y después de intentar el enfoque de data source:

> El bloque de import usa atributos de data sources en el campo id, pero los bloques de import de Terraform no pueden usar valores computados - requieren cadenas literales o valores conocidos en tiempo de plan. Esto causará un error "cannot use computed values" durante terraform plan.

¡Gracias al bot por detectar estos problemas antes de que llegaran al despliegue real! 🤖

## La Solución Real: Migración Manual de Estado

Después de todos los intentos de automatizar esto con bloques de import, la realidad es más simple (y algo anticlimática): **solo maneja la migración única manualmente**.

Tienes dos opciones:

### Opción 1: Eliminación Manual (Más Simple)

Esto es lo que hice en el entorno `dev`, y funcionó perfectamente:

1. Abre AWS Console → EC2 → Security Groups
2. Encuentra el security group del servicio ECS
3. Elimina la regla de ingress del ALB en el puerto 3000
4. Encuentra el security group del ALB
5. Elimina la regla de egress al ECS en el puerto 3000
6. Ejecuta `terraform apply` - crea las reglas como recursos separados

**Tiempo:** ~2 minutos  
**Riesgo:** Cero (las reglas se recrean inmediatamente)  
**Downtime:** Ninguno (las reglas existen continuamente)

### Opción 2: Comando de Import Manual

Si prefieres la forma de terraform:

```bash
# Busca los IDs de los security groups
terraform state show 'aws_security_group.api_service_sg'
terraform state show 'aws_security_group.alb_sg'

# Importa las reglas (usando IDs reales)
terraform import \
  'aws_security_group_rule.ecs_ingress_from_alb' \
  'sg-0123456789abcdef0_ingress_tcp_3000_3000_sg-0fedcba9876543210'

terraform import \
  'aws_security_group_rule.alb_egress_to_ecs' \
  'sg-0fedcba9876543210_egress_tcp_3000_3000_sg-0123456789abcdef0'

# Luego aplica normalmente
terraform apply
```

## Por Qué "Solo Elimínalas" Está Bien

Inicialmente dudé en recomendar la eliminación manual porque se sentía como trabajar alrededor de los principios de infraestructura como código. Pero aquí está por qué en realidad es el enfoque correcto:

### 1. Es una Migración de Una Vez

Esto no es una tarea operativa continua. Refactorizas de inline a reglas separadas una vez por security group. Después de eso, todo funciona normalmente.

### 2. Riesgo Cero

El peor escenario:
- Eliminas las reglas en AWS
- Terraform apply falla por alguna razón
- Las reglas faltan por unos minutos hasta que depures y vuelvas a aplicar

Pero en realidad:
- El apply sucede inmediatamente después de la eliminación
- Las reglas se recrean en segundos
- Sin interrupción real del tráfico (las conexiones se establecen, no se verifican las reglas continuamente)

### 3. En Realidad Es Más Rápido

- Eliminación manual: 2 minutos
- Configurar import con todas las variables: 15+ minutos
- Depurar errores de import: 30+ minutos
- Escribir scripts de automatización: Horas

### 4. Sin Downtime Incluso Si No Eliminas

Aquí hay algo importante que descubrí: **si no eliminas las reglas y solo intentas aplicar, nada se rompe**.

El Terraform apply falla con el error de regla duplicada, pero:
- ✅ Las reglas existentes permanecen en su lugar
- ✅ El tráfico continúa fluyendo normalmente
- ✅ Sin interrupción del servicio
- ❌ Solo un error de Terraform que necesitas arreglar

Así que el "fallo" en realidad es solo Terraform siendo incapaz de completar el apply. Tu infraestructura sigue funcionando bien.

Esto significa que puedes hacerlo de forma segura:
1. Intentar el apply en producción
2. Ver el error de duplicado
3. Eliminar las reglas manualmente
4. Re-ejecutar el apply

Sin emergencia, sin incidente, sin presión.

## Conclusiones Clave

1. **Las dependencias circulares en security groups son comunes** - el patrón de reglas separadas está bien establecido por una razón

2. **Refactorizar reglas inline a recursos separados es una migración de estado**, no solo un cambio de código

3. **Los bloques de import tienen limitaciones estrictas**:
   - No pueden usar valores computados
   - No pueden usar atributos de data sources
   - No pueden referenciar atributos de recursos
   - Requieren IDs de cadena literales

4. **A veces el enfoque manual es correcto** - no todo necesita estar automatizado, especialmente migraciones de una vez

5. **Los fallos de Terraform apply no siempre son incidentes de producción** - en este caso, el fallo es seguro y esperado

6. **El error de "regla duplicada" tiene cero impacto en servicios en ejecución** - tu infraestructura sigue funcionando mientras arreglas el estado de Terraform

## ¿Qué Pasa con Futuras Refactorizaciones?

La lección aquí no es "nunca refactorices security groups." Es entender el **camino de migración** cuando lo haces:

- **¿Planeas refactorizar inline → reglas separadas?**  
  Documenta el paso de eliminación manual como parte del plan de despliegue.

- **¿Usando reglas separadas desde el inicio?**  
  ¡No se necesita migración! Evitas todo este problema.

- **¿Ya tienes reglas inline?**  
  Considera si la dependencia circular realmente te está causando problemas. Si no, tal vez déjala como está.

## Referencias

- [Documentación de Bloques de Import de Terraform](https://developer.hashicorp.com/terraform/language/import)
- [Documentación de Reglas de Security Groups de AWS](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html)

## Conclusión

Esta investigación me enseñó que no todos los problemas de infraestructura tienen—o necesitan—una solución de automatización. A veces la mejor respuesta es:

1. Entender la causa raíz
2. Documentar los pasos manuales
3. Ejecutarlos una vez por entorno
4. Continuar con tu vida

Las reglas de security groups ahora funcionan correctamente en todos los entornos. La dependencia circular está arreglada. Y aprendí lecciones valiosas sobre las limitaciones de los bloques de import de Terraform.

---

*¿Has encontrado problemas similares de migración de estado de Terraform? Me encantaría escuchar cómo los manejaste. Encuéntrame en [LinkedIn](https://linkedin.com/in/carimfadil).*

