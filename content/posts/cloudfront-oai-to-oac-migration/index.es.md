---
title: "Por Qué CloudFront Dejó de Leer S3: La Incompatibilidad Entre OAI y KMS que Nadie Advierte"
date: 2025-11-27T10:00:00-07:00
lastmod: 2025-11-27T10:00:00-07:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "Después de habilitar cifrado con Customer Managed Key en los buckets S3, las cuatro aplicaciones web dejaron de funcionar con errores crípticos de KMS. Resulta que Origin Access Identity (OAI) - una característica de AWS de hace una década que todavía se usa en todas partes - simplemente no funciona con SSE-KMS. Aquí está cómo migramos a Origin Access Control (OAC) y lo que AWS no te dice."

tags: ["AWS", "CloudFront", "S3", "KMS", "OAI", "OAC", "Terraform", "DevOps", "Security"]
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

Habíamos configurado proactivamente Trivy para escanear nuestra infraestructura como código, buscando vulnerabilidades de seguridad antes de que se convirtieran en problemas. Un día, los resultados del escaneo llegaron marcados en rojo: buckets S3 sin cifrar. Severidad alta. La solución parecía simple: agregar Customer Managed Keys (CMK) con `kms_master_key_id` a la configuración del bucket S3 y listo. Desplegamos a producción, y todo parecía estar bien. Las aplicaciones siguieron funcionando. ¿Crisis evitada verdad?

No exactamente. Horas más tarde, después de un despliegue rutinario del frontend, cuatro aplicaciones web de producción se cayeron completamente, devolviendo solo páginas de error XML.

Pero aquí está el lado positivo: **nuestro monitoreo de uptime lo detectó inmediatamente**. Sin esperar reportes de clientes, sin respuesta retrasada. Las alarmas se dispararon en el instante en que terminó el despliegue. Y con asistencia de IA, identificamos la causa raíz y la solución en minutos—no horas de depuración a través de documentación de AWS.

<!--more-->

## La Configuración: Un Setup de CloudFront Heredado

Nuestra infraestructura había estado funcionando durante años con este patrón:

```hcl
# El setup clásico CloudFront + S3 que todos usan
resource "aws_cloudfront_origin_access_identity" "webapp_oai" {
  comment = "Web app origin access identity"
}

resource "aws_s3_bucket_policy" "webapp_s3_policy" {
  bucket = aws_s3_bucket.webapp_s3.id
  policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Principal = {
        AWS = aws_cloudfront_origin_access_identity.webapp_oai.iam_arn
      }
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.webapp_s3.arn}/*"
    }]
  })
}

resource "aws_cloudfront_distribution" "webapp" {
  origin {
    domain_name = aws_s3_bucket.webapp_s3.bucket_regional_domain_name
    origin_id   = aws_s3_bucket.webapp_s3.bucket_regional_domain_name

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.webapp_oai.cloudfront_access_identity_path
    }
  }
  # ... resto de la configuración de distribución
}
```

Esto es Origin Access Identity (OAI) - introducido por AWS en 2008 y todavía el predeterminado en innumerables tutoriales, respuestas de StackOverflow y ejemplos de Terraform. Funciona genial... hasta que agregas cifrado.

## El Cambio que Parecía Seguro

Siguiendo las mejores prácticas de seguridad, habilitamos cifrado CMK:

```hcl
resource "aws_s3_bucket_server_side_encryption_configuration" "webapp_s3_sse" {
  bucket = aws_s3_bucket.webapp_s3.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.s3_web_applications_kms_key.key_arn
    }
  }
}
```

Desplegamos a desarrollo. Trivy se pone verde. Desplegamos a producción. Las aplicaciones siguen cargando. Equipo de seguridad feliz. ¿Hora de celebrar?

No exactamente.

## El Despliegue que Rompió Todo

Horas más tarde, desplegamos una actualización rutinaria del frontend. El pipeline de CI/CD construyó los nuevos assets y los sincronizó a S3. **Ahí fue cuando todo se rompió.**

Los nuevos objetos fueron cifrados con nuestro CMK (según la configuración). Pero aquí está el detalle crítico: **las configuraciones de cifrado de S3 solo aplican a objetos nuevos**. Los archivos existentes todavía estaban cifrados con SSE-S3 (el predeterminado), y CloudFront podía leerlos sin problema usando OAI.

Pero en el momento en que subimos archivos nuevos cifrados con KMS, nuestras alarmas se dispararon. Los sitios se cayeron. En segundos, los usuarios comenzaron a reportar páginas en blanco. Los dashboards de monitoreo se iluminaron en rojo. Alguien navegó directamente a la URL de producción y vio esto:

