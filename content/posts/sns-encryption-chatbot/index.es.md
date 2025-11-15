---
title: "Cuando el cifrado rompe tus notificaciones de Slack: una historia de KMS, SNS y AWS Chatbot"
date: 2025-11-10T10:00:00-07:00
lastmod: 2025-11-10T10:00:00-07:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "Añadí cifrado KMS a SNS por cumplimiento y detecté un fallo en dev antes de prod. AWS Chatbot necesita TRES distintos service principals en la política KMS."

tags: ["AWS", "SNS", "KMS", "ChatBot", "Terraform", "DevOps", "Security"]
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

Comenzó de manera bastante inocente: un escaneo de seguridad de Trivy marcó 9 vulnerabilidades de alta severidad en nuestra configuración de Terraform. ¿El problema? Tópicos de SNS sin cifrar. La solución parecía sencilla: agregar una clave KMS, cifrar los tópicos, desplegar a dev para validación. ¿Qué podría salir mal?

<!--more-->

## La Configuración

```hcl
# Antes: Tópico SNS sin cifrar
resource "aws_sns_topic" "application_alarms" {
  name = "application-alarms-${var.environment}"
  # Sin cifrado - vulnerabilidad de seguridad de Trivy
}

# Después: Tópico SNS cifrado
resource "aws_sns_topic" "application_alarms" {
  name              = "application-alarms-${var.environment}"
  kms_master_key_id = module.sns_kms.key_arn  # ✅ ¡Cifrado!
}
```

El PR pasó la revisión de código, las pruebas pasaron, y desplegamos al entorno de desarrollo. El escaneo de Trivy se puso verde. ¡Victoria!

Pero antes de promover a producción, quería validar el cambio adecuadamente. Menos mal que lo hice: después de esperar un día para observar el entorno de dev, noté algo preocupante: ninguna notificación de alarma de CloudWatch estaba apareciendo en nuestro canal de Slack. La infraestructura se veía bien, pero el silencio era sospechoso.

## La Investigación

### Fase 1: Todo Parece Estar Bien

Las verificaciones iniciales no mostraron problemas obvios:

- ✅ Las alarmas de CloudWatch se estaban activando
- ✅ Los tópicos de SNS existían y estaban configurados correctamente
- ✅ AWS Chatbot estaba conectado a nuestro workspace de Slack
- ✅ Las suscripciones de SNS estaban activas

Pero las notificaciones no llegaban a Slack. Era hora de profundizar.

### Fase 2: Las Métricas de SNS

Verificar las métricas de SNS reveló algo interesante:

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/SNS \
  --metric-name NumberOfNotificationsDelivered \
  --dimensions Name=TopicName,Value=application-alarms-dev \
  --statistics Sum
```

**Resultado:** 0 entregas cuando las alarmas de CloudWatch se activaron. Pero cuando publicamos manualmente un mensaje de prueba:

```bash
aws sns publish \
  --topic-arn arn:aws:sns:us-west-2:123456789:application-alarms-dev \
  --message "Test message"
```

**Resultado:** ¡Mensaje entregado exitosamente! Las métricas de SNS mostraron 1 entrega exitosa.

Entonces SNS podía entregar mensajes, pero las alarmas de CloudWatch no podían llegar a SNS. La trama se complica.

### Fase 3: Los Logs de CloudWatch Cuentan la Verdad

Habilitamos CloudWatch Logs para AWS Chatbot y activamos otra prueba:

```json
{
  "message": "Event received is not supported",
  "eventType": "CloudWatchAlarm"
}
```

Espera, ¿Chatbot estaba recibiendo mensajes pero rechazándolos? Intentemos activar la alarma real de CloudWatch:

**Resultado:** Sin logs en absoluto. Los mensajes nunca llegaron a Chatbot.

Esto lo redujo a: CloudWatch no podía publicar al tópico SNS cifrado.

## La Causa Raíz: Tres Permisos Faltantes

El problema no era solo un permiso faltante: eran **tres** problemas separados:

### Problema 1: CloudWatch No Puede Publicar a SNS Cifrado

Cuando cifras un tópico de SNS con KMS, CloudWatch Alarms necesita permiso explícito para usar esa clave. Esto está documentado, pero es fácil de pasar por alto:

```hcl
# Lo que teníamos (incorrecto):
services = [{
  name = "sns.amazonaws.com"
  actions = ["kms:Decrypt", "kms:GenerateDataKey"]
}]