```xml
<Error>
  <Code>KMS.UnrecognizedClientException</Code>
  <Message>No account found for the given parameters</Message>
  <RequestId>88ZKZNYS2N8YYA0D</RequestId>
</Error>
```

## La Investigación

Aquí es donde la IA nos ahorró horas de depuración. En lugar de pasar la tarde profundizando en documentación de AWS y logs de CloudTrail, usamos IA para explorar rápidamente el espacio del problema.

### Fase 1: Los Sospechosos Obvios

Primer instinto: probablemente olvidamos agregar permisos de KMS en algún lugar. Verifiquemos:

```bash
# Verificar política de la clave KMS
aws kms get-key-policy --key-id <key-id> --policy-name default

# Resultado: Service principal de S3 tiene acceso ✅
# Resultado: ARN de OAI tiene permisos de descifrado ✅
```

Todo se veía correcto. S3 podía cifrar, OAI podía descifrar. ¿Entonces por qué el error?

### Fase 2: Entender el Error

`KMS.UnrecognizedClientException` es un error extraño. No dice "Acceso Denegado" - dice que la **cuenta no fue reconocida**. Ese no es un problema de permisos; es un problema de identidad.

Sigamos el flujo de la solicitud:

1. Usuario solicita `https://app.example.com/index.html`
2. CloudFront recibe solicitud
3. CloudFront se autentica a S3 usando OAI
4. S3 recibe solicitud, ve que el objeto está cifrado
5. S3 llama a KMS para descifrar el objeto
6. KMS recibe solicitud de... ¿quién?

Ese es el problema. Cuando S3 llama a KMS, necesita pasar la identidad del llamador. Pero OAI usa un mecanismo de autenticación heredado que no propaga correctamente el contexto principal a KMS.

### Fase 3: Inmersión Profunda en Documentación Asistida por IA

En lugar de buscar manualmente a través de cientos de páginas de documentación de AWS, le preguntamos a la IA sobre el error. En minutos, encontró la información crítica enterrada en la documentación de CloudFront de AWS:

> "Si su bucket S3 usa cifrado del lado del servidor con claves AWS KMS (SSE-KMS), debe usar origin access control (OAC). OAI no funciona con SSE-KMS."

Una oración. Enterrada en una guía de migración. Sin advertencia en los documentos de cifrado S3. Sin error de validación en Terraform. Esto nos habría tomado horas encontrar manualmente. La IA lo encontró en minutos.

### Fase 4: Confirmar la Causa Raíz

La prueba contundente estaba en CloudTrail:

```json
{
  "eventName": "Decrypt",
  "errorCode": "AccessDenied",
  "errorMessage": "User: anonymous is not authorized to perform: kms:Decrypt",
  "userIdentity": {
    "type": "Unknown",
    "invokedBy": "s3.amazonaws.com"
  }
}
```

"User: anonymous" - ese es el problema. La identidad OAI no está siendo reconocida por KMS en absoluto. Está apareciendo como anónimo porque OAI usa un mecanismo de autenticación pre-IAM que KMS simplemente no entiende.

## La Causa Raíz: Una Característica de 15 Años

Origin Access Identity fue diseñado en 2008, antes de que existiera KMS (KMS se lanzó en 2014). OAI usa un mecanismo de autenticación especial específico de CloudFront que:

1. Crea un principal virtual similar a IAM
2. S3 reconoce este principal a través de manejo especial
3. Pero KMS no tiene tal manejo especial

Cuando S3 necesita descifrar un objeto, llama a KMS con la identidad del solicitante. Con OAI, esa identidad no se traduce correctamente: KMS ve un principal no reconocido y lo rechaza.

**Esto no es un problema de configuración. Es una incompatibilidad arquitectónica.**

AWS introdujo Origin Access Control (OAC) en 2022 específicamente para abordar esta limitación. OAC usa firma SigV4 moderna y se integra correctamente con IAM y KMS. Pero nunca deprecaron OAI, nunca agregaron advertencias, y la documentación y tutoriales antiguos todavía lo recomiendan.

## La Solución: Migrar a Origin Access Control (OAC)

### Paso 1: Crear el Origin Access Control

```hcl
resource "aws_cloudfront_origin_access_control" "webapp_oac" {
  name                              = "webapp-oac-${var.environment}"
  description                       = "Web app Origin Access Control - ${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"  # ¡Autenticación moderna!
}
```

Diferencias clave de OAI:
- `signing_protocol = "sigv4"` - Usa AWS Signature Version 4
- `signing_behavior = "always"` - Firma cada solicitud
- Se integra correctamente con IAM y KMS

### Paso 2: Actualizar la Distribución CloudFront

```hcl
resource "aws_cloudfront_distribution" "webapp" {
  origin {
    domain_name = aws_s3_bucket.webapp_s3.bucket_regional_domain_name
    origin_id   = aws_s3_bucket.webapp_s3.bucket_regional_domain_name

    # ANTIGUO - Eliminar este bloque:
    # s3_origin_config {
    #   origin_access_identity = aws_cloudfront_origin_access_identity.webapp_oai.cloudfront_access_identity_path
    # }

    # NUEVO - Agregar esto en su lugar:
    origin_access_control_id = aws_cloudfront_origin_access_control.webapp_oac.id
  }
  # ... resto de la configuración de distribución
}
```

Nota: No puedes usar `s3_origin_config` y `origin_access_control_id` al mismo tiempo - son mutuamente excluyentes.

### Paso 3: Actualizar la Política del Bucket S3

Este es el cambio más significativo. OAC usa el **service principal** de CloudFront en lugar de un ARN de IAM:

```hcl
data "aws_iam_policy_document" "webapp_s3_policy_data" {
  statement {
    effect = "Allow"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.webapp_s3.arn}/*"]
    
    # ANTIGUO - OAI usa ARN de IAM:
    # principals {
    #   type        = "AWS"
    #   identifiers = [aws_cloudfront_origin_access_identity.webapp_oai.iam_arn]
    # }

    # NUEVO - OAC usa service principal con condición:
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.webapp.arn]
    }
  }
}
```

La condición es crucial: asegura que solo TU distribución CloudFront pueda acceder al bucket, no cualquier distribución CloudFront.

### Paso 4: Actualizar la Política de la Clave KMS

Agrega el service principal de CloudFront a tu clave KMS:

```hcl
module "s3_web_applications_kms_key" {
  source = "./modules/kms"

  services = [
    {
      name    = "s3.amazonaws.com"
      actions = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"]
    },
    {
      # Service principal de CloudFront para OAC
      name = "cloudfront.amazonaws.com"
      actions = ["kms:Decrypt", "kms:DescribeKey"]
    }
  ]
}
```

Nota: CloudFront solo necesita `Decrypt` - nunca cifra objetos.

## El Flujo de Mensajes

### Antes: OAI (Roto con KMS)

{{< mermaid >}}
sequenceDiagram
    participant Usuario
    participant CloudFront
    participant S3
    participant KMS
    
    Usuario->>CloudFront: GET /index.html
    CloudFront->>S3: GetObject (credenciales OAI)
    S3->>KMS: Decrypt (principal: ???)
    Note over KMS: Identidad OAI no reconocida
    KMS-->>S3: UnrecognizedClientException ❌
    S3-->>CloudFront: Error
    CloudFront-->>Usuario: Página de Error XML
{{< /mermaid >}}

### Después: OAC (Funciona con KMS)

{{< mermaid >}}
sequenceDiagram
    participant Usuario
    participant CloudFront
    participant S3
    participant KMS
    
    Usuario->>CloudFront: GET /index.html
    CloudFront->>S3: GetObject (firmado SigV4)
    S3->>KMS: Decrypt (principal: cloudfront.amazonaws.com)
    Note over KMS: Service principal reconocido ✅
    KMS-->>S3: Clave de descifrado
    S3-->>CloudFront: Objeto descifrado
    CloudFront-->>Usuario: contenido index.html
{{< /mermaid >}}

## Pruebas y Verificación

Después de desplegar la migración OAC:

```bash
# 1. Verificar que la distribución está usando OAC
aws cloudfront get-distribution --id <dist-id> \
  --query "Distribution.DistributionConfig.Origins.Items[0].OriginAccessControlId"

# 2. Verificar que la política del bucket S3 tiene el principal correcto
aws s3api get-bucket-policy --bucket <bucket-name> | jq '.Policy | fromjson'

# 3. Verificar que la política de la clave KMS incluye cloudfront.amazonaws.com
aws kms get-key-policy --key-id <key-id> --policy-name default

# 4. Probar acceso (debería devolver 200, no error XML)
curl -I https://your-app.example.com/

# 5. Verificar CloudTrail para descifrado KMS exitoso
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=Decrypt \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
```

**Criterios de éxito:**
- El sitio web carga sin errores XML
- CloudTrail muestra eventos `Decrypt` exitosos
- Las métricas de KMS no muestran errores de `AccessDenied`
- Los logs de acceso de S3 muestran respuestas `200`