# Lo que necesitábamos:
services = [
  {
    name = "sns.amazonaws.com"
    actions = ["kms:Decrypt", "kms:GenerateDataKey"]
  },
  {
    name = "cloudwatch.amazonaws.com"  # ← ¡Faltaba!
    actions = ["kms:Decrypt", "kms:GenerateDataKey"]
  }
]
```

**¿Por qué?** CloudWatch cifra los datos de alarma antes de enviarlos a SNS. Sin permisos de KMS, no puede cifrar, así que no puede publicar.

### Problema 2: AWS Chatbot Usa Dos Roles Diferentes

Este nos tomó por sorpresa. AWS Chatbot en realidad usa **dos roles IAM separados**:

1. **Rol del Canal** - Configurado en la consola de Chatbot
   - Usado para: Consultar CloudWatch, describir recursos
   - Ejemplo: `aws-chatbot-notifications-{env}`

2. **Rol Service-Linked** - Auto-creado por AWS
   - Usado para: Suscripción SNS y descifrado de mensajes
   - Siempre: `AWSServiceRoleForAWSChatbot`

¡Habíamos otorgado permisos de KMS al rol del canal, pero las suscripciones de SNS usan el rol service-linked!

```bash
# Verificar quién está realmente suscrito:
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-west-2:123456789:application-alarms-dev

# Resultado:
{
  "SubscriptionArn": "...",
  "Principal": "arn:aws:iam::123456789:role/aws-service-role/management.chatbot.amazonaws.com/AWSServiceRoleForAWSChatbot"
}
```

¡No el rol al que otorgamos permisos!

### Problema 3: Permisos Sobre-Privilegiados

Mientras arreglábamos los dos primeros problemas, notamos que habíamos otorgado `kms:GenerateDataKey` a ambos roles de Chatbot. Pero Chatbot solo descifra mensajes: nunca cifra nada. Esto viola el principio de menor privilegio.

## La Solución

### Paso 1: Crear la Política de Clave KMS

```hcl
module "sns_kms" {
  source = "./modules/kms"

  alias_name  = "/alias/${var.project}/sns/${var.environment}"
  description = "Clave KMS usada para cifrar/descifrar tópicos SNS"
  
  # Service principals que pueden usar esta clave
  services = [
    {
      # SNS necesita cifrar mensajes en reposo
      name = "sns.amazonaws.com"
      actions = ["kms:Decrypt", "kms:GenerateDataKey"]
    },
    {
      # CloudWatch necesita cifrar mensajes de alarma
      name = "cloudwatch.amazonaws.com"
      actions = ["kms:Decrypt", "kms:GenerateDataKey"]
    }
  ]

  # AWS principals (roles IAM) que pueden usar esta clave
  additional_principals = [{
    type = "AWS"
    identifiers = [
      # Rol del canal de Chatbot (para consultas de CloudWatch)
      aws_iam_role.chatbot_notifications.arn,
      # Rol service-linked de Chatbot (para suscripciones SNS)
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/management.chatbot.amazonaws.com/AWSServiceRoleForAWSChatbot"
    ]
    actions = [
      "kms:Decrypt",      # Requerido
      "kms:DescribeKey"   # Opcional pero útil
      # NO kms:GenerateDataKey - ¡Chatbot no cifra!
    ]
  }]
}
```

### Paso 2: Crear el Rol IAM de Chatbot en Terraform

Anteriormente, habíamos creado esto manualmente en la consola. Era hora de codificarlo:

```hcl
resource "aws_iam_role" "chatbot_notifications" {
  name               = "aws-chatbot-notifications-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.chatbot_assume_role.json
}

data "aws_iam_policy_document" "chatbot_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["chatbot.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

# Acceso de solo lectura a CloudWatch
resource "aws_iam_role_policy" "chatbot_cloudwatch_readonly" {
  name   = "CloudWatchReadOnlyAccess"
  role   = aws_iam_role.chatbot_notifications.id
  policy = data.aws_iam_policy_document.chatbot_cloudwatch_readonly.json
}

# Descifrado KMS para mensajes SNS
resource "aws_iam_role_policy" "chatbot_kms_decrypt" {
  name   = "SNSKMSDecryptAccess"
  role   = aws_iam_role.chatbot_notifications.id
  policy = data.aws_iam_policy_document.chatbot_kms_decrypt.json
}

data "aws_iam_policy_document" "chatbot_kms_decrypt" {
  statement {
    sid    = "AllowDecryptSNSMessages"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:DescribeKey"
    ]
    resources = [module.sns_kms.key_arn]
  }
}
```

### Paso 3: Configuración Manual (El Problema)

Aquí es donde se vuelve frustrante: **las configuraciones de AWS Chatbot no pueden ser gestionadas por Terraform** (a partir de finales de 2024). Tienes que actualizarlas manualmente en la consola:

1. Navegar a AWS Chatbot → Slack → Tu Workspace
2. Hacer clic en tu configuración de canal
3. Actualizar el Rol IAM para usar el rol gestionado por Terraform
4. **Crítico:** Asegúrate de que la app de AWS Chatbot de Slack esté instalada en tu workspace
5. **Crítico:** Agrega el bot `@AWS Chatbot` a tu canal de Slack

¿Faltan los pasos 4 o 5? Fallos silenciosos. Sin errores, sin logs, simplemente... nada.

## El Flujo de Mensajes

Cuando todo está configurado correctamente:

{{< mermaid >}}
graph TB
    A[CloudWatch Alarm] -->|kms:GenerateDataKey| B[KMS Key]
    B --> C[Encrypted Message]
    C --> D[SNS Topic<br/>encrypted at rest]
    D --> E[SNS delivers to subscriber]
    E --> F[AWSServiceRoleForAWSChatbot]
    F -->|kms:Decrypt| B
    B --> G[Decrypted Message]
    G --> H[AWS Chatbot Channel<br/>aws-chatbot-notifications-env]
    H --> I[Slack Channel]

    style B fill:#FFD700,stroke:#FF8C00,color:#000
    style D fill:#90EE90,stroke:#2d5016,color:#000
    style F fill:#87CEEB,stroke:#4682B4,color:#000
    style H fill:#87CEEB,stroke:#4682B4,color:#000
    style I fill:#E01E5A,stroke:#611f69,color:#fff
{{< /mermaid >}}

## Pruebas y Verificación

Después de desplegar la solución:

```bash
# 1. Verificar que la política KMS incluye todos los principals
aws kms get-key-policy \
  --key-id <key-id> \
  --policy-name default

# 2. Activar una alarma de prueba
aws cloudwatch set-alarm-state \
  --alarm-name "your-alarm-name" \
  --state-value ALARM \
  --state-reason "Testing encryption fix"

# 3. Verificar logs de Chatbot para procesamiento
aws logs tail /aws/chatbot/your-config-name --follow