## La Solución Completa en Terraform

Aquí está el patrón de migración completo para una aplicación web:

```hcl
#######################################
# Origin Access Control (OAC) - NUEVO
#######################################

resource "aws_cloudfront_origin_access_control" "webapp_oac" {
  name                              = "${var.project}-webapp-oac-${var.environment}"
  description                       = "Web app Origin Access Control - ${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

#######################################
# Origin Access Identity (OAI) - DEPRECADO
# Mantener temporalmente para capacidad de rollback
#######################################

resource "aws_cloudfront_origin_access_identity" "webapp_oai" {
  comment = "DEPRECATED - Web app OAI - ${var.environment}"
}

#######################################
# Política del Bucket S3 - Actualizada para OAC
#######################################

data "aws_iam_policy_document" "webapp_s3_policy" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.webapp_s3.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.webapp.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "webapp_s3_policy" {
  bucket = aws_s3_bucket.webapp_s3.id
  policy = data.aws_iam_policy_document.webapp_s3_policy.json
}

#######################################
# Distribución CloudFront - Usando OAC
#######################################

resource "aws_cloudfront_distribution" "webapp" {
  enabled         = true
  is_ipv6_enabled = true

  origin {
    origin_id   = aws_s3_bucket.webapp_s3.bucket_regional_domain_name
    domain_name = aws_s3_bucket.webapp_s3.bucket_regional_domain_name

    # OAC en lugar de s3_origin_config
    origin_access_control_id = aws_cloudfront_origin_access_control.webapp_oac.id
  }

  default_cache_behavior {
    target_origin_id       = aws_s3_bucket.webapp_s3.bucket_regional_domain_name
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # ... resto de tu configuración de distribución
}

#######################################
# Clave KMS - Con Service Principal de CloudFront
#######################################

module "s3_web_applications_kms_key" {
  source = "./modules/kms"

  alias_name  = "/alias/${var.project}/s3/web-applications/${var.environment}"
  description = "KMS key for S3 web application buckets"

  services = [
    {
      name    = "s3.amazonaws.com"
      actions = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
    },
    {
      name    = "cloudfront.amazonaws.com"
      actions = ["kms:Decrypt", "kms:DescribeKey"]
    }
  ]
}
```

## Puntos Clave

1. **Las configuraciones de cifrado de S3 solo afectan objetos nuevos:**
   - Cambiar el cifrado del bucket no re-cifra archivos existentes
   - Por eso nuestras aplicaciones siguieron funcionando después de habilitar CMK
   - Solo las nuevas subidas dispararon la incompatibilidad OAI/KMS
   - Siempre prueba con despliegues reales, no solo cambios de infraestructura

2. **La IA acelera dramáticamente la respuesta a incidentes:**
   - Lo que podría haber sido horas de depuración tomó minutos
   - La IA encontró rápidamente la incompatibilidad OAI/SSE-KMS
   - Acceso inmediato a documentación y soluciones relevantes
   - Tiempo de caída de producción medido en minutos, no horas

3. **OAI y SSE-KMS son fundamentalmente incompatibles:**
   - No es un problema de permisos - es una limitación arquitectónica
   - OAI es anterior a KMS por 6 años
   - Ninguna cantidad de cambios en políticas KMS lo arreglará
   - AWS no te advertirá sobre esto

4. **OAC es el reemplazo moderno:**
   - Usa firma SigV4 (integración IAM adecuada)
   - Funciona con SSE-KMS, SSE-S3, y SSE-C
   - Recomendado por AWS desde 2022
   - Mejor seguridad (acceso basado en condiciones)

5. **La política del bucket S3 cambia significativamente:**
   - OAI: Principal ARN de IAM
   - OAC: Service principal + condición
   - La condición previene que otras distribuciones CloudFront accedan a tu bucket

6. **La política de la clave KMS necesita el service principal de CloudFront:**
   - Agregar `cloudfront.amazonaws.com` con permisos de descifrado
   - Esto permite que la autenticación SigV4 funcione con KMS

7. **Mantén los recursos OAI durante la migración:**
   - No elimines inmediatamente
   - Útil para rollback si surgen problemas
   - Eliminar en PR de seguimiento después de validación

8. **Prueba con despliegues reales, no solo infraestructura:**
   - Los cambios de infraestructura sin objetos nuevos no dispararán el problema
   - Despliega tu aplicación a staging después de cambios de cifrado
   - Verifica que los archivos recién subidos puedan servirse correctamente
   - Esto habría detectado nuestro problema antes de producción