# 4. Verificar que se recibió la notificación de Slack
```

**Criterios de éxito:**

- CloudWatch Logs muestra: "Sending message to Slack"
- Las métricas de SNS muestran entrega exitosa
- El canal de Slack recibe la notificación

## Puntos Clave

1. **SNS cifrado requiere TRES service principals:**
   - `sns.amazonaws.com` - para cifrar mensajes en reposo
   - `cloudwatch.amazonaws.com` - para publicar alarmas cifradas
   - Ambos roles de Chatbot - para descifrar mensajes

2. **AWS Chatbot usa dos roles diferentes:**
   - Rol del canal (configurado en consola)
   - Rol service-linked (usado por suscripciones SNS)
   - Ambos necesitan permisos de descifrado KMS

3. **El menor privilegio importa:**
   - Chatbot solo necesita `kms:Decrypt`
   - No `kms:GenerateDataKey` (no cifra)
   - Sobre-privilegiar aumenta la superficie de ataque

4. **Los pasos manuales son inevitables:**
   - Las configuraciones de Chatbot no están en Terraform
   - La app de Slack debe estar instalada
   - El bot debe estar agregado a los canales
   - Documenta estos pasos para tu equipo

5. **Prueba exhaustivamente en no-producción:**
   - Publicación manual de SNS ≠ alarma de CloudWatch
   - Diferentes rutas de código, diferentes permisos
   - Siempre prueba con disparadores reales antes de promover
   - Espera para observar el comportamiento, no te apresures a prod

6. **CloudWatch Logs es tu amigo:**
   - Habilita logging para Chatbot en dev
   - Revela problemas de formato de mensaje temprano
   - Muestra errores reales (no solo "sin notificaciones")
   - Crítico para depurar problemas de cifrado

## Las Consecuencias

Después de desplegar esta solución a desarrollo y validar exhaustivamente:

- ✅ Notificaciones de Slack funcionando correctamente
- ✅ Cumplimiento de seguridad logrado (SNS cifrado)
- ✅ Infraestructura como código (rol IAM de Chatbot)
- ✅ Permisos de menor privilegio (eliminado GenerateDataKey innecesario)
- ✅ Validado en dev antes del despliegue a producción

## Para Referencia Futura

Si estás agregando cifrado KMS a tópicos SNS usados con AWS Chatbot:

**Lista de verificación:**

- [ ] Agregar `cloudwatch.amazonaws.com` a la política KMS
- [ ] Agregar `sns.amazonaws.com` a la política KMS
- [ ] Agregar rol del canal de Chatbot a la política KMS
- [ ] Agregar `AWSServiceRoleForAWSChatbot` a la política KMS
- [ ] Otorgar solo `kms:Decrypt` a los roles de Chatbot
- [ ] Crear rol IAM de Chatbot en Terraform
- [ ] Actualizar configuración de consola de Chatbot para usar nuevo rol
- [ ] Verificar que la app de Slack esté instalada en el workspace
- [ ] Verificar que el bot esté agregado a los canales de Slack
- [ ] Probar con alarma real de CloudWatch
- [ ] Verificar CloudWatch Logs para Chatbot
- [ ] Verificar que las métricas de SNS muestren entrega
- [ ] Confirmar que se recibieron notificaciones de Slack

## Referencias

- [Políticas de Clave KMS de AWS](https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html)
- [Roles IAM de AWS Chatbot](https://docs.aws.amazon.com/chatbot/latest/adminguide/chatbot-iam.html)
- [Cifrado SNS con KMS](https://docs.aws.amazon.com/sns/latest/dg/sns-server-side-encryption.html)
- [Alarmas de CloudWatch con SNS Cifrado](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)

## Conclusión

Esta experiencia reforzó que agregar cifrado no es solo activar un interruptor: se trata de entender todo el flujo de mensajes y todos los servicios involucrados. La arquitectura de doble rol de AWS Chatbot es una particularidad que no está bien documentada.

Si estás gestionando notificaciones de Slack vía AWS Chatbot y planeas cifrar tus tópicos SNS, espero que este post te ahorre tiempo de depuración. Siempre prueba con alarmas reales de CloudWatch en un entorno no productivo, no solo publicaciones manuales a SNS.

---

*¿Te resultó útil? Contáctame en [LinkedIn](https://linkedin.com/in/carimfadil).*