## Lista de Verificación de Migración

Si estás migrando de OAI a OAC:

**Pre-Migración:**
- [ ] Identificar todas las distribuciones CloudFront usando OAI
- [ ] Identificar todos los buckets S3 con cifrado SSE-KMS
- [ ] Revisar políticas de claves KMS
- [ ] Planear ventana de mantenimiento (si es producción)

**Cambios de Infraestructura:**
- [ ] Crear recurso `aws_cloudfront_origin_access_control`
- [ ] Actualizar origen de CloudFront para usar `origin_access_control_id`
- [ ] Eliminar bloque `s3_origin_config`
- [ ] Actualizar política de bucket S3 para usar service principal
- [ ] Agregar condición `AWS:SourceArn` a política de bucket
- [ ] Agregar `cloudfront.amazonaws.com` a política de clave KMS
- [ ] Mantener recurso OAI (marcado como deprecado)

**Pruebas:**
- [ ] Desplegar a entorno no-producción
- [ ] Verificar que el sitio web carga sin errores
- [ ] Verificar CloudTrail para operaciones KMS exitosas
- [ ] Monitorear CloudWatch para errores
- [ ] Validar que el comportamiento de caché sigue funcionando
- [ ] Probar invalidación de caché
- [ ] Verificar que las páginas de error personalizadas funcionan

**Post-Migración:**
- [ ] Monitorear producción por 24-48 horas
- [ ] Eliminar recursos OAI deprecados (PR separado)
- [ ] Actualizar documentación
- [ ] Compartir aprendizajes con el equipo

## Por Qué AWS No Te Advierte

Esta es la parte frustrante. AWS podría:

1. Agregar un error de validación en CloudFront cuando se configura OAI + SSE-KMS
2. Actualizar el provider de AWS de Terraform para advertir sobre esta combinación
3. Agregar advertencias prominentes en documentación de cifrado S3
4. Deprecar OAI por completo (tiene más de 15 años)

Pero no lo han hecho. La única mención está enterrada en guías de migración que asumen que ya estás buscando migrar. Si estás configurando nueva infraestructura siguiendo tutoriales antiguos, te encontrarás con este muro.

## Referencias

- [Documentación de OAC de AWS CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [Migración de OAI a OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html#migrate-from-oai-to-oac)
- [Documentación de S3 SSE-KMS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html)
- [Terraform aws_cloudfront_origin_access_control](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control)
- [Blog de AWS: Anuncio de OAC (Agosto 2022)](https://aws.amazon.com/blogs/networking-and-content-delivery/amazon-cloudfront-introduces-origin-access-control-oac/)

## Concluyendo

Sí, causamos una caída en producción. Pero duró minutos, no horas. ¿Por qué? Porque la IA nos ayudó a diagnosticar el problema casi inmediatamente, y sabíamos exactamente qué necesitábamos arreglar.

Esta migración llevó nuestras cuatro aplicaciones web de rotas a completamente funcionales, mientras lográbamos la postura de seguridad que buscábamos. ¿El resultado? **Cero vulnerabilidades críticas o de alta severidad detectadas por Trivy en nuestra infraestructura como código**. Y ganamos cifrado de clase mundial con Customer Managed Keys en el proceso.

### Las Lecciones Críticas

1. **Las configuraciones de cifrado de S3 solo aplican a objetos nuevos.** Los objetos existentes mantienen su cifrado original. Por eso nuestras aplicaciones siguieron funcionando después de habilitar CMK - hasta que desplegamos archivos nuevos. Si hubiéramos desplegado a staging después de cambiar el mecanismo de cifrado, habríamos detectado esto antes de producción.

2. **La IA aceleró nuestra depuración de horas a minutos.** En lugar de buscar manualmente en documentación y logs de CloudTrail, la IA encontró la incompatibilidad OAI/OAC inmediatamente. Este es el poder de DevOps asistido por IA.

3. **Cuando AWS introduce una nueva característica para reemplazar una heredada y no depreca la antigua, sospecha.** En este caso, OAC (2022) reemplazó a OAI (2008) específicamente por compatibilidad con KMS - un detalle poco documentado.

Si estás ejecutando CloudFront + S3 con OAI y planeando habilitar cifrado CMK, espero que este post te ayude a evitar la misma caída. La secuencia importa: migra a OAC primero, luego habilita el cifrado. Y siempre prueba con despliegues reales en staging, no solo cambios de infraestructura.

---

*¿Te resultó útil? Contáctame en [LinkedIn](https://linkedin.com/in/carimfadil).*

